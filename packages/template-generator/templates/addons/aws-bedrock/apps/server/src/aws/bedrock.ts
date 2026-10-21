import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { generateText } from "ai";

const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export function askBedrock(prompt: string) {
  return generateText({
    model: bedrock(process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-lite-v1:0"),
    prompt,
  });
}
