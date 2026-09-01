"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Inline theme label editor. Suggestions come from themes already in use so
// the same theme is not retyped with slight variations (夏祭り vs 夏祭り2026).
export default function ThemeEditor({
  postId,
  theme,
  suggestions,
}: {
  postId: number;
  theme: string | null;
  suggestions: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(theme ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: value }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        className="secondary"
        style={{ padding: "2px 10px", fontSize: 13 }}
        onClick={() => {
          setValue(theme ?? "");
          setEditing(true);
        }}
      >
        {theme ? `テーマ: ${theme}` : "＋テーマ"}
      </button>
    );
  }

  const listId = `theme-list-${postId}`;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list={listId}
        placeholder="例: 現場レポ"
        style={{ width: 140, fontSize: 14, padding: "4px 8px" }}
        autoFocus
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button
        className="secondary"
        style={{ padding: "2px 10px", fontSize: 13 }}
        onClick={save}
        disabled={busy}
      >
        保存
      </button>
      <button
        className="secondary"
        style={{ padding: "2px 10px", fontSize: 13 }}
        onClick={() => setEditing(false)}
        disabled={busy}
      >
        ×
      </button>
    </span>
  );
}
