"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pending = {
  post_id: number;
  kind: string;
  milestone: number | null;
  card_asset_id: number | null;
  text: string;
} | null;

// PROJECT 10K report drafts: auto-generated weekly / at milestones, reviewed
// and posted by the human. On phones the share button hands text + card image
// straight to the X app via the OS share sheet.
export default function ReportPanel({ pending }: { pending: Pending }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function generate() {
    setBusy(true);
    setMsg("報告文とカード画像を生成中…（20秒ほど）");
    try {
      const res = await fetch("/api/report/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成に失敗しました");
      setMsg("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!pending) return;
    try {
      if (pending.card_asset_id != null && navigator.canShare) {
        const blob = await fetch(
          `/api/assets/${pending.card_asset_id}/file`,
        ).then((r) => r.blob());
        const file = new File([blob], "project10k.png", { type: "image/png" });
        if (navigator.canShare({ files: [file], text: pending.text })) {
          await navigator.share({ files: [file], text: pending.text });
          setMsg("共有したら、投稿一覧でこの下書きを「公開済みにする」を忘れずに");
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ text: pending.text });
        setMsg("画像は下のカードを長押し保存して添付を。投稿後は「公開済みにする」を忘れずに");
        return;
      }
      await navigator.clipboard.writeText(pending.text);
      setMsg("本文をコピーしました。画像はカードを保存して添付してください");
    } catch (e) {
      // user cancelling the share sheet throws AbortError - not an error
      if (e instanceof Error && e.name !== "AbortError") setMsg(e.message);
    }
  }

  async function copyText() {
    if (!pending) return;
    try {
      await navigator.clipboard.writeText(pending.text);
      setMsg("本文をコピーしました");
    } catch {
      setMsg("コピーできませんでした。本文を長押しで選択してください");
    }
  }

  if (!pending) {
    return (
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            <strong>報告記事</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              週1回＋マイルストーン到達時、20時に下書きとカード画像が自動で届く
            </div>
          </div>
          <button onClick={generate} disabled={busy}>
            {busy ? "生成中…" : "今すぐ作る"}
          </button>
        </div>
        {msg && <p className="muted" style={{ marginBottom: 0 }}>{msg}</p>}
      </div>
    );
  }

  return (
    <div className="panel" style={{ borderColor: "#d29922" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="badge warn">
          報告記事の下書き（{pending.kind === "MILESTONE"
            ? `${pending.milestone?.toLocaleString()}人到達`
            : "週次"}）
        </span>
      </div>
      <pre className="plain" style={{ margin: "10px 0" }}>{pending.text}</pre>
      {pending.card_asset_id != null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/assets/${pending.card_asset_id}/file`}
          alt="進捗カード"
          style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #2a2f3a" }}
        />
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={share}>Xへ共有</button>
        <button onClick={copyText}>本文コピー</button>
        <a href="/posts" style={{ alignSelf: "center", fontSize: 14 }}>
          直したい/公開済みにする → 投稿一覧
        </a>
      </div>
      {msg && <p className="muted" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
