import { ENV } from "../env.server";

export function askSearch(query: string) {
  return ENV.AI_SEARCH.chatCompletions({ messages: [{ role: "user", content: query }] });
}
