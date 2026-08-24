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
  amount: z.coerce.number().positive(),
  description: z.string().min(1),
  category: z.string().min(1),
});

const ParsedExpensesSchema = z.object({
  expenses: z.array(ExpenseItemSchema),
});

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  return groq;
}

function normalizeCategory(category) {
  if (!category) return "other";

  const normalized = category
    .trim()
    .toLowerCase();

  const aliases = {
    food: "food",
    restaurant: "food",
    dining: "food",
    groceries: "food",

    travel: "travel",
    transport: "travel",
    transportation: "travel",
    cab: "travel",
    taxi: "travel",
    uber: "travel",

    rent: "rent",

    utilities: "utilities",
    utility: "utilities",
    electricity: "utilities",
    water: "utilities",
    internet: "utilities",
    wifi: "utilities",

    shopping: "shopping",

    entertainment: "entertainment",
    movie: "entertainment",
    movies: "entertainment",

    college: "college",
    education: "college",

    other: "other",
  };

  return aliases[normalized] || "other";
}

function normalizePayerName(
  payerName,
  currentUserName
) {
  if (!payerName) {
    return "";
  }

  const normalized =
    payerName.trim().toLowerCase();

  const currentUserAliases = [
    "i",
    "me",
    "myself",
    "user",
    "current user",
  ];

  if (
    currentUserAliases.includes(normalized)
  ) {
    return currentUserName;
  }

  return payerName.trim();
}

/*
 * Groq LLM → structured JSON → Zod → business validation
 */
export async function parseNaturalLanguageExpenses({
  text,
  members,
  currentUserName,
}) {
  if (!text?.trim()) {
    throw new Error(
      "Expense text is required"
    );
  }

  if (!members?.length) {
    throw new Error(
      "Group members are required"
    );
  }

  const memberNames = members.map(
    (member) => member.name
  );

  const prompt = `
You are the expense extraction engine for SettleFlow.

Extract every clearly identifiable expense from the user's text.

Return ONLY valid JSON in exactly this format:

{
  "expenses": [
    {
      "payerName": "exact person name",
      "amount": 250,
      "description": "pizza",
      "category": "food"
    }
  ]
}

Rules:

1. payerName MUST correspond to a person in the group.
2. If the user says "I", "me", or "myself", use:
   "${currentUserName}"
3. Never output "User" when "I" refers to the current user.
4. Never invent people.
5. amount must be a positive number.
6. description must be short.
7. category MUST be one of:
   food
   travel
   rent
   utilities
   shopping
   entertainment
   college
   other
8. Use lowercase category values.
9. Extract every distinct expense you can identify.
10. Do not calculate splits.
11. Ignore text that isn't clearly an expense.
12. Return JSON only.

Current user:
${currentUserName}

Valid group members:
${memberNames.join(", ")}

User input:
${text}
`;

  let response;

  try {
    response =
      await getGroqClient().chat.completions.create({
        model: "openai/gpt-oss-20b",

        messages: [
          {
            role: "system",
            content: prompt,
          },
        ],

        temperature: 0,

        response_format: {
          type: "json_object",
        },
      });
  } catch (error) {
    console.error(
      "========== GROQ API ERROR =========="
    );
    console.error(error);
    console.error(
      "===================================="
    );

    throw new Error(
      error?.message ||
        "Groq API request failed"
    );
  }

  const content =
    response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "Groq returned an empty response"
    );
  }

  console.log(
    "Raw Groq expense response:",
    content
  );

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error(
      "Groq returned invalid JSON:",
      content
    );

    throw new Error(
      "Groq returned invalid JSON"
    );
  }

  /*
   * Validate structure.
   */
  const validated =
    ParsedExpensesSchema.safeParse(
      parsed
    );

  if (!validated.success) {
    console.error(
      "Groq schema validation failed:",
      validated.error.flatten()
    );

    throw new Error(
      "AI returned invalid expense data"
    );
  }

  const validExpenses = [];

  /*
   * Application-level validation.
   */
  for (const expense of validated.data.expenses) {
    const normalizedPayer =
      normalizePayerName(
        expense.payerName,
        currentUserName
      );

    const matchedMember =
      members.find(
        (member) =>
          member.name
            .trim()
            .toLowerCase() ===
          normalizedPayer
            .trim()
            .toLowerCase()
      );

    /*
     * Critical security/business rule:
     * the LLM cannot invent a group member.
     */
    if (!matchedMember) {
      console.warn(
        "Skipping unknown payer:",
        expense.payerName
      );

      continue;
    }

    const numericAmount =
      Number(expense.amount);

    if (
      !Number.isFinite(
        numericAmount
      ) ||
      numericAmount <= 0
    ) {
      continue;
    }

    validExpenses.push({
      payerName: matchedMember.name,
      amount: Number(
        numericAmount.toFixed(2)
      ),
      description:
        expense.description.trim(),
      category: normalizeCategory(
        expense.category
      ),
    });
  }

  return validExpenses;
}

/*
 * Categorize manually entered expenses.
 */
export async function categorizeExpense(
  description
) {
  if (!description?.trim()) {
    return "other";
  }

  try {
    const response =
      await getGroqClient().chat.completions.create({
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

Return ONLY valid JSON:

{
  "category": "food"
}

Use "other" if uncertain.
`,
          },
          {
            role: "user",
            content: description,
          },
        ],

        temperature: 0,

        response_format: {
          type: "json_object",
        },
      });

    const content =
      response.choices?.[0]?.message
        ?.content;

    if (!content) {
      return "other";
    }

    const parsed =
      JSON.parse(content);

    return normalizeCategory(
      parsed.category
    );
  } catch (error) {
    console.error(
      "Groq category error:",
      error
    );

    return "other";
  }
}

/*
 * Settlement explanation.
 */
export async function explainSettlements(
  transfers,
  usersMap
) {
  if (
    !transfers ||
    transfers.length === 0
  ) {
    return "No settlements are required. Everyone is already balanced.";
  }

  try {
    const response =
      await getGroqClient().chat.completions.create({
        model: "openai/gpt-oss-20b",

        messages: [
          {
            role: "system",
            content: `
You explain group expense settlements.

Use ONLY the supplied transfers.
Do not invent transactions.

Explain:
- who pays whom,
- why the payments settle the balances,
- why the transfer count is compact.

Keep the explanation concise.
`,
          },
          {
            role: "user",
            content: `
Users:
${JSON.stringify(
  usersMap,
  null,
  2
)}

Transfers:
${JSON.stringify(
  transfers,
  null,
  2
)}
`,
          },
        ],

        temperature: 0.2,
      });

    return (
      response.choices?.[0]?.message
        ?.content?.trim() ||
      "Unable to generate settlement explanation."
    );
  } catch (error) {
    console.error(
      "Groq settlement explanation error:",
      error
    );

    throw new Error(
      "Settlement explanation failed"
    );
  }
}

/*
 * Monthly insights.
 */
export async function generateInsightsSummary(
  stats
) {
  try {
    const response =
      await getGroqClient().chat.completions.create({
        model: "openai/gpt-oss-20b",

        messages: [
          {
            role: "system",
            content: `
You are a concise expense analysis assistant.

Analyze only the supplied statistics.

Mention:
- highest spending category,
- one notable pattern,
- one practical observation.

Never invent numbers.
`,
          },
          {
            role: "user",
            content: JSON.stringify(
              stats,
              null,
              2
            ),
          },
        ],

        temperature: 0.2,
      });

    return (
      response.choices?.[0]?.message
        ?.content?.trim() ||
      "Unable to generate insights."
    );
  } catch (error) {
    console.error(
      "Groq insights error:",
      error
    );

    throw new Error(
      "Insights generation failed"
    );
  }
}