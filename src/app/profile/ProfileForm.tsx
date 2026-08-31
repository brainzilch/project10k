"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProfileForm({
  initialName,
  initialBio,
}: {
  initialName: string;
  initialBio: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [assessment, setAssessment] = useState("");
  const [improvedBio, setImprovedBio] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function diagnose() {
    setBusy("diagnose");
    setError("");
    const res = await fetch("/api/profile/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bio }),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(data.error ?? "診断に失敗しました");
      return;
    }
    setAssessment(data.assessment);
    setImprovedBio(data.improved_bio);
  }

  async function save() {
    setBusy("save");
    setError("");
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        bio,
        ai_feedback: assessment || undefined,
        ai_edit: improvedBio || undefined,
      }),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(data.error ?? "保存に失敗しました");
      return;
    }
    setAssessment("");
    setImprovedBio("");
    router.refresh();
  }

  return (
    <div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>現在の文面</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前"
          style={{ width: "100%", marginBottom: 8 }}
        />
        <textarea
          rows={4}
          maxLength={160}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="bio（160字以内）"
        />
        <p className="muted" style={{ margin: "4px 0 8px" }}>
          {bio.length} / 160
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="secondary"
            onClick={diagnose}
            disabled={busy !== "" || !bio.trim()}
          >
            {busy === "diagnose" ? "診断中..." : "AIに診断"}
          </button>
          <button onClick={save} disabled={busy !== "" || !name.trim() || !bio.trim()}>
            {busy === "save" ? "保存中..." : "この文面にした（保存）"}
          </button>
        </div>
        {error && (
          <p>
            <span className="badge err">{error}</span>
          </p>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          保存すると「この文にした日」が記録され、フォロワーグラフに変更日の点線が引かれる。X側のプロフィール更新は本人が行う。
        </p>
      </div>

      {assessment && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>AI診断（3項目）</h2>
          <pre className="plain">{assessment}</pre>
        </div>
      )}

      {improvedBio && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>改善版（1案）</h2>
          <pre className="plain">{improvedBio}</pre>
          <div style={{ marginTop: 8 }}>
            <button className="secondary" onClick={() => setBio(improvedBio)}>
              この文面を使う
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
