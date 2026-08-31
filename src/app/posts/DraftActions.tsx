"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Publish / discard buttons for DRAFT cards. Both act immediately with a
// 5-second undo toast instead of a confirm dialog (discard is a logical
// delete - status DISCARDED - so nothing is ever lost).
export default function DraftActions({ postId }: { postId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<"published" | "discarded" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    await patch(
      kind === "published" ? { unpublish: true, to: "DRAFT" } : { restore: true },
    );
  }

  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          await patch({ published: true });
          showToast("published");
        }}
      >
        公開済みにする
      </button>
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
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
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
