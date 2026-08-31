"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const FIELDS = [
  ["impressions", "インプ"],
  ["likes", "いいね"],
  ["reposts", "RP"],
  ["replies", "返信"],
  ["bookmarks", "ブクマ"],
  ["profile_visits", "プロフ"],
  ["follows", "フォロー"],
] as const;

export default function MetricsForm({
  postId,
  autoOpen = false,
}: {
  postId: number;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button className="secondary" onClick={() => setOpen(true)}>
        メトリクスを記録
      </button>
    );
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/posts/${postId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    setOpen(false);
    setValues({});
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {FIELDS.map(([key, label]) => (
        <input
          key={key}
          type="number"
          min="0"
          placeholder={label}
          value={values[key] ?? ""}
          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
          style={{ width: 80 }}
        />
      ))}
      <button onClick={save} disabled={saving}>
        {saving ? "..." : "記録する"}
      </button>
      <button className="secondary" onClick={() => setOpen(false)}>
        閉じる
      </button>
    </div>
  );
}
