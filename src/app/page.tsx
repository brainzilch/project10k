import { getDb, getMeta } from "@/lib/db";
import { ingestInbox } from "@/lib/inbox";
import { retryPendingUploads } from "@/lib/drive";
import AwaitingCard from "./AwaitingCard";
import CoachPanel from "./CoachPanel";
import ProposalsPanel from "./ProposalsPanel";

export const dynamic = "force-dynamic";

export default function Dashboard() {
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
                COALESCE(p.published_at, p.created_at) AS published_at
         FROM posts p
         WHERE p.status = 'PUBLISHED'
           AND NOT EXISTS (SELECT 1 FROM post_metrics m WHERE m.post_id = p.id)
         ORDER BY COALESCE(p.published_at, p.created_at) ASC`,
      )
      .all() as { id: number; text: string; published_at: string }[]
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
    }));

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
      <AwaitingCard rows={awaitingRows} />
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
