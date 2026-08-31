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

// Returns the concatenated text of a response; throws on refusal and on
// max_tokens truncation (a cut-off response must never be parsed or saved
// as if it were complete).
export function textOf(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") {
    throw new Error(
      `Claude declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : "."}`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "応答が長すぎて途中で切れました。もう一度実行してください（続く場合は開発チャットへ報告を）",
    );
  }
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
