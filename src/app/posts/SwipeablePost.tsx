"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Left-swipe a DRAFT card to reveal 「公開済みにする」. No confirm dialog -
// a 5-second undo toast reverts instead. Server-rendered card content is
// passed through as children.
export default function SwipeablePost({
  postId,
  swipeEnabled,
  children,
}: {
  postId: number;
  swipeEnabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (!swipeEnabled) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!swipeEnabled || !dragging) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll wins
    if (dx < 0) setOffset(Math.max(dx, -120));
    else if (open) setOffset(0);
  }

  function onTouchEnd() {
    if (!swipeEnabled) return;
    setDragging(false);
    if (offset < -60) {
      setOpen(true);
      setOffset(-104);
    } else {
      setOpen(false);
      setOffset(0);
    }
  }

  async function publish() {
    setOpen(false);
    setOffset(0);
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: true }),
    });
    router.refresh();
    setToast(true);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setToast(false), 5000);
  }

  async function undo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setToast(false);
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unpublish: true, to: "DRAFT" }),
    });
    router.refresh();
  }

  return (
    <div style={{ position: "relative" }}>
      {swipeEnabled && (offset < 0 || open) && (
        <button
          onClick={publish}
          style={{
            position: "absolute",
            right: 0,
            top: 8,
            bottom: 24,
            width: 96,
            borderRadius: 8,
            background: "#3fb950",
            color: "#0b1220",
            zIndex: 0,
          }}
        >
          公開済み
          <br />
          にする
        </button>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${open && !dragging ? -104 : offset}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          position: "relative",
          zIndex: 1,
        }}
      >
        {children}
      </div>
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
          <span>公開済みにしました</span>
          <button className="secondary" onClick={undo}>
            元に戻す
          </button>
        </div>
      )}
    </div>
  );
}
