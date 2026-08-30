"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "ログインに失敗しました");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="panel" style={{ maxWidth: 360, margin: "48px auto" }}>
      <h1 style={{ marginTop: 0 }}>CLIMB</h1>
      <p className="muted">パスワードを入力</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") login();
          }}
          style={{ flex: 1 }}
          autoFocus
        />
        <button onClick={login} disabled={busy || !password}>
          {busy ? "..." : "ログイン"}
        </button>
      </div>
      {error && (
        <p>
          <span className="badge err">{error}</span>
        </p>
      )}
    </div>
  );
}
