"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ModelForm({ current }: { current: string }) {
  const router = useRouter();
  const [model, setModel] = useState(current);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "claude_model", value: model }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 260 }} />
      <button onClick={save} disabled={saving || !model.trim()}>
        {saving ? "..." : "保存"}
      </button>
    </div>
  );
}

export function BackupButton() {
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function backup() {
    setBusy(true);
    setResult("");
    const res = await fetch("/api/backup", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setResult(res.ok ? `保存先: ${data.path}` : "バックアップに失敗しました");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={backup} disabled={busy}>
          {busy ? "バックアップ中..." : "今すぐバックアップ"}
        </button>
        <a href="/api/backup/download">
          <button className="secondary">バックアップをダウンロード</button>
        </a>
      </div>
      {result && <p className="muted">{result}</p>}
      <p className="muted" style={{ marginBottom: 0 }}>
        「ダウンロード」はDBのスナップショットを端末に保存する（サーバー障害に備えたオフサイトコピー）。
      </p>
    </div>
  );
}
