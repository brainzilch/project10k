import { getDb, getSetting, setSetting } from "./db";
import { deriveFollowersFromDailyStats } from "./followers";

// ---------------------------------------------------------------------------
// Automatic follower count. Tried in order, first success wins:
//  1. X's public follow-button widget JSON (no auth, no login - the same
//     endpoint x.com's embeddable follow button uses)
//  2. The public syndication profile page (follower count sits in embedded
//     JSON), parsed defensively
//  3. X API v2 with a bearer token, only if CLIMB_X_BEARER is configured
// A failure of all three is not an error: the daily CSV-derived estimate and
// manual entry both still work. Nothing here logs in as the account, so the
// account itself is never at risk.
// ---------------------------------------------------------------------------

export const DEFAULT_HANDLE = "brainzilch";

export function getHandle(): string {
  return getSetting("x_handle", DEFAULT_HANDLE).replace(/^@/, "");
}

export type FetchAttempt = { source: string; ok: boolean; detail: string };
export type FetchResult = {
  followers: number | null;
  source: string | null;
  attempts: FetchAttempt[];
};

function plausible(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100_000_000;
}

async function fromWidget(handle: string): Promise<number | null> {
  const res = await fetch(
    `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(handle)}`,
    { headers: { "User-Agent": "Mozilla/5.0 (CLIMB)" }, signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { followers_count?: number }[];
  const n = Array.isArray(data) ? data[0]?.followers_count : undefined;
  return plausible(n) ? n : null;
}

async function fromSyndication(handle: string): Promise<number | null> {
  const res = await fetch(
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`,
    { headers: { "User-Agent": "Mozilla/5.0 (CLIMB)" }, signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // the embedded state carries "followers_count":N somewhere in the payload
  const m = html.match(/"followers_count"\s*:\s*(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  return plausible(n) ? n : null;
}

async function fromApi(handle: string): Promise<number | null> {
  const token = process.env.CLIMB_X_BEARER;
  if (!token) throw new Error("CLIMB_X_BEARER 未設定");
  const res = await fetch(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: { public_metrics?: { followers_count?: number } };
  };
  const n = data.data?.public_metrics?.followers_count;
  return plausible(n) ? n : null;
}

export async function fetchFollowerCount(): Promise<FetchResult> {
  const handle = getHandle();
  const sources: [string, (h: string) => Promise<number | null>][] = [
    ["公開ウィジェット", fromWidget],
    ["公開プロフィール", fromSyndication],
    ["X API", fromApi],
  ];
  const attempts: FetchAttempt[] = [];
  for (const [name, fn] of sources) {
    try {
      const n = await fn(handle);
      if (n !== null) {
        attempts.push({ source: name, ok: true, detail: `${n}人` });
        return { followers: n, source: name, attempts };
      }
      attempts.push({ source: name, ok: false, detail: "数値を取得できず" });
    } catch (e) {
      attempts.push({
        source: name,
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 60) : "失敗",
      });
    }
  }
  return { followers: null, source: null, attempts };
}

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// Writes today's row as source AUTO. A manually entered value for the same
// day is never overwritten - the human's number always wins.
export function recordAutoFollowers(followers: number, date = jstToday()): boolean {
  const db = getDb();
  const existing = db
    .prepare("SELECT source FROM daily_followers WHERE date = ?")
    .get(date) as { source: string } | undefined;
  if (existing?.source === "MANUAL") return false;
  db.prepare(
    `INSERT INTO daily_followers (date, followers, source) VALUES (?, ?, 'AUTO')
     ON CONFLICT(date) DO UPDATE SET followers = excluded.followers, source = 'AUTO'`,
  ).run(date, followers);
  try {
    deriveFollowersFromDailyStats();
  } catch {}
  return true;
}

// Scheduler hook: once per JST day, from 21:00 JST (after the day's activity
// but before the 22:00 reminder, so the reminder can see it's already done).
export async function followerFetchTick(): Promise<void> {
  if (getSetting("follower_auto_enabled", "1") !== "1") return;
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  if (jst.getUTCHours() < 21) return;
  const today = jstToday();
  if (getSetting("follower_auto_date", "") === today) return;
  const result = await fetchFollowerCount();
  if (result.followers === null) {
    console.error(
      `[climb] follower auto-fetch failed: ${result.attempts.map((a) => `${a.source}=${a.detail}`).join(", ")}`,
    );
    return; // retry on the next tick; the daily reminder still fires
  }
  setSetting("follower_auto_date", today);
  setSetting("follower_auto_source", result.source ?? "");
  recordAutoFollowers(result.followers);
  console.log(`[climb] followers auto-recorded: ${result.followers} (${result.source})`);
}
