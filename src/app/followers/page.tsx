import { getDb } from "@/lib/db";
import FollowerChart from "@/components/FollowerChart";
import FollowerForm from "./FollowerForm";

export const dynamic = "force-dynamic";

export default function FollowersPage() {
  const rows = getDb()
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all() as { date: string; followers: number }[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h1>Followers</h1>
      <FollowerForm today={today} />
      <div className="panel">
        <FollowerChart data={rows} />
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Followers</th>
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
