import { getDb, getMeta } from "@/lib/db";
import { ingestInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  // auto-register any screenshots dropped into data/inbox since last visit
  try {
    ingestInbox();
  } catch {
    // inbox ingest must never break the dashboard
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
          <div className="muted">Current Followers</div>
          <div className="big-number">{current.toLocaleString()}</div>
          {latest && <div className="muted">as of {latest.date}</div>}
        </div>
        <div className="panel">
          <div className="muted">Remaining</div>
          <div className="big-number">{remaining.toLocaleString()}</div>
        </div>
        <div className="panel">
          <div className="muted">Day</div>
          <div className="big-number">
            {day} / {duration}
          </div>
        </div>
      </div>
    </div>
  );
}
