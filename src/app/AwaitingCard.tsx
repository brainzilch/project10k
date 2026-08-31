"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const FIELDS = [
  ["impressions", "インプ"],
  ["likes", "いいね"],
  ["reposts", "RP"],
  ["replies", "返信"],
  ["profile_visits", "プロフ"],
  ["follows", "フォロー"],
] as const;

export type AwaitingRow = { id: number; excerpt: string; days: number };

// Count card for published posts (24h+) with no metrics. Tap to expand rows
// with inline entry - numbers or a screenshot, no navigation needed.
export default function AwaitingCard({ rows }: { rows: AwaitingRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<number, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const shotInputs = useRef<Record<number, HTMLInputElement | null>>({});

  if (rows.length === 0) return null;

  function setValue(id: number, key: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], [key]: v } }));
  }

  async function save(id: number) {
    setBusyId(id);
    await fetch(`/api/posts/${id}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values[id] ?? {}),
    });
    setBusyId(null);
    router.refresh();
  }

  async function importShot(id: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusyId(id);
    setMessages((m) => ({ ...m, [id]: "" }));
    const form = new FormData();
    form.set("post_id", String(id));
    for (const f of Array.from(files)) form.append("files", f);
    const res = await fetch("/api/metrics/import", { method: "POST", body: form });
    const data = await res.json();
    setBusyId(null);
    const input = shotInputs.current[id];
    if (input) input.value = "";
    const errorDetail =
      !res.ok
        ? (data.error ?? "読み取りに失敗しました")
        : (data.results ?? []).find((r: { status: string }) => r.status === "error")
            ?.detail;
    if (errorDetail) {
      setMessages((m) => ({ ...m, [id]: errorDetail }));
      return;
    }
    router.refresh();
  }

  return (
    <div className="panel" style={{ borderColor: "#d29922" }}>
      <h2
        style={{ margin: 0, cursor: "pointer", color: "#d29922" }}
        onClick={() => setExpanded(!expanded)}
      >
        数字未記録の公開投稿 {rows.length}件 {expanded ? "▾" : "▸"}
      </h2>
      {expanded &&
        rows.map((row) => (
          <div
            key={row.id}
            style={{ borderTop: "1px solid #2a2f3a", paddingTop: 8, marginTop: 8 }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Link
                href={`/posts?record=${row.id}#post-${row.id}`}
                style={{
                  color: "inherit",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.excerpt}
              </Link>
              <span
                className={`badge ${row.days >= 3 ? "err" : "warn"}`}
                style={{ marginLeft: "auto", flexShrink: 0 }}
              >
                {row.days}日経過
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              {FIELDS.map(([key, label]) => (
                <input
                  key={key}
                  type="number"
                  min="0"
                  placeholder={label}
                  value={values[row.id]?.[key] ?? ""}
                  onChange={(e) => setValue(row.id, key, e.target.value)}
                  style={{ width: 72 }}
                />
              ))}
              <button onClick={() => save(row.id)} disabled={busyId === row.id}>
                {busyId === row.id ? "..." : "記録"}
              </button>
              <button
                className="secondary"
                onClick={() => shotInputs.current[row.id]?.click()}
                disabled={busyId === row.id}
              >
                📷
              </button>
              <input
                ref={(el) => {
                  shotInputs.current[row.id] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={(e) => importShot(row.id, e.target.files)}
              />
            </div>
            {messages[row.id] && (
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                {messages[row.id]}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
