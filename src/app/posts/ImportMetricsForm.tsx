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
  const csvInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [csvMsg, setCsvMsg] = useState("");

  async function importCsv(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setCsvMsg("CSVを取り込み中…");
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    try {
      const res = await fetch("/api/analytics/csv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取り込みに失敗しました");
      const parts = [];
      if (data.rows > 0)
        parts.push(
          `投稿${data.rows}行: 数字更新${data.appended}・変化なし${data.unchanged}・新規登録${data.created}・返信スキップ${data.repliesSkipped}`,
        );
      if (data.dailyRows > 0) parts.push(`日次データ${data.dailyRows}日分`);
      setCsvMsg(parts.join(" ／ ") || "取り込むデータがありませんでした");
      router.refresh();
    } catch (e) {
      setCsvMsg(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setBusy(false);
      if (csvInput.current) csvInput.current.value = "";
    }
  }

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
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 12,
          borderTop: "1px solid #2a2f3a",
          paddingTop: 12,
        }}
      >
        <button
          className="secondary"
          onClick={() => csvInput.current?.click()}
          disabled={busy}
        >
          {busy ? "処理中…" : "アナリティクスCSVを取り込む（推奨）"}
        </button>
        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => importCsv(e.target.files)}
        />
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        入手方法: X → プロフィール → アナリティクス → コンテンツ →
        右上のダウンロードでCSVを保存してここへ。全投稿の正確な数字（新しいフォロー数含む）が一括で入る。
        数字が変わっていない投稿には追記しないので、毎日アップしてOK。返信は自動でスキップ。
      </p>
      {csvMsg && <p className="muted" style={{ fontSize: 13 }}>{csvMsg}</p>}
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
