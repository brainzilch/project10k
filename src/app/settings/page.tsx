import { DB_PATH, getDb, getSetting } from "@/lib/db";
import { DEFAULT_MODEL } from "@/lib/anthropic";
import { INBOX_DIR } from "@/lib/inbox";
import { driveConfigured, driveConnected } from "@/lib/drive";
import { BackupButton, ModelForm } from "./SettingsForm";
import CaptureTools from "./CaptureTools";
import DriveTools from "./DriveTools";
import ReminderSettings from "./ReminderSettings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const apiKeySet = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = getSetting(
    "claude_model",
    process.env.CLIMB_CLAUDE_MODEL || DEFAULT_MODEL,
  );
  const driveFolder = getSetting("drive_folder_id", "");
  const statusCounts = getDb()
    .prepare(
      `SELECT upload_status, COUNT(*) AS n FROM assets
       WHERE upload_status IN ('DRIVE_PENDING', 'DRIVE_FAILED') GROUP BY upload_status`,
    )
    .all() as { upload_status: string; n: number }[];
  const pendingCount =
    statusCounts.find((s) => s.upload_status === "DRIVE_PENDING")?.n ?? 0;
  const failedCount =
    statusCounts.find((s) => s.upload_status === "DRIVE_FAILED")?.n ?? 0;
  const recentAssets = getDb()
    .prepare(
      `SELECT id, source, stored_filename, upload_status FROM assets
       WHERE source != 'AI_CHAT' ORDER BY id DESC LIMIT 10`,
    )
    .all() as {
    id: number;
    source: string;
    stored_filename: string;
    upload_status: string;
  }[];

  return (
    <div>
      <h1>設定</h1>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Anthropic API</h2>
        <p>
          APIキー:{" "}
          {apiKeySet ? (
            <span className="badge ok">設定済み</span>
          ) : (
            <span className="badge err">未設定 - 環境変数 ANTHROPIC_API_KEY を設定</span>
          )}
        </p>
        <p className="muted">Claudeモデル（診断・チャット共通）:</p>
        <ModelForm current={model} />
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Google Drive</h2>
        <DriveTools
          configured={driveConfigured()}
          connected={driveConnected()}
          rootFolderId={driveFolder}
          pendingCount={pendingCount}
          failedCount={failedCount}
        />
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>毎日のリマインド</h2>
        <ReminderSettings />
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>スクショ収集</h2>
        <CaptureTools />
        <p className="muted" style={{ marginBottom: 4 }}>
          取り込みフォルダ: {INBOX_DIR}
        </p>
        <p className="muted" style={{ marginTop: 0 }}>
          Claude Code・他ツールのスクショはこのフォルダへ入れると自動でAsset登録される（Dashboardを開いた時にも自動取り込み）。
          サブフォルダ x / analytics / climb に入れるとsourceが分類される。
          ホットキー撮影は scripts/capture-screen.bat を使用（scripts/README.md 参照）。
        </p>
        {recentAssets.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>分類</th>
                <th>ファイル</th>
                <th>Drive</th>
              </tr>
            </thead>
            <tbody>
              {recentAssets.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.source}</td>
                  <td>
                    <a href={`/api/assets/${a.id}/file`} target="_blank">
                      {a.stored_filename}
                    </a>
                  </td>
                  <td>{a.upload_status === "LOCAL_SAVED" ? "Local ✓" : a.upload_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>データベース</h2>
        <p className="muted">保存場所: {DB_PATH}</p>
        <BackupButton />
      </div>
    </div>
  );
}
