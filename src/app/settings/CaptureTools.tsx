"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CaptureTools() {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState("");

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
      {result && <p className="muted">{result}</p>}
    </div>
  );
}
