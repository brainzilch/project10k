"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Web Push enrolment for this device. iOS needs the app installed to the
// home screen first (Safari has no push for plain tabs).
export default function PushSettings({
  devices,
  reminderTime,
}: {
  devices: number;
  reminderTime: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [time, setTime] = useState(reminderTime);

  useEffect(() => {
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification !== "undefined";
    setSupported(ok);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true,
    );
    if (!ok) return;
    navigator.serviceWorker
      .getRegistration()
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => setSubscribed(Boolean(s)))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("通知が許可されませんでした");
      const { publicKey } = await fetch("/api/push/vapid").then((r) => r.json());
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("登録に失敗しました");
      setSubscribed(true);
      await fetch("/api/push/test", { method: "POST" });
      setMsg("有効化しました。テスト通知を送ったので届くか確認してください");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "有効化に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("この端末の通知を止めました");
    } finally {
      setBusy(false);
    }
  }

  async function saveTime() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "push_reminder_time", value: time }),
    });
    setMsg(`フォロワー入力の通知時刻を ${time} にしました`);
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        アプリを閉じていても届く通知: フォロワー入力（毎日）・公開24時間後の数字記録・
        報告記事の下書き・開発ネタの到着。登録端末 {devices}台
      </p>
      {supported === false && (
        <p className="muted">
          この環境はプッシュ通知に非対応です。iPhoneは Safari の共有メニューから
          「ホーム画面に追加」して、そのアイコンから開いてください。
        </p>
      )}
      {supported && !standalone && (
        <p className="muted" style={{ fontSize: 13 }}>
          iPhoneの場合: 先に「ホーム画面に追加」したアイコンから開くと有効化できます。
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {subscribed ? (
          <button className="secondary" onClick={disable} disabled={busy}>
            この端末の通知を止める
          </button>
        ) : (
          <button onClick={enable} disabled={busy || supported === false}>
            {busy ? "設定中…" : "この端末でプッシュ通知を有効にする"}
          </button>
        )}
        <label className="muted" style={{ fontSize: 13 }}>
          フォロワー入力の通知時刻{" "}
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <button className="secondary" onClick={saveTime} disabled={busy}>
          保存
        </button>
      </div>
      {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}
    </div>
  );
}
