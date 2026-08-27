"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FollowerForm({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [followers, setFollowers] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/followers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, followers: Number(followers) }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("保存に失敗しました");
      return;
    }
    setFollowers("");
    router.refresh();
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input
          type="number"
          min="0"
          placeholder="followers"
          value={followers}
          onChange={(e) => setFollowers(e.target.value)}
          style={{ width: 140 }}
        />
        <button onClick={save} disabled={saving || followers === ""}>
          {saving ? "Saving..." : "Save"}
        </button>
        {error && <span className="badge err">{error}</span>}
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        同じ日付は上書きされます。
      </p>
    </div>
  );
}
