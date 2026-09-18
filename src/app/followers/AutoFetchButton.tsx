"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Attempt = { source: string; ok: boolean; detail: string };

// Manual trigger for the same layered fetch the scheduler runs nightly.
// Shows which source answered so a failure is diagnosable, not mysterious.
export default function AutoFetchButton({ autoEnabled }: { autoEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  async function run() {
    setBusy(true);
    setMsg("取得中…");
    setAttempts([]);
    try {
      const res = await fetch("/api/followers/fetch", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setAttempts(data.attempts ?? []);
      if (!res.ok) throw new Error(data.error ?? `失敗しました（HTTP ${res.status}）`);
      setMsg(
        data.written
          ? `${data.followers.toLocaleString()}人を記録しました（${data.source}）`
          : `${data.followers.toLocaleString()}人を取得（今日は手入力済みなので上書きしません）`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: "10px 16px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={run} disabled={busy}>
          {busy ? "取得中…" : "今すぐ自動取得"}
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          {autoEnabled
            ? "毎日21時以降に自動取得。手入力した日はそちらが優先される"
            : "自動取得は設定でオフになっています"}
        </span>
      </div>
      {msg && <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{msg}</p>}
      {attempts.length > 0 && (
        <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
          {attempts.map((a) => `${a.source}: ${a.ok ? "成功" : a.detail}`).join(" ／ ")}
        </p>
      )}
    </div>
  );
}
