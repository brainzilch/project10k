"use client";

import { checkPostText } from "@/lib/postCheck";

// Red one-line bars per warning plus the text with matches highlighted.
export default function PostWarnings({ text }: { text: string }) {
  const warnings = checkPostText(text);
  if (warnings.length === 0) return null;
  const marks = warnings.flatMap((w) => w.matches);
  const parts: { s: string; hit: boolean }[] = [];
  if (marks.length > 0) {
    const re = new RegExp(
      marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
      "g",
    );
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index! > last) parts.push({ s: text.slice(last, m.index), hit: false });
      parts.push({ s: m[0], hit: true });
      last = m.index! + m[0].length;
    }
    if (last < text.length) parts.push({ s: text.slice(last), hit: false });
  }
  return (
    <div style={{ marginBottom: 8 }}>
      {warnings.map((w) => (
        <div
          key={w.rule}
          style={{
            background: "#3b1219",
            border: "1px solid #f85149",
            color: "#ffb3b3",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
            marginBottom: 4,
          }}
        >
          {w.message}
        </div>
      ))}
      {parts.length > 0 && (
        <pre className="plain muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
          {parts.map((p, i) =>
            p.hit ? (
              <mark key={i} style={{ background: "#f85149", color: "#fff", borderRadius: 3 }}>
                {p.s}
              </mark>
            ) : (
              <span key={i}>{p.s}</span>
            ),
          )}
        </pre>
      )}
    </div>
  );
}
