"use client";

import { useEffect, useState } from "react";
import { REMINDER_KEYS } from "@/components/ReminderWatcher";

export default function ReminderSettings() {
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("22:00");
  const [notifState, setNotifState] = useState<string>("unsupported");

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(REMINDER_KEYS.enabled) === "1");
      setTime(localStorage.getItem(REMINDER_KEYS.time) || "22:00");
    } catch {}
    if (typeof Notification !== "undefined") {
      setNotifState(Notification.permission);
    }
  }, []);

  function persist(nextEnabled: boolean, nextTime: string) {
    try {
      localStorage.setItem(REMINDER_KEYS.enabled, nextEnabled ? "1" : "0");
      localStorage.setItem(REMINDER_KEYS.time, nextTime);
    } catch {}
    window.dispatchEvent(new Event("climb-reminder-changed"));
  }

  async function toggle(next: boolean) {
    setEnabled(next);
    persist(next, time);
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setNotifState(result);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
          />
          リマインドを有効にする
        </label>
        <input
          type="time"
          value={time}
          disabled={!enabled}
          onChange={(e) => {
            setTime(e.target.value);
            persist(enabled, e.target.value);
          }}
        />
        {enabled && notifState === "granted" && <span className="badge ok">通知 許可済み</span>}
        {enabled && notifState === "denied" && (
          <span className="badge warn">通知ブロック中（バナーのみ）</span>
        )}
        {enabled && notifState === "unsupported" && (
          <span className="badge warn">この端末は通知非対応（バナーで代替）</span>
        )}
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        設定時刻を過ぎてもその日のフォロワー数が未入力なら知らせる（入力済みの日はスキップ）。
        通知はアプリを開いている間のみ動作し、iPhoneでは通知の代わりに画面下のバナーで知らせる。
        設定はこの端末のブラウザに保存される。
      </p>
    </div>
  );
}
