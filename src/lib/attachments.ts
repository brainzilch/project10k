import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, UPLOADS_DIR } from "./db";
import { queueDriveUpload } from "./drive";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export const SUPPORTED_IMAGE_MIMES = Object.keys(EXT_BY_MIME);

export type AssetSource =
  | "AI_CHAT"
  | "X_SCREENSHOT"
  | "ANALYTICS"
  | "CLIMB"
  | "OTHER";

export type SavedAsset = {
  id: number;
  stored_filename: string;
  local_path: string;
  upload_status: string;
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function timestampParts(now = new Date()) {
  return {
    datePart: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    timePart: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    dirParts: [String(now.getFullYear()), pad(now.getMonth() + 1), pad(now.getDate())],
  };
}

// Save one file as an asset: local original under data/uploads/YYYY/MM/DD + DB row.
// The local copy is the source of truth; a Drive upload happens later in the
// background and must never block or lose it.
export function saveAssetFile(opts: {
  buffer: Buffer;
  source: AssetSource;
  originalFilename: string;
  mimeType: string;
  storedFilename: string;
}): SavedAsset {
  const ts = timestampParts();
  const dir = path.join(UPLOADS_DIR, ...ts.dirParts);
  fs.mkdirSync(dir, { recursive: true });

  let localPath = path.join(dir, opts.storedFilename);
  if (fs.existsSync(localPath)) {
    const ext = path.extname(opts.storedFilename);
    const base = path.basename(opts.storedFilename, ext);
    let i = 2;
    while (fs.existsSync(localPath)) {
      localPath = path.join(dir, `${base}_${i}${ext}`);
      i++;
    }
  }
  fs.writeFileSync(localPath, opts.buffer);

  const sha256 = crypto.createHash("sha256").update(opts.buffer).digest("hex");
  const storedFilename = path.basename(localPath);

  const { lastInsertRowid } = getDb()
    .prepare(
      `INSERT INTO assets
         (source, original_filename, stored_filename, mime_type, file_size, sha256, local_path, upload_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'LOCAL_SAVED')`,
    )
    .run(
      opts.source,
      opts.originalFilename,
      storedFilename,
      opts.mimeType,
      opts.buffer.length,
      sha256,
      localPath,
    );

  const assetId = Number(lastInsertRowid);
  // background Drive copy (no-op until Drive is connected); never blocks
  queueDriveUpload(assetId);
  return {
    id: assetId,
    stored_filename: storedFilename,
    local_path: localPath,
    upload_status: "LOCAL_SAVED",
  };
}

// Chat image: YYYY-MM-DD_HHmmss_chat_<conversation id>_img_<sequence>.<ext>
export function saveChatImage(
  conversationId: number,
  messageId: number,
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  sequence: number,
): SavedAsset {
  const ext = EXT_BY_MIME[mimeType];
  if (!ext) throw new Error(`unsupported image type: ${mimeType}`);

  const ts = timestampParts();
  const storedFilename = `${ts.datePart}_${ts.timePart}_chat_${pad(conversationId, 6)}_img_${pad(sequence)}.${ext}`;

  const saved = saveAssetFile({
    buffer,
    source: "AI_CHAT",
    originalFilename,
    mimeType,
    storedFilename,
  });

  getDb()
    .prepare(
      "INSERT INTO message_attachments (message_id, asset_id) VALUES (?, ?)",
    )
    .run(messageId, saved.id);

  return saved;
}

export type AssetRow = {
  id: number;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  local_path: string;
  upload_status: string;
};

export function getAsset(id: number): AssetRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, original_filename, stored_filename, mime_type, local_path, upload_status
       FROM assets WHERE id = ?`,
    )
    .get(id) as AssetRow | undefined;
}

export function getAttachmentsForMessages(
  messageIds: number[],
): Map<number, AssetRow[]> {
  const result = new Map<number, AssetRow[]>();
  if (messageIds.length === 0) return result;
  const placeholders = messageIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT ma.message_id, a.id, a.original_filename, a.stored_filename,
              a.mime_type, a.local_path, a.upload_status
       FROM message_attachments ma JOIN assets a ON a.id = ma.asset_id
       WHERE ma.message_id IN (${placeholders})
       ORDER BY ma.id ASC`,
    )
    .all(...messageIds) as (AssetRow & { message_id: number })[];
  for (const row of rows) {
    const list = result.get(row.message_id) ?? [];
    list.push(row);
    result.set(row.message_id, list);
  }
  return result;
}
