"use client";

import { useEffect, useState } from "react";
import {
  readMetricReminders,
  removeMetricReminder,
} from "./metricReminders";

// Fires the one-shot "record the numbers" reminders armed by the
// post-publish sheet. Checks every minute while the app is open; a reminder
// due while the app was closed fires on the next open (banner fallback for
// platforms without Web Notifications). Tapping either path opens the home
// unrecorded card with the post's row expanded.
export default function MetricReminderWatcher() {
  const [duePostId, setDuePostId] = useState<number | null>(null);

  useEffect(() => {
    function check() {
      const due = readMetricReminders().find((r) => r.at <= Date.now());
      if (!due) return;
      removeMetricReminder(due.postId);
      const target = `/?record=${due.postId}`;
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const n = new Notification("CLIMB", {
          body: "公開から24時間。数字を記録しよう",
        });
        n.onclick = () => {
          window.focus();
          window.location.href = target;
        };
      }
      setDuePostId(due.postId);
    }
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (duePostId == null) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#1d2735",
        borderTop: "1px solid #2a2f3a",
        padding: "10px 16px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        zIndex: 50,
      }}
    >
      <span style={{ flex: 1 }}>公開から24時間経過。数字を記録しよう</span>
      <a href={`/?record=${duePostId}`}>
        <button>記録する</button>
      </a>
      <button className="secondary" onClick={() => setDuePostId(null)}>
        ✕
      </button>
    </div>
  );
}
