import { getDb, getMeta, getSetting, setSetting } from "./db";

// Reply outreach ("リプ営業"). For an account this size, specific replies on
// larger accounts in the same niche are the cheapest distribution channel.
// CLIMB keeps the target list, picks today's batch, tracks completion, and
// tunes the daily quota from measured results - no X API involved.

export const QUOTA_MIN = 3;
export const QUOTA_MAX = 10;
export const QUOTA_DEFAULT = 5;

export type ReplyTarget = {
  id: number;
  handle: string;
  note: string | null;
  priority: number;
  active: number;
  last_reply: string | null;
  done_today: number;
};

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function getQuota(): number {
  const q = Number(getSetting("reply_daily_quota", String(QUOTA_DEFAULT)));
  return Number.isFinite(q) ? Math.min(QUOTA_MAX, Math.max(QUOTA_MIN, q)) : QUOTA_DEFAULT;
}

export function allTargets(): ReplyTarget[] {
  const today = jstToday();
  return (
    getDb()
      .prepare(
        `SELECT t.id, t.handle, t.note, t.priority, t.active,
                (SELECT MAX(date) FROM reply_logs l WHERE l.target_id = t.id) AS last_reply,
                (SELECT COUNT(*) FROM reply_logs l WHERE l.target_id = t.id AND l.date = ?) AS done_today
         FROM reply_targets t ORDER BY t.active DESC, t.priority DESC, t.handle ASC`,
      )
      .all(today) as ReplyTarget[]
  ).map((r) => ({ ...r }));
}

// Today's batch: targets already replied to today stay in the list; the rest
// is filled with the longest-unreplied active targets, priority breaking ties.
export function todayPlan(): { quota: number; targets: ReplyTarget[]; done: number } {
  const quota = getQuota();
  const active = allTargets().filter((t) => t.active === 1);
  const done = active.filter((t) => t.done_today > 0);
  const rest = active
    .filter((t) => t.done_today === 0)
    .sort((a, b) => {
      const la = a.last_reply ?? "";
      const lb = b.last_reply ?? "";
      if (la !== lb) return la < lb ? -1 : 1;
      return b.priority - a.priority;
    });
  const targets = [...done, ...rest].slice(0, Math.max(quota, done.length));
  return { quota, targets, done: done.length };
}

export type ReplyStats = {
  days: number;
  repliesPerDay: number;
  metDays: number;
  followsPerDay: number;
  impPerDay: number;
  neededFollowsPerDay: number;
  neededImpPerDay: number;
};

export function replyStats(): ReplyStats {
  const db = getDb();
  const meta = getMeta();
  const quota = getQuota();
  const since = new Date(Date.now() + 9 * 3600 * 1000 - 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const perDay = db
    .prepare("SELECT date, COUNT(*) AS n FROM reply_logs WHERE date >= ? GROUP BY date")
    .all(since) as { date: string; n: number }[];
  const totalReplies = perDay.reduce((a, b) => a + b.n, 0);
  const metDays = perDay.filter((d) => d.n >= quota).length;
  const daily = db
    .prepare(
      `SELECT COUNT(*) AS days, COALESCE(SUM(new_follows),0) AS fol, COALESCE(SUM(impressions),0) AS imp
       FROM x_daily_stats WHERE date >= ?`,
    )
    .get(since) as { days: number; fol: number; imp: number };
  const remainingDays = Math.max(
    1,
    Number(meta.duration_days) -
      Math.floor((Date.parse(jstToday()) - Date.parse(meta.start_date)) / 86400000),
  );
  const latest = db
    .prepare("SELECT followers FROM daily_followers ORDER BY date DESC LIMIT 1")
    .get() as { followers: number } | undefined;
  const remainingFollowers = Math.max(
    0,
    Number(meta.goal_followers) - (latest?.followers ?? Number(meta.start_followers)),
  );
  return {
    days: daily.days,
    repliesPerDay: +(totalReplies / 7).toFixed(1),
    metDays,
    followsPerDay: daily.days ? +(daily.fol / daily.days).toFixed(1) : 0,
    impPerDay: daily.days ? Math.round(daily.imp / daily.days) : 0,
    neededFollowsPerDay: +(remainingFollowers / remainingDays).toFixed(1),
    neededImpPerDay: 5600,
  };
}

// Transparent rule-based tuning, evaluated once per day. The rule is written
// so the reason line on the home card explains every change.
export function evaluateReplyQuota(force = false): { quota: number; reason: string } {
  const today = jstToday();
  const current = getQuota();
  if (!force && getSetting("reply_quota_eval_date", "") === today) {
    return { quota: current, reason: getSetting("reply_quota_reason", "") };
  }
  const s = replyStats();
  let next = current;
  let reason = "";
  if (s.days < 3) {
    reason = `枠${current}件/日（実データが${s.days}日分。アナリティクスCSVが溜まると自動調整）`;
  } else {
    const followGap = s.followsPerDay < s.neededFollowsPerDay * 0.3;
    const impGap = s.impPerDay < s.neededImpPerDay * 0.5;
    const executing = s.metDays >= 5; // quota met 5 of the last 7 days
    if (followGap && impGap && executing && current < QUOTA_MAX) {
      next = Math.min(QUOTA_MAX, current + 2);
      reason = `新規フォロー${s.followsPerDay}/日（必要${s.neededFollowsPerDay}）・インプ${s.impPerDay}/日（必要${s.neededImpPerDay}）。枠は達成できているので露出を増やす→${next}件に引き上げ`;
    } else if (followGap && impGap && !executing) {
      reason = `新規フォロー${s.followsPerDay}/日（必要${s.neededFollowsPerDay}）。まず枠${current}件を7日中5日以上こなすところから（直近${s.metDays}/7日）`;
    } else if (!followGap && current > QUOTA_DEFAULT) {
      next = Math.max(QUOTA_DEFAULT, current - 1);
      reason = `新規フォロー${s.followsPerDay}/日で必要ペースに近い。枠を${next}件に戻して投稿に時間を回す`;
    } else {
      reason = `枠${current}件/日を維持（新規フォロー${s.followsPerDay}/日・インプ${s.impPerDay}/日・達成${s.metDays}/7日）`;
    }
  }
  setSetting("reply_daily_quota", String(next));
  setSetting("reply_quota_reason", reason);
  setSetting("reply_quota_eval_date", today);
  return { quota: next, reason };
}

// Short block for the coach context.
export function replyPromptBlock(): string {
  const s = replyStats();
  const quota = getQuota();
  const targets = allTargets().filter((t) => t.active === 1).length;
  if (targets === 0) {
    return `\n■ リプ活動: リプ先が未登録（ホームの「今日のリプ先」から登録すると消化管理と枠の自動調整が始まる）`;
  }
  return `\n■ リプ活動（直近7日）: 枠${quota}件/日・実施平均${s.repliesPerDay}件/日・枠達成${s.metDays}/7日・登録リプ先${targets}件。判定: ${getSetting("reply_quota_reason", "")}`;
}

// Daily evaluation from the scheduler.
export async function replyTick(): Promise<void> {
  evaluateReplyQuota();
}
