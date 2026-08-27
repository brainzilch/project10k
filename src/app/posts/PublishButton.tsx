"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Mark a FINAL post as published (X posting itself is done by the user).
export default function PublishButton({ postId }: { postId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: true }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button className="secondary" onClick={publish} disabled={busy}>
      {busy ? "..." : "投稿済みにする"}
    </button>
  );
}
