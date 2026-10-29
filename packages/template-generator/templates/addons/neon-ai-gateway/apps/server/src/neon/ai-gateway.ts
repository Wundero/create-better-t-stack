import { createNeon } from "@neon/ai-sdk-provider";
import { generateText } from "ai";

const neon = createNeon({
  baseURL: process.env.NEON_AI_GATEWAY_BASE_URL,
  apiKey: process.env.NEON_AI_GATEWAY_TOKEN,
});

export function askNeonAI(prompt: string) {
  return generateText({ model: neon("gpt-5-mini"), prompt });
}
