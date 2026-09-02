import { getDb } from "./db";

// When do this account's posts land? Two sources, both converted to JST:
// - recent: CLIMB-era published posts with a time-of-day and measured
//   impressions (the metric that matters for the monetization ladder)
// - archive: the imported X history, using likes as the response signal
//   (impressions are not in the archive) - years of data, weaker metric
export type WindowStat = { label: string; n: number; avg: number };
export type TimingReport = {
  recent: { byHour: WindowStat[]; byWeekday: WindowStat[]; n: number };
  archive: { byHour: WindowStat[]; byWeekday: WindowStat[]; n: number };
};

const HOUR_BUCKETS: [number, number, string][] = [
  [5, 8, "早朝 5-8時"],
  [9, 11, "朝 9-11時"],
  [12, 14, "昼 12-14時"],
  [15, 17, "午後 15-17時"],
  [18, 20, "夕方 18-20時"],
  [21, 23, "夜 21-23時"],
  [0, 4, "深夜 0-4時"],
];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function jst(iso: string): Date | null {
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return null;
  return new Date(t + 9 * 3600 * 1000);
}

function summarize(samples: { at: Date; value: number }[]) {
  const hour = HOUR_BUCKETS.map(([from, to, label]) => {
    const xs = samples.filter((s) => {
      const h = s.at.getUTCHours();
      return h >= from && h <= to;
    });
    return {
      label,
      n: xs.length,
      avg: xs.length ? Math.round(xs.reduce((a, b) => a + b.value, 0) / xs.length) : 0,
    };
  });
  const weekday = WEEKDAYS.map((label, i) => {
    const xs = samples.filter((s) => s.at.getUTCDay() === i);
    return {
      label,
      n: xs.length,
      avg: xs.length ? Math.round(xs.reduce((a, b) => a + b.value, 0) / xs.length) : 0,
    };
  });
  return { byHour: hour, byWeekday: weekday, n: samples.length };
}

export function timingReport(): TimingReport {
  const db = getDb();
  const recentRows = db
    .prepare(
      `SELECT p.published_at AS at, pm.impressions AS value FROM posts p
       JOIN (SELECT pm.post_id, pm.impressions FROM post_metrics pm
             JOIN (SELECT post_id, MAX(measured_at) AS m FROM post_metrics GROUP BY post_id) x
               ON x.post_id = pm.post_id AND x.m = pm.measured_at) pm ON pm.post_id = p.id
       WHERE p.status = 'PUBLISHED' AND length(p.published_at) > 10 AND pm.impressions IS NOT NULL`,
    )
    .all() as { at: string; value: number }[];
  const archiveRows = db
    .prepare(
      `SELECT created_at AS at, favorite_count AS value FROM x_archive_posts
       WHERE is_retweet = 0 AND is_reply = 0 AND created_at != ''`,
    )
    .all() as { at: string; value: number }[];
  const toSamples = (rows: { at: string; value: number }[]) =>
    rows
      .map((r) => ({ at: jst(r.at), value: Number(r.value) }))
      .filter((s): s is { at: Date; value: number } => s.at !== null);
  return {
    recent: summarize(toSamples(recentRows)),
    archive: summarize(toSamples(archiveRows)),
  };
}

// One-paragraph version for prompts. Empty until there is enough data.
export function timingPromptBlock(): string {
  const r = timingReport();
  const pick = (
    stats: { byHour: WindowStat[]; byWeekday: WindowStat[]; n: number },
    metric: string,
    minN: number,
  ) => {
    if (stats.n < minN) return null;
    const hours = stats.byHour.filter((h) => h.n >= 2).sort((a, b) => b.avg - a.avg);
    const days = stats.byWeekday.filter((d) => d.n >= 2).sort((a, b) => b.avg - a.avg);
    if (hours.length === 0) return null;
    return `${metric}: 時間帯上位 ${hours
      .slice(0, 3)
      .map((h) => `${h.label}(平均${h.avg}/n=${h.n})`)
      .join("・")}${days.length ? `／曜日上位 ${days.slice(0, 3).map((d) => `${d.label}(${d.avg})`).join("・")}` : ""}`;
  };
  const lines = [
    pick(r.recent, "直近の実測インプ", 6),
    pick(r.archive, "過去アーカイブのいいね", 20),
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return `\n\n【投稿時間帯の実測（JST）】\n${lines.join("\n")}`;
}
