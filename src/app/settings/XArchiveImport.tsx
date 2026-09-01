"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Upload for the official X archive tweet files. Idempotent - re-uploading
// the same file adds nothing twice.
export default function XArchiveImport({
  stored,
  oldest,
  newest,
}: {
  stored: number;
  oldest: string | null;
  newest: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg("取り込み中…");
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    try {
      const res = await fetch("/api/xarchive/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取り込みに失敗しました");
      setMsg(
        `新規${data.added}件を取り込みました（累計${data.stored}件 / ${data.oldest}〜${data.newest}）`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        {stored > 0
          ? `取り込み済み: ${stored}件（${oldest} 〜 ${newest}）。文体の学習と分析に使われます。`
          : "過去の全投稿を取り込むと、AIが作る文章があなたの文体に近づきます。"}
      </p>
      <button
        className="secondary"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        {busy ? "取り込み中…" : "tweets.js をアップロード"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".js,.json,application/json,text/javascript"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
        入手方法: Xアプリ「設定とプライバシー → アカウント →
        データのアーカイブをダウンロード」→ 届いたzipを展開 → 中の{" "}
        <code>data/tweets.js</code>（複数ある場合は全部）をここへ。
        再アップロードしても重複しない。
      </p>
      {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}
    </div>
  );
}
