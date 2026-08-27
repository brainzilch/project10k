import { DB_PATH, getSetting } from "@/lib/db";
import { DEFAULT_MODEL } from "@/lib/anthropic";
import { BackupButton, ModelForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const apiKeySet = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = getSetting(
    "claude_model",
    process.env.CLIMB_CLAUDE_MODEL || DEFAULT_MODEL,
  );
  const driveFolder = getSetting("drive_folder_id", "");

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
        <h2 style={{ marginTop: 0 }}>Database</h2>
        <p className="muted">Location: {DB_PATH}</p>
        <BackupButton />
      </div>
    </div>
  );
}
