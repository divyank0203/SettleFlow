import dotenv from "dotenv";
dotenv.config();

import Groq from "groq-sdk";
import { z } from "zod";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const EXPENSE_CATEGORIES = [
  "food",
  "travel",
  "rent",
  "utilities",
  "shopping",
  "entertainment",
  "college",
  "other",
];

const ExpenseItemSchema = z.object({
  payerName: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.enum(EXPENSE_CATEGORIES),
});

const ParsedExpensesSchema = z.object({
  expenses: z.array(ExpenseItemSchema),
});

const expenseJsonSchema = {
  type: "object",
  properties: {
    expenses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          payerName: {
            type: "string",
            description:
              "Name of the person who paid for the expense.",
          },
          amount: {
            type: "number",
            description: "Positive numeric expense amount.",
          },
          description: {
            type: "string",
            description: "Short description of the expense.",
          },
          category: {
            type: "string",
            enum: EXPENSE_CATEGORIES,
            description: "Expense category.",
          },
        },
        required: [
          "payerName",
          "amount",
          "description",
          "category",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["expenses"],
  additionalProperties: false,
};

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  return groq;
}

/**
 * Converts natural language into structured expenses.
 */
export async function parseNaturalLanguageExpenses({
  text,
  members,
  currentUserName,
}) {
  if (!text?.trim()) {
    throw new Error("Expense text is required");
  }

  if (!members || members.length === 0) {
    throw new Error("Group members are required");
  }

  const memberNames = members.map((member) => member.name);

  const systemPrompt = `
You are the natural-language expense extraction engine for SettleFlow.

Convert the user's casual expense description into structured expense records.

RULES:

1. Only use payer names that exist in the provided group members.
2. If the user says "I" or "me", use the current user's name.
3. Never invent a payer.
4. Extract every clearly identifiable expense.
5. Amount must be a positive number.
6. Keep descriptions short and readable.
7. Category MUST be exactly one of:
   food
   travel
   rent
   utilities
   shopping
   entertainment
   college
   other
8. If category is unclear, use "other".
9. Do not calculate individual splits.
10. Ignore text that does not clearly describe an expense.
11. Do not return explanations or extra text.

Current user:
${currentUserName}

Valid group members:
${memberNames.join(", ")}
`;

  const response = await getGroqClient().chat.completions.create({
    model: "openai/gpt-oss-20b",

    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: text,
      },
    ],

    temperature: 0,

    response_format: {
      type: "json_schema",
      json_schema: {
        name: "settleflow_expenses",
        strict: true,
        schema: expenseJsonSchema,
      },
    },
  });

  const content =
    response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response");
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error("Invalid Groq JSON:", content);
    throw new Error("Groq returned invalid structured data");
  }

  // Schema validation
  const validated = ParsedExpensesSchema.parse(parsed);

  // Application-level validation
  const validExpenses = [];

  for (const expense of validated.expenses) {
    const matchedMember = members.find(
      (member) =>
        member.name.trim().toLowerCase() ===
        expense.payerName.trim().toLowerCase()
    );

    // Never allow the model to invent a member.
    if (!matchedMember) {
      continue;
    }

    if (
      !Number.isFinite(expense.amount) ||
      expense.amount <= 0
    ) {
      continue;
    }

    validExpenses.push({
      payerName: matchedMember.name,
      amount: Number(expense.amount.toFixed(2)),
      description: expense.description.trim(),
      category: expense.category,
    });
  }

  return validExpenses;
}

/**
 * Categorize a manually entered expense.
 */
export async function categorizeExpense(description) {
  if (!description?.trim()) {
    return "other";
  }

  const categorySchema = {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: EXPENSE_CATEGORIES,
      },
    },
    required: ["category"],
    additionalProperties: false,
  };

  const response = await getGroqClient().chat.completions.create({
    model: "openai/gpt-oss-20b",

    messages: [
      {
        role: "system",
        content: `
Classify the expense into exactly one category:

food
travel
rent
utilities
shopping
entertainment
college
other

Use "other" when uncertain.
`,
      },
      {
        role: "user",
        content: description,
      },
    ],

    temperature: 0,

    response_format: {
      type: "json_schema",
      json_schema: {
        name: "expense_category",
        strict: true,
        schema: categorySchema,
      },
    },
  });

  const content =
    response.choices?.[0]?.message?.content;

  if (!content) {
    return "other";
  }

  try {
    const parsed = JSON.parse(content);

    if (
      EXPENSE_CATEGORIES.includes(parsed.category)
    ) {
      return parsed.category;
    }

    return "other";
  } catch {
    return "other";
  }
}

/**
 * Explain settlement transfers.
 */
export async function explainSettlements(
  transfers,
  usersMap
) {
  if (!transfers || transfers.length === 0) {
    return "No settlements are required. Everyone is already balanced.";
  }

  const prompt = `
You are explaining a group expense settlement.

Users:
${JSON.stringify(usersMap, null, 2)}

Transfers:
${JSON.stringify(transfers, null, 2)}

Explain:
1. Who pays whom.
2. Why these transfers settle the balances.
3. Why the number of transfers is compact.

Use only the supplied information.
Do not invent any transactions.
Keep the response concise.
`;

  const response =
    await getGroqClient().chat.completions.create({
      model: "openai/gpt-oss-20b",

      messages: [
        {
          role: "system",
          content:
            "You explain financial settlements accurately and concisely.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.2,
    });

  return (
    response.choices?.[0]?.message?.content?.trim() ||
    "Unable to generate settlement explanation."
  );
}

/**
 * Generate monthly spending insights.
 */
export async function generateInsightsSummary(stats) {
  const prompt = `
Analyze these SettleFlow spending statistics:

${JSON.stringify(stats, null, 2)}

Provide:
- the highest spending category,
- an important spending pattern,
- one practical observation.

Use only the supplied numbers.
Do not invent data.
Keep the answer concise.
`;

  const response =
    await getGroqClient().chat.completions.create({
      model: "openai/gpt-oss-20b",

      messages: [
        {
          role: "system",
          content:
            "You are a concise expense analysis assistant. Only use supplied data.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.2,
    });

  return (
    response.choices?.[0]?.message?.content?.trim() ||
    "Unable to generate insights."
  );
}