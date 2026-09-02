import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { DATA_DIR, getDb, getSetting } from "./db";

// Server-side Web Push. Replaces "only while the app is open" reminders with
// real notifications on the phone (installed as a PWA on iOS). VAPID keys are
// generated once and kept in DATA_DIR (never in git, never in the DB).
type Vapid = { publicKey: string; privateKey: string };

let vapid: Vapid | null = null;

export function getVapid(): Vapid {
  if (vapid) return vapid;
  const envPub = process.env.CLIMB_VAPID_PUBLIC_KEY;
  const envPriv = process.env.CLIMB_VAPID_PRIVATE_KEY;
  if (envPub && envPriv) {
    vapid = { publicKey: envPub, privateKey: envPriv };
    return vapid;
  }
  const file = path.join(DATA_DIR, "vapid.json");
  try {
    vapid = JSON.parse(fs.readFileSync(file, "utf-8")) as Vapid;
  } catch {
    vapid = webpush.generateVAPIDKeys();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(vapid), { mode: 0o600 });
  }
  return vapid;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export function subscriptionCount(): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as {
      n: number;
    }
  ).n;
}

// Sends to every registered device. Dead subscriptions (404/410) are
// removed. Never throws - notifications are best-effort.
export async function sendPushToAll(payload: PushPayload): Promise<number> {
  const db = getDb();
  const subs = db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions")
    .all() as { endpoint: string; p256dh: string; auth: string }[];
  if (subs.length === 0) return 0;
  const { publicKey, privateKey } = getVapid();
  webpush.setVapidDetails("mailto:climb@localhost", publicKey, privateKey);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600 },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(s.endpoint);
      } else {
        console.error(`[climb] push failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return sent;
}

// At most once per (kind, ref): the log row is the lock.
async function pushOnce(kind: string, ref: string, payload: PushPayload): Promise<void> {
  const { changes } = getDb()
    .prepare("INSERT OR IGNORE INTO push_log (kind, ref) VALUES (?, ?)")
    .run(kind, ref);
  if (changes === 0) return;
  await sendPushToAll(payload);
}

function jstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

// Called every 5 minutes from instrumentation.
export async function pushTick(): Promise<void> {
  if (subscriptionCount() === 0) return;
  const db = getDb();
  const now = jstNow();
  const today = now.toISOString().slice(0, 10);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // 1) daily follower entry reminder (server-side twin of the in-app one)
  const time = getSetting("push_reminder_time", "22:00");
  const [h, m] = time.split(":").map(Number);
  const reminderMinutes =
    (Number.isFinite(h) ? h : 22) * 60 + (Number.isFinite(m) ? m : 0);
  if (minutes >= reminderMinutes) {
    const entered = db
      .prepare("SELECT 1 FROM daily_followers WHERE date = ? AND source = 'MANUAL'")
      .get(today);
    if (!entered) {
      await pushOnce("followers", today, {
        title: "CLIMB",
        body: "今日のフォロワー数を記録しよう",
        url: "/followers",
        tag: "followers",
      });
    }
  }

  // 2) 24h after publishing, numbers still unrecorded (recent posts only)
  const due = db
    .prepare(
      `SELECT id FROM posts WHERE status = 'PUBLISHED'
         AND length(published_at) > 10
         AND published_at <= datetime('now', '-1 day')
         AND published_at >= datetime('now', '-7 days')
         AND NOT EXISTS (SELECT 1 FROM post_metrics m WHERE m.post_id = posts.id)`,
    )
    .all() as { id: number }[];
  for (const p of due) {
    await pushOnce("metrics", String(p.id), {
      title: "CLIMB",
      body: "公開から24時間。数字を記録しよう",
      url: `/?record=${p.id}`,
      tag: `metrics-${p.id}`,
    });
  }

  // 3) a report draft or new dev-story ideas are waiting
  const report = db
    .prepare(
      `SELECT rp.post_id FROM report_posts rp JOIN posts p ON p.id = rp.post_id
       WHERE p.status = 'DRAFT' ORDER BY rp.id DESC LIMIT 1`,
    )
    .get() as { post_id: number } | undefined;
  if (report) {
    await pushOnce("report", String(report.post_id), {
      title: "CLIMB",
      body: "報告記事の下書きができました。確認して共有しよう",
      url: "/",
      tag: "report",
    });
  }
  const ideas = db
    .prepare("SELECT MAX(id) AS id FROM dev_story_ideas WHERE status = 'OPEN'")
    .get() as { id: number | null };
  if (ideas.id != null) {
    await pushOnce("devstory", String(ideas.id), {
      title: "CLIMB",
      body: "開発ネタが届きました。使うか判断しよう",
      url: "/",
      tag: "devstory",
    });
  }
}
