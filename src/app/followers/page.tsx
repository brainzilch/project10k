import { getDb } from "@/lib/db";
import FollowerChart from "@/components/FollowerChart";
import FollowerForm from "./FollowerForm";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The server runs in UTC but the user records in JST - compute "today" in JST
// so the streak does not break between midnight and 9:00 JST.
function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(dateStr + "T00:00:00Z") + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

// Consecutive recorded days ending today (or yesterday while today is still
// unentered). A gap resets to 0 by construction.
function currentStreak(dates: Set<string>): number {
  const today = jstToday();
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export default function FollowersPage() {
  const rows = getDb()
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all() as { date: string; followers: number }[];
  const today = jstToday();
  const streak = currentStreak(new Set(rows.map((r) => r.date)));

  return (
    <div>
      <h1>フォロワー記録</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        連続記録 {streak}日
      </p>
      <FollowerForm today={today} />
      <div className="panel">
        <FollowerChart data={rows} />
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>フォロワー数</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{r.followers.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
