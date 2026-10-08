import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

import { ENV } from "../env.server";

export function askWorkersAI(prompt: string) {
  const workersai = createWorkersAI({ binding: ENV.AI });
  return generateText({ model: workersai("@cf/meta/llama-3.1-8b-instruct"), prompt });
}
