"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function DriveToolsInner({
  configured,
  connected,
  rootFolderId,
  pendingCount,
  failedCount,
}: {
  configured: boolean;
  connected: boolean;
  rootFolderId: string;
  pendingCount: number;
  failedCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(
    params.get("drive") === "connected"
      ? "Google Driveに接続しました - PROJECT_10Kフォルダを作成済み"
      : params.get("drive_error")
        ? `接続エラー: ${params.get("drive_error")}`
        : "",
  );

  async function call(path: string, label: string, okMessage: (d: Record<string, unknown>) => string) {
    setBusy(label);
    setResult("");
    const res = await fetch(path, { method: "POST" });
    const data = await res.json();
    setBusy("");
    setResult(res.ok ? okMessage(data) : String(data.error ?? `${label}に失敗しました`));
    router.refresh();
  }

  if (!configured) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です。README の「Google
        API設定」の手順でOAuthクライアントを作成し、環境変数に設定してください。
      </p>
    );
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        状態:{" "}
        {connected ? (
          <span className="badge ok">接続済み</span>
        ) : (
          <span className="badge warn">未接続</span>
        )}
        {connected && (pendingCount > 0 || failedCount > 0) && (
          <span className="badge warn" style={{ marginLeft: 8 }}>
            未同期 {pendingCount + failedCount}件
          </span>
        )}
      </p>
      {connected && rootFolderId && (
        <p className="muted">
          PROJECT_10K folder:{" "}
          <a
            href={`https://drive.google.com/drive/folders/${rootFolderId}`}
            target="_blank"
          >
            Driveで開く
          </a>
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!connected && (
          <button onClick={() => (window.location.href = "/api/drive/oauth/start")}>
            Google Driveに接続
          </button>
        )}
        {connected && (
          <>
            <button
              className="secondary"
              disabled={busy !== ""}
              onClick={() =>
                call("/api/drive/test", "test", (d) => `Test Upload成功: ${d.name}`)
              }
            >
              {busy === "test" ? "送信中..." : "テストアップロード"}
            </button>
            <button
              className="secondary"
              disabled={busy !== ""}
              onClick={() =>
                call("/api/drive/retry", "retry", (d) =>
                  Number(d.queued) > 0
                    ? `${d.queued}件の再送を開始しました`
                    : "未同期のファイルはありません",
                )
              }
            >
              {busy === "retry" ? "..." : "未同期を再送"}
            </button>
            <button
              className="secondary"
              disabled={busy !== ""}
              onClick={() =>
                call("/api/backup/drive", "backup", (d) => `DBバックアップをDriveへ保存: ${d.name}`)
              }
            >
              {busy === "backup" ? "..." : "DBバックアップをDriveへ"}
            </button>
            <button
              className="secondary"
              disabled={busy !== ""}
              onClick={() => {
                if (confirm("Google Drive接続を解除しますか？（Drive上のファイルは残ります）")) {
                  call("/api/drive/disconnect", "disconnect", () => "接続を解除しました");
                }
              }}
            >
              接続解除
            </button>
          </>
        )}
      </div>
      {result && <p className="muted">{result}</p>}
    </div>
  );
}

export default function DriveTools(props: {
  configured: boolean;
  connected: boolean;
  rootFolderId: string;
  pendingCount: number;
  failedCount: number;
}) {
  return (
    <Suspense fallback={null}>
      <DriveToolsInner {...props} />
    </Suspense>
  );
}
