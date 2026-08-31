"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CopyButton from "@/components/CopyButton";

type Proposal = {
  id: number;
  title: string;
  reason: string;
  instruction: string;
  created_at: string;
};

export default function ProposalsPanel({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);

  if (proposals.length === 0) return null;

  async function setStatus(id: number, status: "DONE" | "DISMISSED") {
    setBusyId(id);
    await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>アプリ改善提案（CLIMBからの提案）</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        採用する場合は「指示文をコピー」して開発用のClaude Codeチャットに貼り付けてください。実装が終わったら「実装済み」を押す。
      </p>
      {proposals.map((p) => (
        <div
          key={p.id}
          style={{
            borderTop: "1px solid #2a2f3a",
            paddingTop: 12,
            marginTop: 12,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>{p.title}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {p.created_at.slice(0, 10)}
            </span>
          </div>
          <p className="muted" style={{ margin: "4px 0" }}>
            理由: {p.reason}
          </p>
          <details>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>
              実装指示文を見る
            </summary>
            <pre className="plain muted" style={{ fontSize: 13, marginTop: 4 }}>
              {p.instruction}
            </pre>
          </details>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <CopyButton text={p.instruction} label="指示文をコピー" />
            <button
              className="secondary"
              disabled={busyId === p.id}
              onClick={() => setStatus(p.id, "DONE")}
            >
              実装済み
            </button>
            <button
              className="secondary"
              disabled={busyId === p.id}
              onClick={() => setStatus(p.id, "DISMISSED")}
            >
              見送り
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
