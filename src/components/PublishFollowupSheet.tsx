"use client";

import { useState } from "react";
import { addMetricReminder } from "./metricReminders";

// Bottom sheet shown right after a post is switched to published: arm the
// 24h record-the-numbers reminder (default ON) and optionally link the live
// X post URL. Two controls only - no new screens.
export default function PublishFollowupSheet({
  postId,
  onClose,
}: {
  postId: number;
  onClose: () => void;
}) {
  const [remind, setRemind] = useState(true);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function done() {
    setBusy(true);
    try {
      if (remind) {
        addMetricReminder(postId, Date.now() + 24 * 60 * 60 * 1000);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "default"
        ) {
          try {
            await Notification.requestPermission();
          } catch {}
        }
      }
      if (url.trim()) {
        await fetch(`/api/posts/${postId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x_url: url.trim() }),
        });
      }
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#1d2735",
        borderTop: "1px solid #2a2f3a",
        borderRadius: "12px 12px 0 0",
        padding: "14px 16px calc(14px + env(safe-area-inset-bottom))",
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <strong>公開済みにしました</strong>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        ここからの30分が拡散の分水嶺。来たリプには全部返信する（会話の往復はいいねの約150倍の評価）
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input
          type="checkbox"
          checked={remind}
          onChange={(e) => setRemind(e.target.checked)}
        />
        24時間後に数字を記録するよう通知する
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Xの投稿URLを貼る（任意）"
        style={{ fontSize: 14 }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={done} disabled={busy}>
          OK
        </button>
      </div>
    </div>
  );
}
