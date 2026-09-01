import { getDb, getMeta } from "@/lib/db";
import { ingestInbox } from "@/lib/inbox";
import { retryPendingUploads } from "@/lib/drive";
import { pendingReport } from "@/lib/report";
import { openIdeas } from "@/lib/devstory";
import AwaitingCard from "./AwaitingCard";
import CoachPanel from "./CoachPanel";
import DevStoriesPanel from "./DevStoriesPanel";
import ProposalsPanel from "./ProposalsPanel";
import ReportPanel from "./ReportPanel";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ record?: string }>;
}) {
  const { record } = await searchParams;
  // auto-register any screenshots dropped into data/inbox since last visit,
  // and re-send assets whose Drive upload is pending or failed (spec section 6)
  try {
    ingestInbox();
    retryPendingUploads();
  } catch {
    // housekeeping must never break the dashboard
  }
  const meta = getMeta();
  const start = Number(meta.start_followers);
  const goal = Number(meta.goal_followers);
  const duration = Number(meta.duration_days);

  const latest = getDb()
    .prepare(
      "SELECT date, followers FROM daily_followers ORDER BY date DESC LIMIT 1",
    )
    .get() as { date: string; followers: number } | undefined;

  const current = latest?.followers ?? start;
  const remaining = Math.max(goal - current, 0);

  const latestReport = getDb()
    .prepare(
      "SELECT summary, actions, created_at FROM coach_reports ORDER BY id DESC LIMIT 1",
    )
    .get() as { summary: string; actions: string; created_at: string } | undefined;
  let reportActions: string[] = [];
  try {
    reportActions = latestReport ? JSON.parse(latestReport.actions) : [];
  } catch {
    reportActions = [];
  }
  const learningsCount = (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM learnings WHERE active = 1")
      .get() as { n: number }
  ).n;
  // node:sqlite rows have a null prototype, which Next refuses to pass to
  // client components - spread into plain objects first.
  const openProposals = (
    getDb()
      .prepare(
        "SELECT id, title, reason, instruction, created_at FROM dev_proposals WHERE status = 'OPEN' ORDER BY id DESC",
      )
      .all() as {
      id: number;
      title: string;
      reason: string;
      instruction: string;
      created_at: string;
    }[]
  ).map((r) => ({ ...r }));

  // 数字未記録: published 24h+ ago with no metrics yet, oldest first.
  // Younger posts are excluded - X numbers need a day to settle.
  const msDay = 24 * 60 * 60 * 1000;
  const daysSince = (s: string) =>
    Math.max(0, Math.floor((Date.now() - Date.parse(s.slice(0, 10) + "T00:00:00Z")) / msDay));
  const awaitingRows = (
    getDb()
      .prepare(
        `SELECT p.id, COALESCE(p.final_text, p.raw_text) AS text,
                COALESCE(p.published_at, p.created_at) AS published_at,
                p.x_url, p.x_post_id
         FROM posts p
         WHERE p.status = 'PUBLISHED'
           AND NOT EXISTS (SELECT 1 FROM post_metrics m WHERE m.post_id = p.id)
         ORDER BY COALESCE(p.published_at, p.created_at) ASC`,
      )
      .all() as {
      id: number;
      text: string;
      published_at: string;
      x_url: string | null;
      x_post_id: string | null;
    }[]
  )
    .filter((row) => {
      const t = Date.parse(
        row.published_at.length > 10
          ? row.published_at.slice(0, 19).replace(" ", "T") + "Z"
          : row.published_at + "T00:00:00Z",
      );
      return Date.now() - t >= msDay;
    })
    .map((row) => ({
      id: row.id,
      excerpt:
        row.text.replace(/\s+/g, " ").slice(0, 30) +
        (row.text.length > 30 ? "…" : ""),
      days: daysSince(row.published_at),
      xLink:
        row.x_url ||
        (row.x_post_id ? `https://x.com/i/web/status/${row.x_post_id}` : null),
    }));

  // Recording discipline: how many published posts have numbers, and for how
  // many consecutive days a 24h+ unrecorded post has existed (the oldest
  // awaiting post guarantees the state held continuously since it came due).
  const recordingCounts = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(EXISTS (SELECT 1 FROM post_metrics m WHERE m.post_id = p.id)) AS recorded
       FROM posts p WHERE p.status = 'PUBLISHED'`,
    )
    .get() as { total: number; recorded: number | null };
  const recordingStats = {
    total: recordingCounts.total,
    recorded: recordingCounts.recorded ?? 0,
    streak: awaitingRows.reduce((max, r) => Math.max(max, r.days), 0),
  };

  const publishedToday = (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM posts
         WHERE status = 'PUBLISHED'
           AND date(published_at, '+9 hours') = date('now', '+9 hours')`,
      )
      .get() as { n: number }
  ).n;
  const staleDraftCount = (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM posts
         WHERE status = 'DRAFT' AND created_at <= datetime('now', '-1 day')`,
      )
      .get() as { n: number }
  ).n;

  // Xサブスク収益化ライン: 認証済みフォロワー2,000人（実質、総フォロワー
  // 1万規模＝PROJECT 10Kと同方向）+ 過去3ヶ月オーガニック500万インプ。
  // インプはアナリティクス概要CSVの日次データから90日ローリングで自動追跡。
  const imp90 = getDb()
    .prepare(
      `SELECT COALESCE(SUM(impressions), 0) AS total, COUNT(*) AS days
       FROM x_daily_stats WHERE date >= date('now', '+9 hours', '-90 days')`,
    )
    .get() as { total: number; days: number };

  const msPerDay = 24 * 60 * 60 * 1000;
  const today = new Date().toISOString().slice(0, 10);
  const elapsed = Math.floor(
    (Date.parse(today) - Date.parse(meta.start_date)) / msPerDay,
  );
  const day = Math.min(Math.max(elapsed + 1, 1), duration);

  return (
    <div>
      <h1>{meta.project_name}</h1>
      <p className="muted">
        {start.toLocaleString()} → {goal.toLocaleString()}
      </p>
      <div className="stat-grid">
        <div className="panel">
          <div className="muted">現在のフォロワー</div>
          <div className="big-number">{current.toLocaleString()}</div>
          {latest && <div className="muted">{latest.date} 時点</div>}
        </div>
        <div className="panel">
          <div className="muted">目標まで</div>
          <div className="big-number">{remaining.toLocaleString()}</div>
        </div>
        <div className="panel">
          <div className="muted">経過日数</div>
          <div className="big-number">
            {day} / {duration}
          </div>
        </div>
      </div>
      <p className="muted" style={{ margin: "4px 0 16px" }}>
        今日の公開数 {publishedToday} ／ DRAFT滞留{" "}
        {staleDraftCount > 0 ? (
          <span style={{ color: "#d29922" }}>{staleDraftCount}件</span>
        ) : (
          "0件"
        )}
      </p>
      {imp90.days > 0 && (
        <div className="panel">
          <strong>収益化ライン</strong>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            第一関門（報酬プログラム）: 認証済みフォロワー500人・認証済みインプ50万/90日。
            正確な現在値はXの「収益化」画面で確認（認証済みのみカウントされる）
          </p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            参考・総インプ実測（90日）:{" "}
            <span style={{ color: "#e6edf3" }}>{imp90.total.toLocaleString()}</span>
            {" "}／ 必要ペースの目安 約5,600/日
          </p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
            次の関門: サブスク解放（認証済み2,000人・500万インプ/3ヶ月）。
            インプはアナリティクス概要CSVで自動更新（現在{imp90.days}日分）
          </p>
        </div>
      )}
      <ReportPanel pending={pendingReport()} />
      <DevStoriesPanel ideas={openIdeas()} />
      <AwaitingCard
        rows={awaitingRows}
        stats={recordingStats}
        autoOpenId={record ? Number(record) : null}
      />
      <CoachPanel
        summary={latestReport?.summary ?? null}
        actions={reportActions}
        reportedAt={latestReport?.created_at ?? null}
        learningsCount={learningsCount}
      />
      <ProposalsPanel proposals={openProposals} />
    </div>
  );
}
