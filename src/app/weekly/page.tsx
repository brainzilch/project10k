import { getDb } from "@/lib/db";
import TimeLogForm from "./TimeLogForm";
import { timingReport } from "@/lib/timing";
import { ALGO_RULES, KNOWLEDGE_VERSION } from "@/lib/growthKnowledge";

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
      "SELECT id, post_type, minimal_edit_used, final_text, created_at FROM posts WHERE status != 'DISCARDED'",
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
  const learnings = db
    .prepare(
      "SELECT insight, evidence, created_at FROM learnings WHERE active = 1 ORDER BY id DESC",
    )
    .all() as { insight: string; evidence: string | null; created_at: string }[];

  // テーマ別成績: published posts with a theme, latest measurement per post.
  // Posts without any recorded metrics are excluded from the averages and
  // surfaced as an unrecorded count instead.
  const themedPosts = db
    .prepare(
      `SELECT p.theme, pm.impressions, pm.likes, pm.profile_visits,
              CASE WHEN pm.post_id IS NULL THEN 0 ELSE 1 END AS recorded
       FROM posts p
       LEFT JOIN (
         SELECT pm.* FROM post_metrics pm
         JOIN (SELECT post_id, MAX(measured_at) AS m FROM post_metrics GROUP BY post_id) x
           ON x.post_id = pm.post_id AND x.m = pm.measured_at
       ) pm ON pm.post_id = p.id
       WHERE p.status = 'PUBLISHED' AND p.theme IS NOT NULL AND p.theme != ''`,
    )
    .all() as {
    theme: string;
    impressions: number | null;
    likes: number | null;
    profile_visits: number | null;
    recorded: number;
  }[];
  const timing = timingReport();
  const archiveBest = db
    .prepare(
      `SELECT created_at, favorite_count, retweet_count, text FROM x_archive_posts
       WHERE is_retweet = 0 AND is_reply = 0 ORDER BY favorite_count DESC LIMIT 10`,
    )
    .all() as { created_at: string; favorite_count: number; retweet_count: number; text: string }[];
  const themeStats = (() => {
    const byTheme = new Map<string, typeof themedPosts>();
    for (const p of themedPosts) {
      const list = byTheme.get(p.theme) ?? [];
      list.push(p);
      byTheme.set(p.theme, list);
    }
    const avg = (xs: number[]) =>
      xs.length === 0
        ? null
        : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    return [...byTheme.entries()]
      .map(([theme, list]) => {
        const recorded = list.filter((p) => p.recorded === 1);
        return {
          theme,
          count: list.length,
          unrecorded: list.length - recorded.length,
          avgImpressions: avg(recorded.map((p) => p.impressions ?? 0)),
          avgLikes: avg(recorded.map((p) => p.likes ?? 0)),
          avgProfileVisits: avg(recorded.map((p) => p.profile_visits ?? 0)),
        };
      })
      .sort((a, b) => b.count - a.count);
  })();

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
      {rows.map((r) => {
        const pairs: [string, string][] = [
          ["週初", r.followersStart?.toLocaleString() ?? "-"],
          ["週末", r.followersEnd?.toLocaleString() ?? "-"],
          [
            "増減",
            r.netGrowth !== null
              ? r.netGrowth >= 0
                ? `+${r.netGrowth}`
                : String(r.netGrowth)
              : "-",
          ],
          ["本気投稿", String(r.primaryCount)],
          ["気軽な投稿", String(r.casualCount)],
          ["本気投稿日数", `${r.primaryDays} / 7`],
          ["AI案使用率", r.minimalEditRate],
          ["インプ合計", r.impressions > 0 ? r.impressions.toLocaleString() : "-"],
          ["時間(分)", String(weekTimeTotals.get(r.weekStart) ?? "-")],
        ];
        return (
          <div key={r.weekStart} className="panel">
            <h2 style={{ marginTop: 0 }}>{r.weekStart} の週</h2>
            <div className="stat-pairs">
              {pairs.map(([label, value]) => (
                <div key={label}>
                  <div className="pair-label">{label}</div>
                  <div className="pair-value">{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

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
        <h2 style={{ marginTop: 0 }}>学びの蓄積</h2>
        {learnings.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            ホームの「アドバイスを更新」を実行すると、実測から得た学びがここに蓄積され、以後の診断・提案に反映されます。
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {learnings.map((l, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {l.insight}
                {l.evidence && (
                  <span className="muted" style={{ fontSize: 13 }}>
                    　根拠: {l.evidence}
                  </span>
                )}
                <span className="muted" style={{ fontSize: 12 }}>
                  （{l.created_at.slice(0, 10)}）
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>時間簿</h2>
        <TimeLogForm today={today} />
      </div>

      {(timing.recent.n >= 3 || timing.archive.n >= 20) && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>投稿時間帯の反応（JST）</h2>
          {[
            { key: "recent", title: `直近の実測インプ（${timing.recent.n}本）`, stats: timing.recent, min: 3 },
            { key: "archive", title: `過去アーカイブのいいね（${timing.archive.n}本）`, stats: timing.archive, min: 20 },
          ]
            .filter((s) => s.stats.n >= s.min)
            .map((s) => (
              <div key={s.key} style={{ marginBottom: 12 }}>
                <p className="muted" style={{ margin: "0 0 4px" }}>{s.title}</p>
                <table>
                  <thead>
                    <tr>
                      <th>時間帯</th>
                      <th>本数</th>
                      <th>平均</th>
                      <th>曜日</th>
                      <th>本数</th>
                      <th>平均</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.stats.byHour.map((h, i) => {
                      const d = s.stats.byWeekday[i];
                      return (
                        <tr key={h.label}>
                          <td>{h.label}</td>
                          <td>{h.n || "-"}</td>
                          <td>{h.n ? h.avg.toLocaleString() : "-"}</td>
                          <td>{d ? d.label : ""}</td>
                          <td>{d ? d.n || "-" : ""}</td>
                          <td>{d ? (d.n ? d.avg.toLocaleString() : "-") : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>アルゴリズム攻略メモ（{KNOWLEDGE_VERSION}版）</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          公開されたXのアルゴリズム（Grok系）の解析と海外実測データの要約。AIコーチと投稿診断にも同じ知識が注入されている
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {ALGO_RULES.map((r, i) => (
            <li key={i} style={{ marginBottom: 4 }}>{r}</li>
          ))}
        </ol>
      </div>

      {archiveBest.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>過去のベスト投稿（アーカイブ・いいね順）</h2>
          {archiveBest.map((a, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {a.created_at.slice(0, 10)}　いいね{a.favorite_count}・RP{a.retweet_count}
              </span>
              <div style={{ fontSize: 14 }}>{a.text.replace(/\s+/g, " ").slice(0, 120)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>テーマ別成績</h2>
        {themeStats.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            投稿一覧で各投稿に「＋テーマ」を付けると、どのテーマが伸びるかがここに集計されます。
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>テーマ</th>
                <th>公開本数</th>
                <th>平均インプ</th>
                <th>平均いいね</th>
                <th>平均プロフ</th>
              </tr>
            </thead>
            <tbody>
              {themeStats.map((t) => (
                <tr key={t.theme}>
                  <td>{t.theme}</td>
                  <td>
                    {t.count}
                    {t.unrecorded > 0 && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        （未記録{t.unrecorded}件）
                      </span>
                    )}
                  </td>
                  <td>{t.avgImpressions?.toLocaleString() ?? "-"}</td>
                  <td>{t.avgLikes?.toLocaleString() ?? "-"}</td>
                  <td>{t.avgProfileVisits?.toLocaleString() ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
