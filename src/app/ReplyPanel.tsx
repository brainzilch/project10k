"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Target = {
  id: number;
  handle: string;
  note: string | null;
  active: number;
  last_reply: string | null;
  done_today: number;
};

// Today's reply outreach: quota, the auto-picked targets, one-tap open/done,
// and the (collapsed) target list manager. Quota + reason come from the
// server-side rule in lib/reply.ts.
export default function ReplyPanel({
  quota,
  reason,
  targets,
  done,
  all,
}: {
  quota: number;
  reason: string;
  targets: Target[];
  done: number;
  all: Target[];
}) {
  const router = useRouter();
  const [manage, setManage] = useState(all.length === 0);
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "失敗しました");
      setMsg("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const complete = all.some((t) => t.active === 1) && done >= quota;
  const accent = complete ? "#3fb950" : done === 0 ? "#d29922" : "#e6edf3";

  return (
    <div className="panel" style={{ borderColor: complete ? "#3fb950" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong style={{ color: accent }}>
          今日のリプ先 {done}/{quota}
          {complete && "　完了"}
        </strong>
        <button className="secondary" onClick={() => setManage(!manage)} style={{ fontSize: 13 }}>
          {manage ? "閉じる" : "リプ先を管理"}
        </button>
      </div>
      {reason && (
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
          {reason}
        </p>
      )}

      {targets.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {targets.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                borderTop: "1px solid #2a2f3a",
                padding: "6px 0",
                opacity: t.done_today > 0 ? 0.6 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={`https://x.com/${t.handle}`} target="_blank" rel="noreferrer">
                  @{t.handle}
                </a>
                {t.note && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    　{t.note}
                  </span>
                )}
                <div className="muted" style={{ fontSize: 12 }}>
                  {t.last_reply ? `前回 ${t.last_reply}` : "まだリプなし"}
                </div>
              </div>
              {t.done_today > 0 ? (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => call("/api/reply/logs", "DELETE", { target_id: t.id })}
                >
                  済 ↩
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => call("/api/reply/logs", "POST", { target_id: t.id })}
                >
                  済
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {all.filter((t) => t.active === 1).length < quota && (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          リプ先が枠より少ない。同ジャンル（AI×映像・現場）で自分よりフォロワーの多いアカウントを{quota}件以上登録すると回り始める
        </p>
      )}

      {manage && (
        <div style={{ marginTop: 10, borderTop: "1px solid #2a2f3a", paddingTop: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="ユーザー名（@不要）"
              style={{ width: 160, fontSize: 14 }}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="メモ（例: AI×映像・2万人）"
              style={{ width: 180, fontSize: 14 }}
            />
            <button
              disabled={busy || !handle.trim()}
              onClick={async () => {
                await call("/api/reply/targets", "POST", { handle, note });
                setHandle("");
                setNote("");
              }}
            >
              追加
            </button>
          </div>
          {all.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {all.map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "3px 0" }}>
                  <span style={{ flex: 1, opacity: t.active ? 1 : 0.5 }}>
                    @{t.handle}
                    {t.note && <span className="muted" style={{ fontSize: 12 }}>　{t.note}</span>}
                  </span>
                  <button
                    className="secondary"
                    style={{ fontSize: 12, padding: "2px 8px" }}
                    disabled={busy}
                    onClick={() =>
                      call(`/api/reply/targets/${t.id}`, "PATCH", { active: !t.active })
                    }
                  >
                    {t.active ? "外す" : "戻す"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {msg && <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{msg}</p>}
    </div>
  );
}
