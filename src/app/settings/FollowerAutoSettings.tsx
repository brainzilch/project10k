"use client";

import { useState } from "react";

export default function FollowerAutoSettings({
  handle,
  enabled,
  lastSource,
  lastDate,
}: {
  handle: string;
  enabled: boolean;
  lastSource: string;
  lastDate: string;
}) {
  const [h, setH] = useState(handle);
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState("");

  async function save(key: string, value: string) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setMsg(res.ok ? "保存しました" : "保存に失敗しました");
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        毎日21時以降にフォロワー数を自動取得して記録します（手入力した日はそちらを優先）。
        {lastDate && `　最終取得: ${lastDate}${lastSource ? `（${lastSource}）` : ""}`}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              setOn(e.target.checked);
              void save("follower_auto_enabled", e.target.checked ? "1" : "0");
            }}
          />
          自動取得を使う
        </label>
        <label className="muted" style={{ fontSize: 13 }}>
          ユーザー名{" "}
          <input
            value={h}
            onChange={(e) => setH(e.target.value)}
            style={{ width: 140, fontSize: 14 }}
          />
        </label>
        <button className="secondary" onClick={() => save("x_handle", h.replace(/^@/, ""))}>
          保存
        </button>
      </div>
      {msg && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
