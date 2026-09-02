import { DB_PATH, getDb, getSetting } from "@/lib/db";
import { DEFAULT_MODEL, monthlyUsage } from "@/lib/anthropic";
import { INBOX_DIR } from "@/lib/inbox";
import { driveConfigured, driveConnected } from "@/lib/drive";
import { BackupButton, ModelForm } from "./SettingsForm";
import CaptureTools from "./CaptureTools";
import DriveTools from "./DriveTools";
import ReminderSettings from "./ReminderSettings";
import XArchiveImport from "./XArchiveImport";
import PushSettings from "./PushSettings";
import { subscriptionCount } from "@/lib/push";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const apiKeySet = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = getSetting(
    "claude_model",
    process.env.CLIMB_CLAUDE_MODEL || DEFAULT_MODEL,
  );
  const driveFolder = getSetting("drive_folder_id", "");
  const usage = monthlyUsage();
  const archiveStats = getDb()
    .prepare(
      `SELECT COUNT(*) AS n, MIN(created_at) AS oldest, MAX(created_at) AS newest
       FROM x_archive_posts`,
    )
    .get() as { n: number; oldest: string | null; newest: string | null };
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
        <h2 style={{ marginTop: 0 }}>プロフィール</h2>
        <p className="muted" style={{ margin: 0 }}>
          <a href="/profile">名前とbioの診断・変更履歴 →</a>
          　変更日はフォロワーグラフに点線で表示される
        </p>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>過去投稿の取り込み（Xアーカイブ）</h2>
        <XArchiveImport
          stored={archiveStats.n}
          oldest={archiveStats.oldest?.slice(0, 10) ?? null}
          newest={archiveStats.newest?.slice(0, 10) ?? null}
        />
      </div>

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
        <p style={{ margin: "12px 0 4px" }}>
          今月のAI費用（{usage.month}・実測）:{" "}
          <strong>${usage.totalUsd.toFixed(2)}</strong>
          <span className="muted">
            {" "}≈ ¥{Math.round(usage.totalUsd * 150).toLocaleString()}（$1=¥150換算）・{usage.calls}回・
            キャッシュ命中 {Math.round(usage.cacheHitRate * 100)}%
          </span>
        </p>
        {usage.byPurpose.length > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {usage.byPurpose
              .map((p) => `${p.purpose} $${p.usd.toFixed(2)}(${p.calls}回)`)
              .join("　")}
          </p>
        )}
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
        <h2 style={{ marginTop: 0 }}>プッシュ通知（推奨）</h2>
        <PushSettings
          devices={subscriptionCount()}
          reminderTime={getSetting("push_reminder_time", "22:00")}
        />
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>アプリ内リマインド（プッシュ非対応時の予備）</h2>
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
