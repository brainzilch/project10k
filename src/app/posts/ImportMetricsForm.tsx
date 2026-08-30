"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ImportResult = {
  filename: string;
  status: "appended" | "created" | "error";
  post_id?: number;
  detail: string;
};

export default function ImportMetricsForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  async function importScreenshots() {
    const files = fileInput.current?.files;
    if (!files || files.length === 0) return;
    setBusy(true);
    setResults([]);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    const res = await fetch("/api/metrics/import", { method: "POST", body: form });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setResults([
        { filename: "-", status: "error", detail: data.error ?? "取り込みに失敗しました" },
      ]);
      return;
    }
    setResults(data.results);
    if (fileInput.current) fileInput.current.value = "";
    router.refresh();
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Xアナリティクス取り込み</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
        />
        <button onClick={importScreenshots} disabled={busy}>
          {busy ? "読み取り中..." : "スクショから自動入力"}
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        「ポストアクティビティ」画面のスクショをアップすると、AIが数字を読み取ってメトリクスに追記する。CLIMBに記録のない投稿は「直接投稿」として自動登録。スクショはANALYTICSのAssetとしてDriveにも保存される。
      </p>
      {results.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          {results.map((r, i) => (
            <li key={i} style={{ fontSize: 14 }}>
              {r.status === "error" ? (
                <span className="badge err">{r.filename}: {r.detail}</span>
              ) : (
                <span>{r.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
