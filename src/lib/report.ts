import { getDb, getMeta, getSetting, setSetting, inTransaction } from "./db";
import { getClient, getModel, textOf } from "./anthropic";
import { learningsPromptBlock, winnersPromptBlock } from "./coach";
import { saveAssetFile, timestampParts } from "./attachments";
import { launchBrowser } from "./browser";

// ---------------------------------------------------------------------------
// PROJECT 10K report posts: CLIMB writes its own progress reports.
//
// Cadence (decided for the 10K goal, adjustable later):
// - WEEKLY: one report every 7 days. Build-in-public reports work when they
//   carry a week's worth of real numbers; more often than that they crowd out
//   the daily on-the-ground posts that actually drive follows.
// - MILESTONE: an extra report the day a follower threshold is crossed -
//   milestone posts are the highest-engagement moments of a public challenge.
// A draft + progress-card image are generated automatically at 20:00 JST
// (before the 22:00 follower reminder); the human reviews and posts with one
// tap. Actual publishing to X stays a human action: CLIMB uses no X API and
// automating a logged-in browser against X risks the account itself.
// ---------------------------------------------------------------------------

export const MILESTONES = [
  1600, 1800, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
];

export type ReportKind = "WEEKLY" | "MILESTONE";

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export type PendingReport = {
  post_id: number;
  kind: string;
  milestone: number | null;
  card_asset_id: number | null;
  text: string;
  created_at: string;
};

// The one report draft awaiting human review, if any.
export function pendingReport(): PendingReport | null {
  const row = getDb()
    .prepare(
      `SELECT rp.post_id, rp.kind, rp.milestone, rp.card_asset_id, rp.created_at,
              COALESCE(p.final_text, p.raw_text) AS text
       FROM report_posts rp JOIN posts p ON p.id = rp.post_id
       WHERE p.status = 'DRAFT' ORDER BY rp.id DESC LIMIT 1`,
    )
    .get() as PendingReport | undefined;
  return row ? { ...row } : null;
}

export function reportDue(): { kind: ReportKind; milestone?: number } | null {
  const db = getDb();
  const latest = db
    .prepare("SELECT followers FROM daily_followers ORDER BY date DESC LIMIT 1")
    .get() as { followers: number } | undefined;

  // Milestones outrank the weekly cadence - they are time-sensitive.
  if (latest) {
    const cleared = Number(getSetting("report_last_milestone", "0"));
    const crossed = MILESTONES.filter(
      (m) => m > cleared && latest.followers >= m,
    ).pop();
    if (crossed) return { kind: "MILESTONE", milestone: crossed };
  }

  const last = db
    .prepare("SELECT created_at FROM report_posts ORDER BY id DESC LIMIT 1")
    .get() as { created_at: string } | undefined;
  if (!last) return { kind: "WEEKLY" }; // first report ever
  const days =
    (Date.now() - Date.parse(last.created_at.replace(" ", "T") + "Z")) /
    (24 * 3600 * 1000);
  return days >= 7 ? { kind: "WEEKLY" } : null;
}

const REPORT_SYSTEM = `あなたはPROJECT 10K（1,458→10,000フォロワーへの365日公開挑戦）の本人として、Xの報告投稿を書く。

最重要: 読者は本人のこともこの挑戦も知らない初見のXユーザー。書き上げたら「初見の人が3秒で状況を理解でき、続きを見たくなるか」で自己検証すること。

ルール:
- 1行目だけで「何の挑戦で、いま何が起きているか」が分かること。企画名の説明より、状況が伝わる数字を1つ
- 読者が知らない内輪の言葉を使わない。DRAFT・下書き・滞留・診断・バッジ・記録ツールの機能名などアプリの管理用語は全て禁止
- 自作ツールの機能や開発の話を書かない。挑戦の道具の話は読者には雑音
- 数字は本文に最大3つまで。数字の羅列は読まれない
- 読者が凄いのか普通なのか判断できない数字は使わない（いいね率◯%・エンゲージ率などの率や専門指標は禁止）。数字を使うなら比較で自明にする（「告知は337人、現場の1枚は1,271人に届いた」「必要ペース23人/日に対して実測0.6人」のように）
- 本人にしか書けない具体的な場面・失敗・気づきを1つだけ入れる。読者が自分の発信に持ち帰れるものが最強
- 締めは次の一手の宣言で終える。フォロー・いいねのお願いはしない
- 140字以内を基本（最大200字）。改行は2回まで。ハッシュタグは最大1個か無し
- AI臭のある定型句（「〜してみませんか」等）と絵文字の多用を避け、過去投稿の文体例に寄せる
- 実データに無い数字・実績を作らない`;

// draft -> critique -> text: the schema's property order forces the model to
// write a first version, tear it apart from a first-time reader's seat, and
// only then produce the final text.
const REPORT_SCHEMA = {
  type: "object",
  properties: {
    draft: { type: "string", description: "第一稿" },
    critique: {
      type: "string",
      description:
        "第一稿への辛口セルフレビュー。初見の読者として『3秒で状況が分かるか』『内輪用語はないか』『読者が持ち帰れるものは何か』『続きを見たい理由があるか』を1行ずつ判定",
    },
    text: { type: "string", description: "レビューを反映した最終稿" },
  },
  required: ["draft", "critique", "text"],
  additionalProperties: false,
} as const;

// Words that only make sense inside CLIMB - a report carrying any of them
// failed the reader-first rule, whatever else it got right.
const BANNED_TERMS = [
  "DRAFT",
  "下書き",
  "滞留",
  "バッジ",
  "AI診断",
  "CLIMB",
  "デプロイ",
  "実装した機能",
  "リポジトリ",
];

function bannedTermIn(text: string): string | null {
  for (const t of BANNED_TERMS) if (text.includes(t)) return t;
  return null;
}

function buildReportInput(kind: ReportKind, milestone?: number): string {
  const db = getDb();
  const meta = getMeta();
  const followers = db
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all() as { date: string; followers: number }[];
  const latest = followers[followers.length - 1];
  const current = latest?.followers ?? Number(meta.start_followers);

  const day =
    Math.floor(
      (Date.parse(jstToday()) - Date.parse(meta.start_date)) /
        (24 * 3600 * 1000),
    ) + 1;

  const lastReport = db
    .prepare("SELECT created_at FROM report_posts ORDER BY id DESC LIMIT 1")
    .get() as { created_at: string } | undefined;
  const sinceDate = lastReport
    ? lastReport.created_at.slice(0, 10)
    : meta.start_date;
  const baseline = followers.filter((f) => f.date <= sinceDate).pop();
  const delta = current - (baseline?.followers ?? Number(meta.start_followers));

  const recentPosts = db
    .prepare(
      `SELECT p.id, COALESCE(p.final_text, p.raw_text) AS text, p.published_at,
              (SELECT pm.impressions FROM post_metrics pm WHERE pm.post_id = p.id
               ORDER BY pm.measured_at DESC LIMIT 1) AS impressions,
              (SELECT pm.likes FROM post_metrics pm WHERE pm.post_id = p.id
               ORDER BY pm.measured_at DESC LIMIT 1) AS likes
       FROM posts p WHERE p.status = 'PUBLISHED'
       ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT 8`,
    )
    .all() as {
    text: string;
    published_at: string | null;
    impressions: number | null;
    likes: number | null;
  }[];

  const lines: string[] = [];
  lines.push(
    kind === "MILESTONE"
      ? `種類: マイルストーン報告（フォロワー${milestone}人到達）`
      : "種類: 週次報告",
  );
  lines.push(
    `DAY ${day}/${meta.duration_days}。現在フォロワー${current}人（${meta.start_followers}人スタート、目標${meta.goal_followers}人）`,
  );
  lines.push(`前回報告(${sinceDate})からの増減: ${delta >= 0 ? "+" : ""}${delta}人`);
  if (recentPosts.length > 0) {
    lines.push("\n直近の公開投稿（文体の参考と実績。数字が無いものは未記録）:");
    for (const p of recentPosts) {
      const nums =
        p.impressions != null ? `Imp${p.impressions}/いいね${p.likes ?? 0}` : "数字未記録";
      lines.push(`- [${nums}] ${p.text.replace(/\s+/g, " ").slice(0, 100)}`);
    }
  }
  lines.push(
    "\nこのデータから報告投稿を1本書いて。全部を盛り込まず、初見の読者に一番刺さる1点だけを選ぶこと。数字が良くない週は、正直さと具体的な場面で読ませる。",
  );
  return lines.join("\n");
}

async function generateReportText(
  kind: ReportKind,
  milestone?: number,
): Promise<string> {
  const input = buildReportInput(kind, milestone);
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: input },
  ];
  // one retry when the hard reader-first gate catches an in-app term
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await getClient().messages.create({
      model: getModel(),
      max_tokens: 8000,
      system: REPORT_SYSTEM + learningsPromptBlock() + winnersPromptBlock(),
      output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
      messages,
    });
    const raw = textOf(response);
    const data = JSON.parse(raw) as { text: string };
    const text = data.text.trim();
    const banned = bannedTermIn(text);
    if (!banned) return text;
    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `最終稿に禁止語「${banned}」が残っている。初見の読者が知らない内輪の言葉を全て外し、同じデータから書き直して。`,
      },
    );
  }
  throw new Error(
    "読者向けの文面になりませんでした。もう一度「作り直す」を押してください。",
  );
}

// 1200x675 progress card (X's 16:9 in-feed size), rendered with the bundled
// Chromium. Numbers-only content, so no escaping concerns beyond dates.
function cardHtml(): string {
  const db = getDb();
  const meta = getMeta();
  const followers = db
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all() as { date: string; followers: number }[];
  const current =
    followers[followers.length - 1]?.followers ?? Number(meta.start_followers);
  const start = Number(meta.start_followers);
  const goal = Number(meta.goal_followers);
  const day =
    Math.floor(
      (Date.parse(jstToday()) - Date.parse(meta.start_date)) /
        (24 * 3600 * 1000),
    ) + 1;
  const pct = Math.min(
    100,
    Math.max(0, ((current - start) / (goal - start)) * 100),
  );

  let spark = "";
  if (followers.length >= 2) {
    const xs = followers.map((f) => Date.parse(f.date));
    const ys = followers.map((f) => f.followers);
    const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
    const [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
    const pts = followers
      .map((f) => {
        const x = ((Date.parse(f.date) - xMin) / (xMax - xMin || 1)) * 520;
        const y = 150 - ((f.followers - yMin) / (yMax - yMin || 1)) * 130;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    spark = `<svg viewBox="0 0 520 160" style="width:100%;height:auto;display:block">
      <polyline points="${pts}" fill="none" stroke="#4da3ff" stroke-width="4" stroke-linecap="round"/>
    </svg>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 675px; background: #0d1117; color: #e6edf3;
         font-family: "Noto Sans CJK JP", "Hiragino Sans", sans-serif;
         padding: 56px 64px; display: flex; flex-direction: column; }
  .label { color: #8b93a3; font-size: 26px; letter-spacing: 2px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; }
  .day { font-size: 34px; color: #d29922; font-weight: 700; }
  .main { flex: 1; display: flex; align-items: center; gap: 40px; margin-top: 8px; }
  .main > div:first-child { flex: 0 0 auto; }
  .num { font-size: 110px; font-weight: 800; line-height: 1.05; white-space: nowrap; }
  .num small { font-size: 36px; color: #8b93a3; font-weight: 400; }
  .goal { font-size: 28px; color: #8b93a3; margin-top: 12px; white-space: nowrap; }
  .bar { width: 440px; height: 14px; background: #21262d; border-radius: 7px; margin-top: 20px; }
  .bar > div { height: 14px; background: #4da3ff; border-radius: 7px; width: ${pct.toFixed(1)}%; min-width: 6px; }
  .foot { display: flex; justify-content: space-between; color: #8b93a3; font-size: 26px; }
  </style></head><body>
    <div class="head"><div class="label">PROJECT 10K — 365日で10,000フォロワー挑戦</div>
    <div class="day">DAY ${day} / ${meta.duration_days}</div></div>
    <div class="main">
      <div>
        <div class="num">${current.toLocaleString()}<small> フォロワー</small></div>
        <div class="goal">${start.toLocaleString()} スタート → 目標 ${goal.toLocaleString()}（あと ${(goal - current).toLocaleString()}人）</div>
        <div class="bar"><div></div></div>
      </div>
      <div style="flex: 1 1 auto; min-width: 0;">${spark}</div>
    </div>
    <div class="foot"><div>@brainzilch</div><div>365日、数字を全部さらして挑戦中</div></div>
  </body></html>`;
}

async function renderReportCard(): Promise<number | null> {
  try {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 675 },
      });
      await page.setContent(cardHtml(), { waitUntil: "load" });
      const buffer = Buffer.from(await page.screenshot({ type: "png" }));
      const ts = timestampParts();
      const saved = saveAssetFile({
        buffer,
        source: "CLIMB",
        originalFilename: "report_card.png",
        mimeType: "image/png",
        storedFilename: `${ts.datePart}_${ts.timePart}_climb_report_card.png`,
      });
      return saved.id;
    } finally {
      await browser.close();
    }
  } catch (e) {
    // the card is a nice-to-have - a text-only draft is still a valid report
    console.error(
      `[climb] report card render failed: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}

// Generates the draft post + card image. Returns the created post id.
export async function generateReport(due?: {
  kind: ReportKind;
  milestone?: number;
}): Promise<{ postId: number; cardAssetId: number | null }> {
  const target = due ?? reportDue() ?? { kind: "WEEKLY" as ReportKind };
  const text = await generateReportText(target.kind, target.milestone);
  const cardAssetId = await renderReportCard();

  const db = getDb();
  const postId = inTransaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO posts (post_type, raw_text) VALUES ('PRIMARY', ?)")
      .run(text);
    db.prepare(
      "INSERT INTO post_revisions (post_id, revision, kind, text) VALUES (?, 1, 'RAW', ?)",
    ).run(lastInsertRowid, text);
    db.prepare(
      "INSERT INTO report_posts (post_id, kind, milestone, card_asset_id) VALUES (?, ?, ?, ?)",
    ).run(lastInsertRowid, target.kind, target.milestone ?? null, cardAssetId);
    db.prepare("INSERT OR IGNORE INTO tags (name) VALUES ('報告')").run();
    const tag = db.prepare("SELECT id FROM tags WHERE name = '報告'").get() as {
      id: number;
    };
    db.prepare(
      "INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)",
    ).run(lastInsertRowid, tag.id);
    return Number(lastInsertRowid);
  });
  if (target.kind === "MILESTONE" && target.milestone) {
    setSetting("report_last_milestone", String(target.milestone));
  }
  return { postId, cardAssetId };
}

// Called every 15 minutes from instrumentation. Generates at most one draft
// per day, only in the 20:00 JST hour, only when a report is due and no
// earlier draft is still waiting for review.
export async function autoReportTick(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const jstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  if (jstHour !== 20) return;
  const today = jstToday();
  if (getSetting("report_last_auto_date", "") === today) return;
  if (pendingReport()) return;
  const due = reportDue();
  if (!due) return;
  setSetting("report_last_auto_date", today); // set first - never double-bill
  await generateReport(due);
  console.log(`[climb] auto report draft generated (${due.kind})`);
}
