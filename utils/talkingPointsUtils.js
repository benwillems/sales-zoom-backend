// utils/generateTalkingPoints.js
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,   // fail early if env var missing
});

async function generateTalkingPointsFromTemplate(template, previousNotes, context) {
  if (!template) {
    throw new Error("template and previousNotes are required.");
  }

  // 1. Build prompts 

  const systemPrompt =
    `You are an expert AI assistant for nutrition coaches.\n` +
    `Use the provided function schema to output structured talking points.\n` +
    `Keep the tone motivational, client‑focused, and tightly aligned to the stated weekly goal.`;

  // Core prompt parts
  const notesBlock = `=== PREVIOUS NOTES ===\n${previousNotes}`;

  // If context exists, weave it in; otherwise skip
  const contextBlock = context
    ? `=== SESSION CONTEXT ===\n${context}\n`
    : "";

  const taskBlock =
    `=== TASK ===\n` +
    `Generate concise bullet points in the exact JSON structure required by the function schema.\n` +
    `Each point must be actionable and relevant to the client's current focus.\n` +
    `Do not add extra keys or commentary — ONLY return the JSON payload.`;

  const userPrompt = `${contextBlock}${notesBlock}\n\n${taskBlock}`;

  // 2. Call OpenAI

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",                
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt  }
      ],
      functions:     [template],           
      function_call: { name: template.name },     
    });

    const { message } = response.choices[0];

    // If no function call
    if (!message.function_call) {
      throw new Error("Model returned content instead of calling the function.");
    }

    // Parse the function arguments JSON
    const args = JSON.parse(message.function_call.arguments || "{}");

    if (!args || Object.keys(args).length === 0) {
      throw new Error("Function call returned empty arguments.");
    }

    return args;       
  } catch (err) {
    console.error("OpenAI talking‑points error:", err);
    throw new Error("Failed to generate talking points");
  }
}

module.exports = {
  generateTalkingPointsFromTemplate,
};
