"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const shotInput = useRef<HTMLInputElement>(null);

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

  // この投稿に直接紐付けてアナリティクススクショを読み取る（照合なし）
  async function importFromScreenshot(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImporting(true);
    setMessage("");
    const form = new FormData();
    form.set("post_id", String(postId));
    for (const f of Array.from(files)) form.append("files", f);
    const res = await fetch("/api/metrics/import", { method: "POST", body: form });
    const data = await res.json();
    setImporting(false);
    if (shotInput.current) shotInput.current.value = "";
    if (!res.ok) {
      setMessage(data.error ?? "読み取りに失敗しました");
      return;
    }
    const failed = (data.results ?? []).filter(
      (r: { status: string }) => r.status === "error",
    );
    if (failed.length > 0) {
      setMessage(failed[0].detail ?? "読み取りに失敗しました");
      return;
    }
    setMessage(String(data.results?.[0]?.detail ?? "記録しました"));
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => shotInput.current?.click()}
          disabled={importing || saving}
        >
          {importing ? "読み取り中..." : "スクショから入力"}
        </button>
        <input
          ref={shotInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => importFromScreenshot(e.target.files)}
        />
        <span className="muted" style={{ fontSize: 13 }}>
          または手入力:
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 8,
        }}
      >
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
        <button onClick={save} disabled={saving || importing}>
          {saving ? "..." : "記録する"}
        </button>
        <button className="secondary" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
      {message && (
        <p className="muted" style={{ marginBottom: 0 }}>
          {message}
        </p>
      )}
    </div>
  );
}
