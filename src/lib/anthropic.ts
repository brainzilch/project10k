import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "./db";

export const DEFAULT_MODEL = "claude-opus-5";

// Model name is a setting, never hardcoded at call sites.
// Priority: Settings screen > CLIMB_CLAUDE_MODEL env > default.
export function getModel(): string {
  return getSetting("claude_model", process.env.CLIMB_CLAUDE_MODEL || DEFAULT_MODEL);
}

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart.",
    );
  }
  return new Anthropic();
}

// Returns the concatenated text of a response, or throws on refusal.
export function textOf(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") {
    throw new Error(
      `Claude declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : "."}`,
    );
  }
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
