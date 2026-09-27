"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PublishFollowupSheet from "@/components/PublishFollowupSheet";
import PostWarnings from "@/components/PostWarnings";
import { checkPostText } from "@/lib/postCheck";

// Mark a FINAL post as published (X posting itself is done by the user).
// Static checks warn first but never block; follows up with the 24h-reminder
// / X-URL bottom sheet.
export default function PublishButton({ postId, text }: { postId: number; text: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function publish() {
    setConfirming(false);
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
      <button
        className="secondary"
        onClick={() => {
          if (checkPostText(text).length > 0) setConfirming(true);
          else void publish();
        }}
        disabled={busy}
      >
        {busy ? "..." : "投稿済みにする"}
      </button>
      {confirming && (
        <div style={{ width: "100%", marginTop: 8 }}>
          <PostWarnings text={text} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={publish} disabled={busy}>
              このまま公開
            </button>
            <button className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              やめる
            </button>
          </div>
        </div>
      )}
      {sheet && (
        <PublishFollowupSheet postId={postId} onClose={() => setSheet(false)} />
      )}
    </>
  );
}
