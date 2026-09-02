import { getDb } from "./db";

export type PinnedRow = {
  id: number;
  post_id: number;
  applied_on: string;
  text: string;
  before: number | null; // プロフ→フォロー転換率 (%) in the 7 days before
  after: number | null; // ... in the 7 days from applied_on
  beforeVisits: number;
  afterVisits: number;
};

function rate(db: ReturnType<typeof getDb>, from: string, to: string) {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(profile_visits),0) AS visits, COALESCE(SUM(new_follows),0) AS follows
       FROM x_daily_stats WHERE date >= ? AND date <= ?`,
    )
    .get(from, to) as { visits: number; follows: number };
  return {
    visits: r.visits,
    pct: r.visits > 0 ? +((r.follows / r.visits) * 100).toFixed(1) : null,
  };
}

function addDays(d: string, n: number): string {
  return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

// History newest-first, each with the profile-visit -> follow conversion in
// the week before and the week after the change (from the daily CSV data).
export function pinnedHistory(): PinnedRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pp.id, pp.post_id, pp.applied_on, COALESCE(p.final_text, p.raw_text) AS text
       FROM pinned_posts pp JOIN posts p ON p.id = pp.post_id ORDER BY pp.id DESC`,
    )
    .all() as { id: number; post_id: number; applied_on: string; text: string }[];
  return rows.map((r) => {
    const b = rate(db, addDays(r.applied_on, -7), addDays(r.applied_on, -1));
    const a = rate(db, r.applied_on, addDays(r.applied_on, 6));
    return {
      ...r,
      before: b.pct,
      after: a.pct,
      beforeVisits: b.visits,
      afterVisits: a.visits,
    };
  });
}

export type Candidate = {
  post_id: number;
  head: string; // first two lines
  impressions: number;
  likes: number;
  profile_visits: number;
};

// Top 3 published posts by latest measured impressions.
export function pinnedCandidates(): Candidate[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id AS post_id, COALESCE(p.final_text, p.raw_text) AS text,
              pm.impressions, pm.likes, pm.profile_visits
       FROM posts p
       JOIN (SELECT pm.* FROM post_metrics pm
             JOIN (SELECT post_id, MAX(measured_at) AS m FROM post_metrics GROUP BY post_id) x
               ON x.post_id = pm.post_id AND x.m = pm.measured_at) pm ON pm.post_id = p.id
       WHERE p.status = 'PUBLISHED' AND pm.impressions IS NOT NULL
       ORDER BY pm.impressions DESC LIMIT 3`,
    )
    .all() as {
    post_id: number;
    text: string;
    impressions: number;
    likes: number | null;
    profile_visits: number | null;
  }[];
  return rows.map((r) => ({
    post_id: r.post_id,
    // first two lines; CSV-imported posts lost their newlines, so also cap
    // by length
    head: (() => {
      const two = r.text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 2).join("\n");
      return two.length > 90 ? two.slice(0, 90) + "…" : two;
    })(),
    impressions: r.impressions,
    likes: r.likes ?? 0,
    profile_visits: r.profile_visits ?? 0,
  }));
}

export function publishedPostOptions(): { id: number; label: string }[] {
  return (
    getDb()
      .prepare(
        `SELECT id, COALESCE(final_text, raw_text) AS text FROM posts
         WHERE status = 'PUBLISHED' ORDER BY id DESC LIMIT 100`,
      )
      .all() as { id: number; text: string }[]
  ).map((r) => ({
    id: r.id,
    label: `#${r.id} ${r.text.replace(/\s+/g, " ").slice(0, 40)}`,
  }));
}
