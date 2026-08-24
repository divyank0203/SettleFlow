import dotenv from "dotenv";
dotenv.config();

import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function test() {
  try {
    console.log(
      "API key loaded:",
      Boolean(process.env.GROQ_API_KEY)
    );

    const response =
      await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              "Extract the expense as JSON with payerName, amount, description and category.",
          },
          {
            role: "user",
            content:
              "I paid 20 for water and Gagan paid 250 for pizza.",
          },
        ],
        response_format: {
          type: "json_object",
        },
        temperature: 0,
      });

    console.log(
      response.choices[0].message.content
    );
  } catch (error) {
    console.error("GROQ TEST FAILED:");
    console.error(error);
  }
}

test();