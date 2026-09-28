"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 「自動で探す」: runs reply-target discovery and reports the outcome inline.
export default function DiscoverButton({ secondary = false }: { secondary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("探索中（1分ほど）…");
    try {
      const res = await fetch("/api/reply/targets/discover", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "失敗しました");
      setMsg(
        d.error
          ? d.error
          : d.added > 0
          ? `${d.added}件追加: ${d.addedHandles.map((h: string) => `@${h}`).join(" ")}（${d.checked}件確認）`
          : `追加なし（${d.checked}件確認・${d.rejected}件除外・${d.invalid}件不明）`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className={secondary ? "secondary" : undefined} disabled={busy} onClick={run}>
        {busy ? "探索中…" : "自動で探す"}
      </button>
      {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
    </span>
  );
}
