"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = ["MAIN_WORK", "PROJECT10K", "CLIMB", "NOTE", "OTHER"];

export default function TimeLogForm({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("PROJECT10K");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/timelogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, category, minutes: Number(minutes) }),
    });
    setSaving(false);
    setMinutes("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="number"
        min="1"
        placeholder="minutes"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        style={{ width: 100 }}
      />
      <button onClick={save} disabled={saving || minutes === ""}>
        {saving ? "..." : "記録"}
      </button>
    </div>
  );
}
