import { getDb, getMeta } from "@/lib/db";
import { ingestInbox } from "@/lib/inbox";
import { retryPendingUploads } from "@/lib/drive";
import CoachPanel from "./CoachPanel";

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
      <CoachPanel
        summary={latestReport?.summary ?? null}
        actions={reportActions}
        reportedAt={latestReport?.created_at ?? null}
        learningsCount={learningsCount}
      />
    </div>
  );
}
