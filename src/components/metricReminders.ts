// Local (per-device) reminders to record a post's numbers 24h after
// publishing. Stored in localStorage - same client-only model as the daily
// follower reminder; the in-app banner is the fallback where Web
// Notifications are unavailable (iOS Safari).

export type MetricReminder = { postId: number; at: number };

const KEY = "climb_metric_reminders";

export function readMetricReminders(): MetricReminder[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: MetricReminder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function addMetricReminder(postId: number, at: number) {
  const list = readMetricReminders().filter((r) => r.postId !== postId);
  list.push({ postId, at });
  write(list);
}

export function removeMetricReminder(postId: number) {
  write(readMetricReminders().filter((r) => r.postId !== postId));
}
