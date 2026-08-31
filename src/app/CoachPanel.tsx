"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CoachPanel({
  summary,
  actions,
  reportedAt,
  learningsCount,
}: {
  summary: string | null;
  actions: string[];
  reportedAt: string | null;
  learningsCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/coach", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "コーチ分析に失敗しました");
      return;
    }
    router.refresh();
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>AIコーチ</h2>
        {reportedAt && (
          <span className="muted" style={{ fontSize: 13 }}>
            {reportedAt} 時点
          </span>
        )}
        <span className="badge" style={{ marginLeft: "auto" }}>
          学び {learningsCount}件
        </span>
        <button className="secondary" onClick={refresh} disabled={busy}>
          {busy ? "分析中..." : "アドバイスを更新"}
        </button>
      </div>
      {error && (
        <p>
          <span className="badge err">{error}</span>
        </p>
      )}
      {summary ? (
        <>
          <pre className="plain" style={{ marginTop: 8 }}>
            {summary}
          </pre>
          {actions.length > 0 && (
            <>
              <p className="muted" style={{ marginBottom: 4 }}>
                次の一手:
              </p>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ol>
            </>
          )}
        </>
      ) : (
        <p className="muted" style={{ marginBottom: 0 }}>
          「アドバイスを更新」を押すと、蓄積された実測データ（フォロワー推移・全投稿・数字）を分析して、現状と次の一手を提示します。分析で得た学びは以後の投稿診断とチャットに自動で反映されます。
        </p>
      )}
    </div>
  );
}
