import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getDb, getSetting, setSetting } from "./db";

// Google Drive integration via raw REST (no googleapis SDK - keeps deps zero).
// OAuth 2.0 with the user's own Google account, scope drive.file (only files
// this app creates). Refresh token lives in DATA_DIR (gitignored / on the
// cloud volume), never in the DB and never in git.

const TOKEN_PATH = path.join(DATA_DIR, "drive-token.json");
const FOLDER_MIME = "application/vnd.google-apps.folder";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function driveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function driveConnected(): boolean {
  return driveConfigured() && fs.existsSync(TOKEN_PATH);
}

type TokenData = {
  refresh_token: string;
  access_token: string;
  expires_at: number;
};

function readTokens(): TokenData | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function saveTokens(t: {
  refresh_token?: string;
  access_token: string;
  expires_in: number;
}) {
  const existing = readTokens();
  const data: TokenData = {
    refresh_token: t.refresh_token ?? existing?.refresh_token ?? "",
    access_token: t.access_token,
    expires_at: Date.now() + t.expires_in * 1000,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(data), { mode: 0o600 });
}

export function disconnectDrive() {
  fs.rmSync(TOKEN_PATH, { force: true });
}

async function getAccessToken(): Promise<string> {
  const t = readTokens();
  if (!t?.refresh_token) throw new Error("Google Drive is not connected");
  if (t.access_token && Date.now() < t.expires_at - 60_000) return t.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: t.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Drive token refresh failed (${res.status})`);
  const data = await res.json();
  saveTokens({ access_token: data.access_token, expires_in: data.expires_in });
  return data.access_token;
}

async function findOrCreateFolder(
  name: string,
  parentId: string | null,
  token: string,
): Promise<string> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`Drive folder lookup failed (${listRes.status})`);
  const list = await listRes.json();
  if (list.files?.[0]?.id) return list.files[0].id;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!createRes.ok) throw new Error(`Drive folder create failed (${createRes.status})`);
  return (await createRes.json()).id;
}

// PROJECT_10K folder tree (spec section 4). v0.1 requires AI_CHAT/images to
// work; the rest is created up front so the structure is ready.
const FOLDER_TREE = [
  "00_DAY0",
  "AI_CHAT/images",
  "AI_CHAT/files",
  "X/screenshots",
  "X/analytics",
  "X/posts",
  "CLIMB/screenshots",
  "CLIMB/development",
  "CLIMB/exports",
  "NOTE/materials",
  "NOTE/images",
  "MONTHLY",
  "ARCHIVE",
];

export async function ensureFolderStructure(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const rootId = await findOrCreateFolder("PROJECT_10K", null, token);
  const map: Record<string, string> = { PROJECT_10K: rootId };
  const cache: Record<string, string> = {};
  for (const treePath of FOLDER_TREE) {
    let parent = rootId;
    let key = "";
    for (const part of treePath.split("/")) {
      key = key ? `${key}/${part}` : part;
      if (!cache[key]) cache[key] = await findOrCreateFolder(part, parent, token);
      parent = cache[key];
      map[key] = cache[key];
    }
  }
  setSetting("drive_folders", JSON.stringify(map));
  setSetting("drive_folder_id", rootId);
  return map;
}

export function getDriveFolders(): Record<string, string> {
  try {
    return JSON.parse(getSetting("drive_folders", "{}"));
  } catch {
    return {};
  }
}

const FOLDER_BY_SOURCE: Record<string, string> = {
  AI_CHAT: "AI_CHAT/images",
  X_SCREENSHOT: "X/screenshots",
  ANALYTICS: "X/analytics",
  CLIMB: "CLIMB/screenshots",
  OTHER: "ARCHIVE",
};

export async function uploadBufferToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folderId: string,
): Promise<{ id: string; webViewLink?: string }> {
  const token = await getAccessToken();
  const boundary = "climb_boundary_7f3a91";
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    },
  );
  if (!res.ok) throw new Error(`Drive upload failed (${res.status})`);
  return res.json();
}

export async function uploadAssetToDrive(assetId: number): Promise<boolean> {
  const db = getDb();
  const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as
    | {
        id: number;
        source: string;
        stored_filename: string;
        mime_type: string;
        local_path: string;
      }
    | undefined;
  if (!asset) return false;
  try {
    const folderId = getDriveFolders()[FOLDER_BY_SOURCE[asset.source] ?? "ARCHIVE"];
    if (!folderId) throw new Error("Drive folders not initialized");
    const buffer = fs.readFileSync(asset.local_path);
    const result = await uploadBufferToDrive(
      buffer,
      asset.stored_filename,
      asset.mime_type,
      folderId,
    );
    db.prepare(
      `UPDATE assets SET drive_file_id = ?, drive_url = ?, drive_folder_id = ?,
       upload_status = 'DRIVE_UPLOADED', uploaded_at = datetime('now') WHERE id = ?`,
    ).run(result.id, result.webViewLink ?? "", folderId, assetId);
    return true;
  } catch (e) {
    db.prepare("UPDATE assets SET upload_status = 'DRIVE_FAILED' WHERE id = ?").run(
      assetId,
    );
    // message only - never log tokens or request bodies
    console.error(
      `Drive upload failed for asset ${assetId}: ${e instanceof Error ? e.message : "unknown"}`,
    );
    return false;
  }
}

// Fire-and-forget: mark pending and upload in the background. Never blocks the
// caller (the Claude chat flow must not wait on Drive).
export function queueDriveUpload(assetId: number) {
  if (!driveConnected()) return;
  try {
    getDb()
      .prepare(
        "UPDATE assets SET upload_status = 'DRIVE_PENDING' WHERE id = ? AND upload_status = 'LOCAL_SAVED'",
      )
      .run(assetId);
  } catch {
    return;
  }
  setImmediate(() => {
    void uploadAssetToDrive(assetId);
  });
}

let retryRunning = false;

// Re-send DRIVE_PENDING / DRIVE_FAILED assets (spec section 6). Called on
// Dashboard load and from the Settings button. Returns how many were queued.
export function retryPendingUploads(): number {
  if (!driveConnected() || retryRunning) return 0;
  const rows = getDb()
    .prepare(
      "SELECT id FROM assets WHERE upload_status IN ('DRIVE_PENDING', 'DRIVE_FAILED') ORDER BY id ASC LIMIT 50",
    )
    .all() as { id: number }[];
  if (rows.length === 0) return 0;
  retryRunning = true;
  setImmediate(async () => {
    try {
      for (const row of rows) await uploadAssetToDrive(row.id);
    } finally {
      retryRunning = false;
    }
  });
  return rows.length;
}
