"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Daily follower-entry reminder. Client-only (localStorage settings, no
// server): a timer fires at the configured time while the app is open and
// shows a Web Notification where supported; the in-app banner is the
// fallback that works on every device (iOS Safari has no page notifications).
// Skips entirely when today's count is already entered.

export const REMINDER_KEYS = {
  enabled: "climb_reminder_enabled",
  time: "climb_reminder_time",
  dismissed: "climb_reminder_dismissed",
};

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function todayEntered(): Promise<boolean> {
  try {
    const res = await fetch("/api/followers");
    if (!res.ok) return true; // fail quiet - never nag on errors
    const rows = (await res.json()) as { date: string }[];
    const today = localToday();
    return rows.some((r) => r.date === today);
  } catch {
    return true;
  }
}

export default function ReminderWatcher() {
  const pathname = usePathname();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function fireTimeToday(time: string): Date {
      const [h, m] = time.split(":").map(Number);
      const d = new Date();
      d.setHours(h ?? 22, m ?? 0, 0, 0);
      return d;
    }

    async function maybeRemind(viaTimer: boolean) {
      if (readSetting(REMINDER_KEYS.enabled) !== "1") return;
      if (readSetting(REMINDER_KEYS.dismissed) === localToday()) return;
      if (await todayEntered()) return;
      if (cancelled) return;
      if (
        viaTimer &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const n = new Notification("CLIMB", {
          body: "今日のフォロワー数を記録しましょう",
        });
        n.onclick = () => {
          window.focus();
          window.location.href = "/followers";
        };
      }
      setShowBanner(true);
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      if (readSetting(REMINDER_KEYS.enabled) !== "1") return;
      const time = readSetting(REMINDER_KEYS.time) || "22:00";
      const fireAt = fireTimeToday(time);
      const now = new Date();
      if (fireAt <= now) {
        // past today's reminder time: check now, then arm for tomorrow
        void maybeRemind(false);
        fireAt.setDate(fireAt.getDate() + 1);
      }
      timer = setTimeout(async () => {
        await maybeRemind(true);
        schedule(); // re-arm for the next day
      }, fireAt.getTime() - now.getTime());
    }

    schedule();
    const onChanged = () => {
      setShowBanner(false);
      schedule();
    };
    window.addEventListener("climb-reminder-changed", onChanged);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("climb-reminder-changed", onChanged);
    };
  }, []);

  if (!showBanner || pathname === "/followers") return null;

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
      <span style={{ flex: 1 }}>今日のフォロワー数が未入力です</span>
      <Link href="/followers">
        <button>入力する</button>
      </Link>
      <button
        className="secondary"
        onClick={() => {
          try {
            localStorage.setItem(REMINDER_KEYS.dismissed, localToday());
          } catch {}
          setShowBanner(false);
        }}
      >
        ✕
      </button>
    </div>
  );
}
