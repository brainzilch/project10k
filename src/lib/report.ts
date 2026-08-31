import { getDb, getMeta, getSetting, setSetting, inTransaction } from "./db";
import { getClient, getModel, textOf } from "./anthropic";
import { learningsPromptBlock } from "./coach";
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

const REPORT_SYSTEM = `あなたはPROJECT 10K（Xで1,458→10,000フォロワーへの365日公開挑戦）の本人として報告投稿を書く。
本人は自作ツールCLIMBで挑戦を記録している個人開発者。誇張せず、実測の数字で語るのがスタイル。

ルール:
- 一人称の本人の文体で書く。過去投稿の文体例があればそれに寄せる
- 実データに無い数字・実績を作らない
- 140字以内を基本とする（超えても200字まで）。改行は2回まで
- 冒頭1行で数字か変化を見せる（スクロールを止めるのは具体的な数字）
- AI臭のある定型句（「〜してみませんか」「いかがでしょうか」等）と絵文字の多用を避ける
- ハッシュタグは最大1個（#PROJECT10K など）か無し
- 進捗カード画像が添付される前提なので、本文はストーリーに集中する`;

const REPORT_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
} as const;

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

  const shipped = db
    .prepare(
      "SELECT title FROM dev_proposals WHERE status = 'DONE' ORDER BY id DESC LIMIT 6",
    )
    .all() as { title: string }[];

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
  if (shipped.length > 0) {
    lines.push(
      `\n最近CLIMBに実装した機能（アプリ内AI提案→本人採用で開発が進む仕組み）:`,
    );
    for (const s of shipped) lines.push(`- ${s.title}`);
  }
  lines.push(
    "\nこのデータから報告投稿を1本書いて。CLIMB(自作の記録・診断ツール)を育てながら挑戦している事実は、開発報告としてではなく挑戦のストーリーとして織り込む。",
  );
  return lines.join("\n");
}

async function generateReportText(
  kind: ReportKind,
  milestone?: number,
): Promise<string> {
  const response = await getClient().messages.create({
    model: getModel(),
    max_tokens: 6000,
    system: REPORT_SYSTEM + learningsPromptBlock(),
    output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
    messages: [{ role: "user", content: buildReportInput(kind, milestone) }],
  });
  const data = JSON.parse(textOf(response)) as { text: string };
  return data.text.trim();
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
    spark = `<svg width="520" height="160" viewBox="0 0 520 160">
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
  .main { flex: 1; display: flex; align-items: center; gap: 48px; margin-top: 8px; }
  .num { font-size: 130px; font-weight: 800; line-height: 1.05; }
  .num small { font-size: 40px; color: #8b93a3; font-weight: 400; }
  .goal { font-size: 30px; color: #8b93a3; margin-top: 12px; }
  .bar { width: 440px; height: 14px; background: #21262d; border-radius: 7px; margin-top: 20px; }
  .bar > div { height: 14px; background: #4da3ff; border-radius: 7px; width: ${pct.toFixed(1)}%; min-width: 6px; }
  .foot { display: flex; justify-content: space-between; color: #8b93a3; font-size: 26px; }
  </style></head><body>
    <div class="head"><div class="label">PROJECT 10K — 365日で10,000フォロワー挑戦</div>
    <div class="day">DAY ${day} / ${meta.duration_days}</div></div>
    <div class="main">
      <div>
        <div class="num">${current.toLocaleString()}<small> フォロワー</small></div>
        <div class="goal">${start.toLocaleString()} スタート → 目標 ${goal.toLocaleString()}（達成率 ${pct.toFixed(1)}%）</div>
        <div class="bar"><div></div></div>
      </div>
      <div>${spark}</div>
    </div>
    <div class="foot"><div>@brainzilch</div><div>自作ツール CLIMB で記録中</div></div>
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
