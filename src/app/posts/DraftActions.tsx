"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import PublishFollowupSheet from "@/components/PublishFollowupSheet";
import { removeMetricReminder } from "@/components/metricReminders";
import PostWarnings from "@/components/PostWarnings";
import { checkPostText } from "@/lib/postCheck";

// Publish / discard buttons for DRAFT cards. Both act immediately with a
// 5-second undo toast instead of a confirm dialog (discard is a logical
// delete - status DISCARDED - so nothing is ever lost).
export default function DraftActions({ postId, text }: { postId: number; text: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<"published" | "discarded" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function publishNow() {
    setConfirming(false);
    await patch({ published: true });
    showToast("published");
    setSheet(true);
  }

  async function patch(body: object) {
    setBusy(true);
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  function showToast(kind: "published" | "discarded") {
    setToast(kind);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000);
  }

  async function undo() {
    if (timer.current) clearTimeout(timer.current);
    const kind = toast;
    setToast(null);
    if (kind === "published") {
      setSheet(false);
      removeMetricReminder(postId);
    }
    await patch(
      kind === "published" ? { unpublish: true, to: "DRAFT" } : { restore: true },
    );
  }

  return (
    <>
      <button
        disabled={busy}
        onClick={() => {
          // static checks warn but never block
          if (checkPostText(text).length > 0) setConfirming(true);
          else void publishNow();
        }}
      >
        公開済みにする
      </button>
      {confirming && (
        <div style={{ width: "100%", marginTop: 8 }}>
          <PostWarnings text={text} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={publishNow} disabled={busy}>
              このまま公開
            </button>
            <button className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              やめる
            </button>
          </div>
        </div>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          await patch({ discard: true });
          showToast("discarded");
        }}
      >
        破棄
      </button>
      {sheet && (
        <PublishFollowupSheet postId={postId} onClose={() => setSheet(false)} />
      )}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: sheet ? 170 : 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1d2735",
            border: "1px solid #2a2f3a",
            borderRadius: 8,
            padding: "10px 16px",
            display: "flex",
            gap: 12,
            alignItems: "center",
            zIndex: 60,
          }}
        >
          <span>{toast === "published" ? "公開済みにしました" : "破棄しました"}</span>
          <button className="secondary" onClick={undo}>
            元に戻す
          </button>
        </div>
      )}
    </>
  );
}
