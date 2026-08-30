import { getDb } from "@/lib/db";
import TimeLogForm from "./TimeLogForm";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? 6 : day - 1;
  return new Date(d.getTime() - diff * MS_PER_DAY).toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(dateStr + "T00:00:00Z") + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

type WeekRow = {
  weekStart: string;
  followersStart: number | null;
  followersEnd: number | null;
  netGrowth: number | null;
  primaryCount: number;
  casualCount: number;
  primaryDays: number;
  minimalEditRate: string;
  impressions: number;
};

export default function WeeklyPage() {
  const db = getDb();
  const followers = db
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all() as { date: string; followers: number }[];
  const posts = db
    .prepare(
      "SELECT id, post_type, minimal_edit_used, final_text, created_at FROM posts",
    )
    .all() as {
    id: number;
    post_type: string;
    minimal_edit_used: number;
    final_text: string | null;
    created_at: string;
  }[];
  // latest measurement per post (append-only table)
  const latestImpressions = db
    .prepare(
      `SELECT pm.post_id, pm.impressions FROM post_metrics pm
       JOIN (SELECT post_id, MAX(measured_at) AS m FROM post_metrics GROUP BY post_id) x
         ON x.post_id = pm.post_id AND x.m = pm.measured_at`,
    )
    .all() as { post_id: number; impressions: number | null }[];
  const impressionsByPost = new Map(
    latestImpressions.map((r) => [r.post_id, r.impressions ?? 0]),
  );
  const timeLogs = db
    .prepare("SELECT date, category, minutes FROM time_logs")
    .all() as { date: string; category: string; minutes: number }[];

  // group everything by week (Monday start)
  const weekSet = new Set<string>();
  for (const f of followers) weekSet.add(mondayOf(f.date));
  for (const p of posts) weekSet.add(mondayOf(p.created_at.slice(0, 10)));
  const weeks = [...weekSet].sort().reverse();

  const rows: WeekRow[] = weeks.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const inWeek = (d: string) => d >= weekStart && d <= weekEnd;

    const wf = followers.filter((f) => inWeek(f.date));
    const wp = posts.filter((p) => inWeek(p.created_at.slice(0, 10)));
    const primary = wp.filter((p) => p.post_type === "PRIMARY");
    const primaryFinal = primary.filter((p) => p.final_text !== null);
    const usedEdit = primaryFinal.filter((p) => p.minimal_edit_used === 1);

    return {
      weekStart,
      followersStart: wf[0]?.followers ?? null,
      followersEnd: wf[wf.length - 1]?.followers ?? null,
      netGrowth:
        wf.length >= 2 ? wf[wf.length - 1].followers - wf[0].followers : null,
      primaryCount: primary.length,
      casualCount: wp.length - primary.length,
      primaryDays: new Set(primary.map((p) => p.created_at.slice(0, 10))).size,
      minimalEditRate:
        primaryFinal.length > 0
          ? `${Math.round((usedEdit.length / primaryFinal.length) * 100)}%`
          : "-",
      impressions: wp.reduce((sum, p) => sum + (impressionsByPost.get(p.id) ?? 0), 0),
    };
  });

  // 現在ペース換算: simple arithmetic, only when 30+ days of data exist
  let pace: { growth30: number; projected: number } | null = null;
  if (followers.length >= 2) {
    const last = followers[followers.length - 1];
    const cutoff = addDays(last.date, -30);
    const base = followers.filter((f) => f.date <= cutoff).pop();
    if (base) {
      const daysSpan =
        (Date.parse(last.date) - Date.parse(base.date)) / MS_PER_DAY;
      const growth30 = Math.round(
        ((last.followers - base.followers) / daysSpan) * 30,
      );
      pace = {
        growth30,
        projected: last.followers + Math.round((growth30 / 30) * 365),
      };
    }
  }

  const weekTimeTotals = new Map<string, number>();
  for (const t of timeLogs) {
    const w = mondayOf(t.date);
    weekTimeTotals.set(w, (weekTimeTotals.get(w) ?? 0) + t.minutes);
  }
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h1>週次サマリー</h1>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>週</th>
              <th>週初</th>
              <th>週末</th>
              <th>増減</th>
              <th>本気投稿</th>
              <th>気軽な投稿</th>
              <th>本気投稿日数</th>
              <th>AI案使用率</th>
              <th>インプ合計</th>
              <th>時間(分)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.weekStart}>
                <td>{r.weekStart}</td>
                <td>{r.followersStart?.toLocaleString() ?? "-"}</td>
                <td>{r.followersEnd?.toLocaleString() ?? "-"}</td>
                <td>{r.netGrowth !== null ? (r.netGrowth >= 0 ? `+${r.netGrowth}` : r.netGrowth) : "-"}</td>
                <td>{r.primaryCount}</td>
                <td>{r.casualCount}</td>
                <td>{r.primaryDays} / 7</td>
                <td>{r.minimalEditRate}</td>
                <td>{r.impressions > 0 ? r.impressions.toLocaleString() : "-"}</td>
                <td>{weekTimeTotals.get(r.weekStart) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>現在ペース換算</h2>
        {pace ? (
          <p style={{ margin: 0 }}>
            直近30日ペース: {pace.growth30 >= 0 ? "+" : ""}
            {pace.growth30.toLocaleString()} / 30日。このペースが続いた場合の365日換算:
            約{pace.projected.toLocaleString()}。
            <span className="muted">（単純算数。AI予測ではない）</span>
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            直近30日分のデータが揃うと表示されます。
          </p>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>時間簿</h2>
        <TimeLogForm today={today} />
      </div>
    </div>
  );
}
