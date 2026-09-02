import { getDb, inTransaction } from "./db";

// Fill follower counts for days the owner did not type one, using the X
// overview CSV's daily new_follows / unfollows relative to the nearest
// manually entered anchor. Derived rows never overwrite manual ones and are
// recomputed whenever a new anchor or new daily stats arrive.
export function deriveFollowersFromDailyStats(): number {
  const db = getDb();
  const anchors = db
    .prepare(
      "SELECT date, followers FROM daily_followers WHERE source = 'MANUAL' ORDER BY date ASC",
    )
    .all() as { date: string; followers: number }[];
  if (anchors.length === 0) return 0;
  const stats = db
    .prepare(
      "SELECT date, new_follows, unfollows FROM x_daily_stats ORDER BY date ASC",
    )
    .all() as { date: string; new_follows: number; unfollows: number }[];
  if (stats.length === 0) return 0;
  const net = new Map(stats.map((s) => [s.date, s.new_follows - s.unfollows]));
  const anchorByDate = new Map(anchors.map((a) => [a.date, a.followers]));

  // Forward from each anchor until the next anchor; backward from the first
  // anchor for stats that predate every manual entry.
  const derived = new Map<string, number>();
  const dates = stats.map((s) => s.date);
  const first = anchors[0];
  let running = first.followers;
  for (const d of [...dates].filter((x) => x < first.date).reverse()) {
    // followers at end of day d = followers at end of next day - net(next day)
    const nextDay = addDays(d, 1);
    running -= net.get(nextDay) ?? 0;
    derived.set(d, running);
  }
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const until = anchors[i + 1]?.date ?? "9999-12-31";
    running = a.followers;
    for (const d of dates.filter((x) => x > a.date && x < until)) {
      running += net.get(d) ?? 0;
      derived.set(d, running);
    }
  }

  let written = 0;
  inTransaction(() => {
    for (const [date, followers] of derived) {
      if (anchorByDate.has(date)) continue;
      const { changes } = db
        .prepare(
          `INSERT INTO daily_followers (date, followers, source) VALUES (?, ?, 'DERIVED')
           ON CONFLICT(date) DO UPDATE SET followers = excluded.followers
           WHERE daily_followers.source = 'DERIVED' AND daily_followers.followers != excluded.followers`,
        )
        .run(date, Math.max(0, followers));
      if (changes > 0) written++;
    }
  });
  return written;
}

function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(dateStr + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
