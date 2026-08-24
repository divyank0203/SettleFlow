import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
 * Allowed categories for SettleFlow.
 *
 * Keeping this controlled is important:
 * the model can suggest a category,
 * but it cannot invent arbitrary categories.
 */
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

/*
 * Structured schema returned by the model.
 *
 * The model MUST return this shape.
 */
const ExpenseItem = z.object({
  payerName: z
    .string()
    .describe("Name of the person who paid for this expense."),
  amount: z
    .number()
    .positive()
    .describe("Total amount paid for the expense."),
  description: z
    .string()
    .min(1)
    .describe("Short description of the expense."),
  category: z
    .enum(EXPENSE_CATEGORIES)
    .describe("One of the allowed SettleFlow expense categories."),
});

const ExpenseParseResponse = z.object({
  expenses: z.array(ExpenseItem),
});

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  return client;
}

/**
 * Parse natural language into structured expenses.
 *
 * Example:
 *
 * "Yesterday I paid 1200 for the hotel and Rahul paid
 *  600 for dinner."
 *
 * -> structured expense objects
 */
export async function parseNaturalLanguageExpenses({
  text,
  members,
  currentUserName,
}) {
  if (!text || !text.trim()) {
    throw new Error("Expense text is required");
  }

  if (!Array.isArray(members) || members.length === 0) {
    throw new Error("Group members are required");
  }

  const memberNames = members.map((member) => member.name);

  const systemPrompt = `
You are the expense extraction engine for SettleFlow.

Your job is to convert casual human expense descriptions into structured expense records.

IMPORTANT RULES:

1. Only identify people who exist in the supplied group member list.
2. If the user says "I", interpret it as the current user's name.
3. Never invent a payer.
4. Extract every distinct expense you can identify.
5. Amount must be a positive number.
6. Description should be short and human-readable.
7. Category MUST be one of:
   food, travel, rent, utilities, shopping, entertainment, college, other
8. If the category is ambiguous, use "other".
9. Do not calculate individual splits. SettleFlow will do that separately.
10. Do not add commentary outside the structured response.
11. If a sentence does not clearly identify an expense, ignore it.

Current user:
${currentUserName}

Group members:
${memberNames.join(", ")}
`;

  const input = `
Extract expenses from the following user input:

${text}
`;

  const response = await getClient().responses.parse({
    model: "gpt-5.6-luna",
    instructions: systemPrompt,
    input,
    text: {
      format: zodTextFormat(
        ExpenseParseResponse,
        "settleflow_expenses"
      ),
    },
  });

  if (response.status !== "completed") {
    throw new Error(
      `AI response incomplete: ${JSON.stringify(
        response.incomplete_details || {}
      )}`
    );
  }

  const parsed = response.output_parsed;

  if (!parsed) {
    throw new Error("AI returned no structured expense data");
  }

  /*
   * SECOND validation layer:
   * Even though OpenAI structured output validates the schema,
   * we still validate against YOUR application's business rules.
   */

  const normalizedMembers = members.map((member) => ({
    id: member._id.toString(),
    name: member.name,
  }));

  const validExpenses = [];

  for (const expense of parsed.expenses) {
    const matchedMember = normalizedMembers.find(
      (member) =>
        member.name.toLowerCase() ===
        expense.payerName.trim().toLowerCase()
    );

    if (!matchedMember) {
      continue;
    }

    if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
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
 * AI-generated settlement explanation.
 *
 * This is still structured through the same client,
 * but unlike the parser it only returns text.
 */
export async function explainSettlements(transfers, usersMap) {
  if (!transfers || transfers.length === 0) {
    return "No settlements are required. Everyone is already balanced.";
  }

  const prompt = `
Explain this SettleFlow settlement plan clearly and briefly.

Users:
${JSON.stringify(usersMap, null, 2)}

Transfers:
${JSON.stringify(transfers, null, 2)}

Explain:
1. who pays whom,
2. why these transfers settle the balances,
3. why the number of transfers is compact.

Use plain English.
Do not invent any additional transactions.
`;

  const response = await getClient().responses.create({
    model: "gpt-5.6-luna",
    instructions:
      "You explain financial settlement results clearly. Never invent transactions.",
    input: prompt,
  });

  return response.output_text.trim();
}

/**
 * AI monthly insight summary.
 */
export async function generateInsightsSummary(stats) {
  const prompt = `
Analyze these SettleFlow expense statistics:

${JSON.stringify(stats, null, 2)}

Provide:
- the highest spending category,
- notable spending patterns,
- 1-2 practical observations.

Keep it concise and factual.
Do not invent numbers.
`;

  const response = await getClient().responses.create({
    model: "gpt-5.6-luna",
    instructions:
      "You are a concise financial expense analysis assistant. Only use supplied data.",
    input: prompt,
  });

  return response.output_text.trim();
}

/**
 * Kept for compatibility with existing expense creation code.
 *
 * It now uses the same structured AI classification instead
 * of keyword matching.
 */
export async function categorizeExpense(description) {
  if (!description?.trim()) {
    return "other";
  }

  const CategoryResponse = z.object({
    category: z
      .enum(EXPENSE_CATEGORIES)
      .describe("Expense category."),
  });

  const response = await getClient().responses.parse({
    model: "gpt-5.6-luna",
    instructions: `
Classify the expense into exactly one of:
food, travel, rent, utilities, shopping, entertainment, college, other.

Return "other" when uncertain.
`,
    input: description,
    text: {
      format: zodTextFormat(
        CategoryResponse,
        "expense_category"
      ),
    },
  });

  if (!response.output_parsed) {
    return "other";
  }

  return response.output_parsed.category;
}