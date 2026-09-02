import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb, getSetting, setSetting, inTransaction } from "./db";
import { getClient, getModel, textOf, trackUsage } from "./anthropic";
import { learningsPromptBlock } from "./coach";

// ---------------------------------------------------------------------------
// 開発ネタ generator: turns the devlog (the running record of what happened
// while building with AI) into stocked post ideas, written in the owner's own
// voice, for the owner to approve or dismiss. Approving one creates a normal
// DRAFT post (theme: AI開発) that goes through the usual diagnose -> publish
// -> metrics loop, so テーマ別成績 eventually proves or kills this genre.
// ---------------------------------------------------------------------------

export type DevStoryIdea = {
  id: number;
  title: string;
  text: string;
  status: string;
  post_id: number | null;
  created_at: string;
};

const STOCK_CAP = 3;

export function openIdeas(): DevStoryIdea[] {
  return (
    getDb()
      .prepare(
        "SELECT id, title, text, status, post_id, created_at FROM dev_story_ideas WHERE status = 'OPEN' ORDER BY id ASC",
      )
      .all() as DevStoryIdea[]
  ).map((r) => ({ ...r }));
}

// Recent devlog text - the raw material. Deployed with the app image.
function devlogTail(maxChars = 9000): string {
  try {
    const dir = path.join(process.cwd(), "docs", "devlog");
    const all = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf-8"))
      .join("\n\n");
    return all.slice(-maxChars);
  } catch {
    return "";
  }
}

// The owner's published posts, full text, as the voice to imitate. While the
// CLIMB-era corpus is still small, back-fill from the imported X archive:
// the newest own posts (current voice) plus the highest-liked ones (the voice
// that worked). RTs and replies are excluded.
export function styleCorpus(): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT COALESCE(final_text, raw_text) AS text FROM posts
       WHERE status = 'PUBLISHED' ORDER BY id DESC LIMIT 8`,
    )
    .all() as { text: string }[];
  const texts = rows.map((r) => r.text);
  if (texts.length < 8) {
    const archive = db
      .prepare(
        `SELECT text FROM (
           SELECT text, created_at, favorite_count FROM x_archive_posts
           WHERE is_retweet = 0 AND is_reply = 0
           ORDER BY created_at DESC LIMIT 10
         )
         UNION
         SELECT text FROM (
           SELECT text FROM x_archive_posts
           WHERE is_retweet = 0 AND is_reply = 0
           ORDER BY favorite_count DESC LIMIT 5
         )`,
      )
      .all() as { text: string }[];
    for (const a of archive) {
      if (texts.length >= 15) break;
      if (!texts.includes(a.text)) texts.push(a.text);
    }
  }
  return texts.map((t, i) => `--- 投稿例${i + 1}\n${t}`).join("\n");
}

const DEVSTORY_SYSTEM = `あなたはPROJECT 10K（1,458→10,000フォロワーへの365日公開挑戦）の本人として、「AIと組んで挑戦を進める現場」で起きたことを投稿ネタにする。本人はAIに指示を出して自分専用の記録ツールを育てながら挑戦している。

読者は初見のXユーザー。AI活用には興味があるが、このツールの機能には興味がない。

素材は開発ログ。そこから「事件 → 気づき → 読者が自分のAI活用に持ち帰れる学び」の形になる出来事だけを選ぶ。機能紹介・作業報告は選ばない。「〜を作った」ではなく「〜が起きて、こう学んだ」。

文体ルール（最重要）:
- 本文は本人の文体で書く。文体コーパスの語彙・リズム・改行の癖・語尾・一人称を真似る
- 本人が使わない言葉・借り物の決め台詞を持ち込まない。AI臭のある定型句禁止

内容ルール:
- 内部用語（DRAFT・滞留・バッジ等）と開発専門用語（デプロイ・リポジトリ・マイグレーション等）は禁止。誰でも分かる言葉に言い換える
- 数字は最大2つ、比較で自明になるもののみ（単体で凄さが分からない数字は禁止）
- 140字以内基本、最大200字。改行2回まで。ハッシュタグ最大1個か無し
- 各ネタは互いに角度を変える。既存ネタ一覧にある話と同じ・似た話は作らない
- 開発ログに無い出来事・数字を作らない`;

const DEVSTORY_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "ネタの短い内部ラベル（一覧表示・重複防止用）" },
          critique: {
            type: "string",
            description: "本文の自己検証: 初見で3秒で分かるか／本人の文体か／持ち帰れる学びは何か",
          },
          text: { type: "string", description: "投稿本文の最終稿" },
        },
        required: ["title", "critique", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
} as const;

const BANNED = ["DRAFT", "滞留", "バッジ", "デプロイ", "リポジトリ", "マイグレーション", "プルリク"];

// Generate up to `count` new ideas into the stock. Returns how many were added.
export async function generateDevStories(count?: number): Promise<number> {
  const db = getDb();
  const open = openIdeas();
  const room = STOCK_CAP - open.length;
  if (room <= 0) return 0;
  const want = Math.min(count ?? 2, room);

  const devlog = devlogTail();
  if (!devlog) return 0;

  const previous = db
    .prepare("SELECT title FROM dev_story_ideas ORDER BY id DESC LIMIT 30")
    .all() as { title: string }[];

  const input = [
    `開発ログ（素材）:\n${devlog}`,
    `\n文体コーパス（本人の公開済み投稿）:\n${styleCorpus() || "（まだ少ない。誇張のない一人称の淡々とした文体で）"}`,
    previous.length > 0
      ? `\n既存ネタ一覧（これらと同じ・似た話は禁止）:\n${previous.map((p) => `- ${p.title}`).join("\n")}`
      : "",
    `\n新しいネタを${want}本。それぞれ角度を変えること。`,
  ].join("\n");

  const response = await getClient().messages.create({
    model: getModel(),
    max_tokens: 10000,
    system: DEVSTORY_SYSTEM + learningsPromptBlock(),
    output_config: { format: { type: "json_schema", schema: DEVSTORY_SCHEMA } },
    messages: [{ role: "user", content: input }],
  });
  const data = JSON.parse(textOf(trackUsage("開発ネタ", response))) as {
    ideas: { title: string; text: string }[];
  };

  let added = 0;
  for (const idea of data.ideas.slice(0, want)) {
    const text = idea.text.trim();
    if (!text || BANNED.some((b) => text.includes(b))) continue;
    db.prepare(
      "INSERT INTO dev_story_ideas (title, text, status) VALUES (?, ?, 'OPEN')",
    ).run(idea.title.trim().slice(0, 60), text);
    added++;
  }
  return added;
}

// Approve an idea: create a normal DRAFT post (theme AI開発) and mark it used.
export function useIdea(id: number): number | null {
  const db = getDb();
  const idea = db
    .prepare("SELECT id, text FROM dev_story_ideas WHERE id = ? AND status = 'OPEN'")
    .get(id) as { id: number; text: string } | undefined;
  if (!idea) return null;
  return inTransaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO posts (post_type, raw_text, theme) VALUES ('PRIMARY', ?, 'AI開発')",
      )
      .run(idea.text);
    db.prepare(
      "INSERT INTO post_revisions (post_id, revision, kind, text) VALUES (?, 1, 'RAW', ?)",
    ).run(lastInsertRowid, idea.text);
    db.prepare(
      "UPDATE dev_story_ideas SET status = 'USED', post_id = ? WHERE id = ?",
    ).run(lastInsertRowid, id);
    return Number(lastInsertRowid);
  });
}

// Daily top-up, called from the instrumentation timer alongside the report
// tick. Runs in the 20:00 JST hour, at most once per day, only when the stock
// is low.
export async function autoDevStoryTick(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const jstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  if (jstHour !== 20) return;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (getSetting("devstory_last_auto_date", "") === today) return;
  if (openIdeas().length >= 2) return;
  // skip when the devlog has not changed since the last automatic run - the
  // same material would only produce near-duplicates
  const hash = crypto.createHash("sha256").update(devlogTail()).digest("hex");
  if (getSetting("devstory_last_hash", "") === hash) return;
  setSetting("devstory_last_auto_date", today);
  setSetting("devstory_last_hash", hash);
  const added = await generateDevStories(2);
  if (added > 0) console.log(`[climb] dev story ideas stocked: ${added}`);
}
