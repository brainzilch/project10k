import { DB_PATH, getDb, getSetting } from "@/lib/db";
import { DEFAULT_MODEL } from "@/lib/anthropic";
import { INBOX_DIR } from "@/lib/inbox";
import { BackupButton, ModelForm } from "./SettingsForm";
import CaptureTools from "./CaptureTools";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const apiKeySet = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = getSetting(
    "claude_model",
    process.env.CLIMB_CLAUDE_MODEL || DEFAULT_MODEL,
  );
  const driveFolder = getSetting("drive_folder_id", "");
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
      <h1>Settings</h1>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Anthropic API</h2>
        <p>
          API Key:{" "}
          {apiKeySet ? (
            <span className="badge ok">set (.env)</span>
          ) : (
            <span className="badge err">not set - .env.local に ANTHROPIC_API_KEY を設定</span>
          )}
        </p>
        <p className="muted">Claude model（診断・チャット共通）:</p>
        <ModelForm current={model} />
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Google Drive</h2>
        <p>
          Status: <span className="badge warn">Not connected（v0.1 Day 2で実装予定）</span>
        </p>
        <p className="muted">
          PROJECT_10K folder: {driveFolder || "未作成"}
        </p>
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
                <th>Source</th>
                <th>File</th>
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
        <h2 style={{ marginTop: 0 }}>Database</h2>
        <p className="muted">Location: {DB_PATH}</p>
        <BackupButton />
      </div>
    </div>
  );
}
