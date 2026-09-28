import { getDb, getSetting, setSetting, inTransaction } from "./db";
import { getClient, getModel, textOf, trackUsage } from "./anthropic";
import { fetchPublicProfile, getHandle } from "./followerFetch";
import { allTargets, getQuota } from "./reply";

// ---------------------------------------------------------------------------
// Automatic reply-target discovery. Two candidate sources, both verified
// against the public (no-login) profile before anything is registered:
//   1. ARCHIVE - accounts the owner has actually replied to or mentioned in
//      the imported X archive (a real relationship, highest priority)
//   2. AI - accounts Claude proposes for the owner's niche; handles can be
//      hallucinated, so nothing is trusted until the public profile confirms
//      it exists, is active and posts in Japanese
// Every handle examined is written to reply_candidates with its verdict so
// it is never re-checked and rejections are kept. No X API, no login.
// ---------------------------------------------------------------------------

const MIN_FOLLOWERS_AI = 500;
const MIN_FOLLOWERS_ARCHIVE = 200;
const MAX_FOLLOWERS = 300_000;
const ACTIVE_WITHIN_DAYS = 21;
const MAX_CHECKS_PER_RUN = 40;
const DELAY_MS = 900;

export type DiscoverResult = {
  added: number;
  checked: number;
  rejected: number;
  invalid: number;
  addedHandles: string[];
  aiUsed: boolean;
  error?: string;
};

type Candidate = { handle: string; source: "ARCHIVE" | "AI"; reason: string; weight: number };

function knownHandles(): Set<string> {
  const db = getDb();
  const s = new Set<string>();
  for (const r of db.prepare("SELECT handle FROM reply_targets").all() as { handle: string }[])
    s.add(r.handle.toLowerCase());
  for (const r of db.prepare("SELECT handle FROM reply_candidates").all() as { handle: string }[])
    s.add(r.handle.toLowerCase());
  s.add(getHandle().toLowerCase());
  return s;
}

// Accounts the owner has interacted with, from the archive. Weighted by how
// often, with a recency bonus so old acquaintances rank below current ones.
export function archiveCandidates(limit = 40): Candidate[] {
  const rows = getDb()
    .prepare(
      `SELECT text, created_at FROM x_archive_posts
       WHERE is_retweet = 0 AND (is_reply = 1 OR text LIKE '%@%')
       ORDER BY created_at DESC LIMIT 6000`,
    )
    .all() as { text: string; created_at: string }[];
  const own = getHandle().toLowerCase();
  const stats = new Map<string, { handle: string; count: number; last: string }>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const m of r.text.matchAll(/@([A-Za-z0-9_]{1,15})/g)) {
      const key = m[1].toLowerCase();
      if (key === own || seen.has(key)) continue;
      seen.add(key);
      const s = stats.get(key) ?? { handle: m[1], count: 0, last: "" };
      s.count++;
      if (r.created_at > s.last) s.last = r.created_at;
      stats.set(key, s);
    }
  }
  const now = Date.now();
  return [...stats.values()]
    .map((s) => {
      const ageDays = Math.max(0, (now - Date.parse(s.last)) / 86400000);
      const recency = ageDays < 180 ? 3 : ageDays < 365 ? 2 : ageDays < 1095 ? 1 : 0;
      return {
        handle: s.handle,
        source: "ARCHIVE" as const,
        reason: `過去に${s.count}回やり取り（最終 ${s.last.slice(0, 7)}）`,
        weight: s.count + recency * 2,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

const DISCOVER_SYSTEM = `あなたはX（旧Twitter）の日本語圏に詳しいグロース担当。依頼者は「AIと組んで365日でフォロワー10,000人を目指す公開挑戦」をしている個人開発・生成AI活用の発信者。

依頼者が「リプ営業」（相手の投稿に具体的で価値ある返信を毎日つけて露出を得る）を行う相手として適切なXアカウントを挙げる。

条件:
- 日本語で発信している実在のアカウントのみ。実在に自信が持てないものは挙げない（架空・うろ覚えのハンドルは厳禁）
- 領域: 生成AI活用、AIツール実践、個人開発、Claude/ChatGPT/Cursor等の使い倒し、副業×AI、プロンプト術。芸能人・大企業公式・ニュースアカウントは除外
- 規模の目安: フォロワー1,000〜100,000（中規模）。返信が埋もれない規模を優先
- ほぼ毎日投稿し、リプ欄が活発なアカウントを優先
- 除外リストにあるハンドルは挙げない
- ハンドルは@なし、英数字と_のみ`;

const DISCOVER_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          handle: { type: "string" },
          reason: { type: "string", description: "なぜ良いリプ先か（20字程度）" },
          confidence: { type: "string", enum: ["high", "medium"] },
        },
        required: ["handle", "reason", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

async function aiCandidates(exclude: Set<string>, want: number): Promise<Candidate[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const db = getDb();
  const bio = db
    .prepare("SELECT bio FROM profile_revisions ORDER BY id DESC LIMIT 1")
    .get() as { bio: string } | undefined;
  const themes = (
    db
      .prepare(
        `SELECT theme, COUNT(*) AS n FROM posts WHERE theme IS NOT NULL AND theme != ''
         GROUP BY theme ORDER BY n DESC LIMIT 8`,
      )
      .all() as { theme: string }[]
  ).map((t) => t.theme);
  const recent = (
    db
      .prepare(
        `SELECT COALESCE(final_text, raw_text) AS text FROM posts
         WHERE status = 'PUBLISHED' ORDER BY id DESC LIMIT 6`,
      )
      .all() as { text: string }[]
  ).map((r) => r.text.slice(0, 120));
  const rejected = (
    db
      .prepare("SELECT handle FROM reply_candidates ORDER BY id DESC LIMIT 200")
      .all() as { handle: string }[]
  ).map((r) => r.handle);

  const input = [
    bio ? `依頼者のプロフィール文:\n${bio.bio}` : "",
    themes.length ? `よく投稿するテーマ: ${themes.join("、")}` : "",
    recent.length ? `最近の投稿（冒頭）:\n${recent.map((t) => `- ${t}`).join("\n")}` : "",
    `除外リスト（既に登録済み・確認済み）:\n${[...exclude, ...rejected].join(", ")}`,
    `候補を${want}件。実在に自信があるものだけ。`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await getClient().messages.create({
    model: getModel(),
    max_tokens: 4000,
    system: DISCOVER_SYSTEM,
    output_config: { format: { type: "json_schema", schema: DISCOVER_SCHEMA } },
    messages: [{ role: "user", content: input }],
  });
  const data = JSON.parse(textOf(trackUsage("リプ先探索", response))) as {
    candidates: { handle: string; reason: string; confidence: string }[];
  };
  return data.candidates
    .map((c) => ({ ...c, handle: c.handle.replace(/^@/, "").trim() }))
    .filter((c) => /^[A-Za-z0-9_]{1,15}$/.test(c.handle))
    .map((c) => ({
      handle: c.handle,
      source: "AI" as const,
      reason: c.reason.slice(0, 40),
      weight: c.confidence === "high" ? 2 : 1,
    }));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function recordCandidate(
  c: Candidate,
  status: "ADDED" | "REJECTED" | "INVALID",
  followers: number | null,
  lastPostAt: string | null,
  detail: string,
) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO reply_candidates
         (handle, source, reason, status, followers, last_post_at, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(c.handle, c.source, c.reason, status, followers, lastPostAt, detail);
}

// Find and register up to `need` new targets. Archive candidates first, AI
// only when the archive cannot fill the gap. Bounded by MAX_CHECKS_PER_RUN.
export async function discoverReplyTargets(need: number): Promise<DiscoverResult> {
  const result: DiscoverResult = {
    added: 0,
    checked: 0,
    rejected: 0,
    invalid: 0,
    addedHandles: [],
    aiUsed: false,
  };
  if (need <= 0) return result;
  const known = knownHandles();
  const queue: Candidate[] = archiveCandidates().filter(
    (c) => !known.has(c.handle.toLowerCase()),
  );

  let networkErrors = 0;
  const activeDays = (lastPostAt: string | null) =>
    lastPostAt === null ? null : (Date.now() - Date.parse(lastPostAt)) / 86400000;

  const tryQueue = async () => {
    while (queue.length > 0 && result.added < need && result.checked < MAX_CHECKS_PER_RUN) {
      const c = queue.shift()!;
      const key = c.handle.toLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      result.checked++;
      const p = await fetchPublicProfile(c.handle);
      await sleep(DELAY_MS);
      if (p.fetchError) {
        // X unreachable, not "account missing": leave the handle unrecorded so
        // a later run re-checks it, and give up after a few in a row
        known.delete(key);
        result.checked--;
        if (++networkErrors >= 3) {
          result.error = "Xの公開プロフィールに到達できません（時間をおいて再実行）";
          return;
        }
        continue;
      }
      networkErrors = 0;
      if (!p.exists) {
        result.invalid++;
        recordCandidate(c, "INVALID", null, null, "公開プロフィールを取得できず");
        continue;
      }
      const minFollowers = c.source === "ARCHIVE" ? MIN_FOLLOWERS_ARCHIVE : MIN_FOLLOWERS_AI;
      const age = activeDays(p.lastPostAt);
      let reject = "";
      if (p.followers !== null && p.followers < minFollowers) reject = `フォロワー${p.followers}人で小さい`;
      else if (p.followers !== null && p.followers > MAX_FOLLOWERS) reject = `フォロワー${p.followers}人で大きすぎ`;
      else if (age !== null && age > ACTIVE_WITHIN_DAYS) reject = `最終投稿 ${p.lastPostAt}（休眠）`;
      else if (p.jaRatio !== null && p.jaRatio < 0.3) reject = "日本語投稿が少ない";
      if (reject) {
        result.rejected++;
        recordCandidate(c, "REJECTED", p.followers, p.lastPostAt, reject);
        continue;
      }
      const note = `自動: ${c.reason}${p.followers !== null ? `・${p.followers.toLocaleString()}人` : ""}`;
      inTransaction(() => {
        getDb()
          .prepare(
            `INSERT INTO reply_targets (handle, note, priority) VALUES (?, ?, ?)
             ON CONFLICT(handle) DO UPDATE SET active = 1`,
          )
          .run(c.handle, note.slice(0, 80), c.source === "ARCHIVE" ? 2 : 1);
        recordCandidate(c, "ADDED", p.followers, p.lastPostAt, p.bio ?? "");
      });
      result.added++;
      result.addedHandles.push(c.handle);
    }
  };

  await tryQueue();
  if (!result.error && result.added < need && result.checked < MAX_CHECKS_PER_RUN) {
    result.aiUsed = true;
    try {
      const ai = await aiCandidates(known, Math.min(25, (need - result.added) * 3));
      queue.push(...ai.sort((a, b) => b.weight - a.weight));
      await tryQueue();
    } catch (e) {
      console.error(`[climb] reply discovery AI step failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  setSetting("reply_discover_last", new Date().toISOString());
  setSetting(
    "reply_discover_last_result",
    `${result.added}件追加（${result.checked}件確認）`,
  );
  return result;
}

export function shortage(): { active: number; needed: number; missing: number } {
  const active = allTargets().filter((t) => t.active === 1).length;
  const needed = getQuota() * 3;
  return { active, needed, missing: Math.max(0, needed - active) };
}

// Scheduler hook: once per JST day from 07:00, only while the list is short.
// Adds a couple of spares so a single dropped account does not re-trigger
// the gate the next morning.
export async function replyDiscoveryTick(): Promise<void> {
  if (getSetting("reply_auto_discover", "1") !== "1") return;
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  if (jst.getUTCHours() < 7) return;
  const today = jst.toISOString().slice(0, 10);
  if (getSetting("reply_discover_date", "") === today) return;
  const s = shortage();
  if (s.missing === 0) return;
  const r = await discoverReplyTargets(s.missing + 2);
  if (r.error) {
    console.error(`[climb] reply discovery: ${r.error}`);
    return; // not marked done - retried on the next tick
  }
  setSetting("reply_discover_date", today);
  console.log(
    `[climb] reply discovery: +${r.added} (checked ${r.checked}, rejected ${r.rejected}, invalid ${r.invalid})`,
  );
  if (r.added > 0) {
    const { pushOnce } = await import("./push");
    await pushOnce("reply_discover", today, {
      title: `リプ先を${r.added}件自動追加`,
      body: r.addedHandles.map((h) => `@${h}`).join(" "),
      url: "/?reply=manage#reply",
    });
  }
}
