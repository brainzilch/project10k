"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PublishFollowupSheet from "@/components/PublishFollowupSheet";

// Mark a FINAL post as published (X posting itself is done by the user).
// Follows up with the 24h-reminder / X-URL bottom sheet.
export default function PublishButton({ postId }: { postId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);

  async function publish() {
    setBusy(true);
    await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: true }),
    });
    setBusy(false);
    router.refresh();
    setSheet(true);
  }

  return (
    <>
      <button className="secondary" onClick={publish} disabled={busy}>
        {busy ? "..." : "投稿済みにする"}
      </button>
      {sheet && (
        <PublishFollowupSheet postId={postId} onClose={() => setSheet(false)} />
      )}
    </>
  );
}
