import Anthropic from "@anthropic-ai/sdk";
import { getDb, getSetting } from "./db";

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

// USD per 1M tokens (input, output). Cache write = 1.25x input, cache read =
// 0.1x input. Unknown models fall back to Opus pricing (the safe overestimate).
const PRICING: [string, number, number][] = [
  ["claude-fable-5", 10, 50],
  ["claude-opus-5", 5, 25],
  ["claude-opus-4", 5, 25],
  ["claude-sonnet-5", 2, 10],
  ["claude-sonnet-4", 3, 15],
  ["claude-haiku-4", 1, 5],
];

export function estimateCostUsd(
  model: string,
  u: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number {
  const [, inP, outP] = PRICING.find(([p]) => model.startsWith(p)) ?? PRICING[1];
  return (
    (u.input * inP + u.cacheWrite * inP * 1.25 + u.cacheRead * inP * 0.1 + u.output * outP) /
    1_000_000
  );
}

// Records a response's token usage; returns the response so it can wrap an
// existing textOf(response) call. Never throws.
export function trackUsage<T extends Anthropic.Message>(purpose: string, response: T): T {
  try {
    const u = response.usage;
    const usage = {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    };
    getDb()
      .prepare(
        `INSERT INTO api_usage
           (purpose, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        purpose,
        response.model,
        usage.input,
        usage.output,
        usage.cacheRead,
        usage.cacheWrite,
        estimateCostUsd(response.model, usage),
      );
  } catch (e) {
    console.error(`[climb] usage tracking failed: ${e instanceof Error ? e.message : e}`);
  }
  return response;
}

export type UsageSummary = {
  month: string;
  totalUsd: number;
  calls: number;
  cacheHitRate: number; // share of input tokens served from cache
  byPurpose: { purpose: string; usd: number; calls: number }[];
};

export function monthlyUsage(): UsageSummary {
  const db = getDb();
  const month = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  const total = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd),0) AS usd, COUNT(*) AS calls,
              COALESCE(SUM(input_tokens + cache_write_tokens),0) AS uncached,
              COALESCE(SUM(cache_read_tokens),0) AS cached
       FROM api_usage WHERE strftime('%Y-%m', created_at, '+9 hours') = ?`,
    )
    .get(month) as { usd: number; calls: number; uncached: number; cached: number };
  const byPurpose = (
    db
      .prepare(
        `SELECT purpose, SUM(cost_usd) AS usd, COUNT(*) AS calls FROM api_usage
         WHERE strftime('%Y-%m', created_at, '+9 hours') = ? GROUP BY purpose ORDER BY usd DESC`,
      )
      .all(month) as { purpose: string; usd: number; calls: number }[]
  ).map((r) => ({ ...r }));
  const denom = total.uncached + total.cached;
  return {
    month,
    totalUsd: total.usd,
    calls: total.calls,
    cacheHitRate: denom ? total.cached / denom : 0,
    byPurpose,
  };
}
