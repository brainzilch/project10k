"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = {
  post_id: number;
  head: string;
  impressions: number;
  likes: number;
  profile_visits: number;
};

export default function PinnedPostForm({
  currentPostId,
  options,
  candidates,
}: {
  currentPostId: number | null;
  options: { id: number; label: string }[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(currentPostId ? String(currentPostId) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function pin(postId: number) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/profile/pinned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setMsg("記録しました。X側でもこの投稿を固定してください");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ maxWidth: "100%", fontSize: 14 }}
        >
          <option value="">投稿一覧から選ぶ</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !selected || Number(selected) === currentPostId}
          onClick={() => pin(Number(selected))}
        >
          固定ポストにした（保存）
        </button>
      </div>

      {candidates.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: "0 0 4px" }}>
            候補（実測インプ上位3件）
          </p>
          {candidates.map((c) => (
            <div
              key={c.post_id}
              style={{
                borderTop: "1px solid #2a2f3a",
                padding: "8px 0",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <pre className="plain" style={{ margin: 0, fontSize: 14 }}>
                  {c.head}
                </pre>
                <span className="muted" style={{ fontSize: 12 }}>
                  Imp {c.impressions.toLocaleString()}・いいね {c.likes}・プロフ訪問 {c.profile_visits}
                  {c.post_id === currentPostId && "　（現在の固定ポスト）"}
                </span>
              </div>
              {c.post_id !== currentPostId && (
                <button className="secondary" disabled={busy} onClick={() => pin(c.post_id)}>
                  固定にする
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {msg && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
