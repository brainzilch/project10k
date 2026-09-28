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

// Public profile facts for an arbitrary handle (reply-target discovery).
// Same no-login endpoints as above; everything is parsed defensively and
// missing fields come back null rather than failing.
export type PublicProfile = {
  exists: boolean;
  followers: number | null;
  lastPostAt: string | null; // ISO date
  postsIn30d: number | null;
  jaRatio: number | null; // share of recent posts tagged lang ja
  bio: string | null;
  // true when nothing could be fetched at all (network/timeout/5xx) - the
  // caller must not treat that as "account does not exist"
  fetchError: boolean;
};

export async function fetchPublicProfile(handle: string): Promise<PublicProfile> {
  const out: PublicProfile = {
    exists: false,
    followers: null,
    lastPostAt: null,
    postsIn30d: null,
    jaRatio: null,
    bio: null,
    fetchError: false,
  };
  let reached = false;
  try {
    const res = await fetch(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (CLIMB)" }, signal: AbortSignal.timeout(15000) },
    );
    if (res.ok || res.status === 404) reached = true;
    if (res.ok) {
      const html = await res.text();
      const f = html.match(/"followers_count"\s*:\s*(\d+)/);
      if (f && plausible(Number(f[1]))) {
        out.exists = true;
        out.followers = Number(f[1]);
      }
      const bio = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (bio) {
        try {
          out.bio = JSON.parse(`"${bio[1]}"`).slice(0, 200);
        } catch {}
      }
      // tweet timestamps: the newest is the last post; count the last 30 days
      const dates: number[] = [];
      for (const m of html.matchAll(/"created_at"\s*:\s*"([^"]+)"/g)) {
        const t = Date.parse(m[1]);
        if (Number.isFinite(t)) dates.push(t);
      }
      if (dates.length > 0) {
        const newest = Math.max(...dates);
        out.lastPostAt = new Date(newest).toISOString().slice(0, 10);
        const cutoff = Date.now() - 30 * 86400000;
        // the account's own created_at is in there too; it only matters if it
        // is within 30 days, in which case counting it as a post is harmless
        out.postsIn30d = dates.filter((d) => d >= cutoff).length;
        out.exists = true;
      }
      const langs = [...html.matchAll(/"lang"\s*:\s*"([a-z]{2,3})"/g)].map((m) => m[1]);
      if (langs.length > 0) {
        out.jaRatio = langs.filter((l) => l === "ja").length / langs.length;
      }
    }
  } catch {}
  if (out.followers === null) {
    try {
      const n = await fromWidget(handle);
      reached = true;
      if (n !== null) {
        out.exists = true;
        out.followers = n;
      }
    } catch {}
  }
  if (!out.exists && !reached) out.fetchError = true;
  return out;
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
