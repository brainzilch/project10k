"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Idea = { id: number; title: string; text: string };

// Stocked AI-drafted dev-story posts. The owner approves (-> normal DRAFT
// with theme AI開発) or dismisses each; nothing is ever posted automatically.
export default function DevStoriesPanel({ ideas }: { ideas: Idea[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refill() {
    setBusy(true);
    setMsg("ネタを生成中…（20秒ほど）");
    try {
      const res = await fetch("/api/devstories/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成に失敗しました");
      setMsg(data.added === 0 ? "新しいネタが見つかりませんでした" : "");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: number, action: "use" | "dismiss") {
    setBusy(true);
    try {
      const res = await fetch(`/api/devstories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [action]: true }),
      });
      if (res.ok && action === "use") {
        setMsg("下書きを作りました。投稿一覧で診断→仕上げができます");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <strong>開発ネタのストック</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            AIと組んだ現場の出来事を投稿ネタ化。使うかどうかはここで判断（自動投稿はしない）
          </div>
        </div>
        {ideas.length < 3 && (
          <button className="secondary" onClick={refill} disabled={busy}>
            {busy ? "生成中…" : "ネタを補充"}
          </button>
        )}
      </div>
      {ideas.map((idea) => (
        <div
          key={idea.id}
          style={{ borderTop: "1px solid #2a2f3a", paddingTop: 8, marginTop: 8 }}
        >
          <div className="muted" style={{ fontSize: 12 }}>{idea.title}</div>
          <pre className="plain" style={{ margin: "4px 0 8px" }}>{idea.text}</pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => act(idea.id, "use")} disabled={busy}>
              下書きにする
            </button>
            <button
              className="secondary"
              onClick={() => act(idea.id, "dismiss")}
              disabled={busy}
            >
              ボツ
            </button>
          </div>
        </div>
      ))}
      {msg && <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>{msg}</p>}
    </div>
  );
}
