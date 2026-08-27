"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const UPLOAD_SOURCES = ["X_SCREENSHOT", "ANALYTICS", "CLIMB", "OTHER"];

export default function CaptureTools() {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState("");
  const [source, setSource] = useState("OTHER");
  const fileInput = useRef<HTMLInputElement>(null);

  async function capture() {
    setBusy("capture");
    setResult("");
    const res = await fetch("/api/capture", { method: "POST" });
    const data = await res.json();
    setBusy("");
    setResult(
      res.ok
        ? `CLIMB全${data.count}画面をスクショしてAsset登録しました`
        : data.error ?? "キャプチャに失敗しました",
    );
    router.refresh();
  }

  async function scan() {
    setBusy("scan");
    setResult("");
    const res = await fetch("/api/inbox/scan", { method: "POST" });
    const data = await res.json();
    setBusy("");
    setResult(
      res.ok
        ? data.count > 0
          ? `${data.count}件の画像を取り込みました`
          : "取り込みフォルダに新しい画像はありません"
        : data.error ?? "取り込みに失敗しました",
    );
    router.refresh();
  }

  async function upload() {
    const files = fileInput.current?.files;
    if (!files || files.length === 0) return;
    setBusy("upload");
    setResult("");
    const form = new FormData();
    form.set("source", source);
    for (const f of Array.from(files)) form.append("files", f);
    const res = await fetch("/api/assets/upload", { method: "POST", body: form });
    const data = await res.json();
    setBusy("");
    setResult(
      res.ok
        ? `${data.count}枚をAsset登録しました`
        : data.error ?? "アップロードに失敗しました",
    );
    if (res.ok && fileInput.current) fileInput.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={capture} disabled={busy !== ""}>
          {busy === "capture" ? "キャプチャ中..." : "CLIMB全画面をスクショ"}
        </button>
        <button className="secondary" onClick={scan} disabled={busy !== ""}>
          {busy === "scan" ? "取り込み中..." : "取り込みフォルダをスキャン"}
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
        />
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {UPLOAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={upload} disabled={busy !== ""}>
          {busy === "upload" ? "アップロード中..." : "画像をアップロード"}
        </button>
      </div>
      {result && <p className="muted">{result}</p>}
    </div>
  );
}
