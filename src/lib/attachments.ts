import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, UPLOADS_DIR } from "./db";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const SUPPORTED_IMAGE_MIMES = Object.keys(EXT_BY_MIME);

export type SavedAsset = {
  id: number;
  stored_filename: string;
  upload_status: string;
};

// Save one chat image: local file is the original, DB row is created immediately.
// Drive upload happens later in the background and must never block chat.
// Filename: YYYY-MM-DD_HHmmss_chat_<conversation id>_img_<sequence>.<ext>
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

  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const storedFilename = `${datePart}_${timePart}_chat_${pad(conversationId, 6)}_img_${pad(sequence)}.${ext}`;

  const dir = path.join(
    UPLOADS_DIR,
    String(now.getFullYear()),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  );
  fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, storedFilename);
  fs.writeFileSync(localPath, buffer);

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  const db = getDb();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO assets
         (source, original_filename, stored_filename, mime_type, file_size, sha256, local_path, upload_status)
       VALUES ('AI_CHAT', ?, ?, ?, ?, ?, ?, 'LOCAL_SAVED')`,
    )
    .run(originalFilename, storedFilename, mimeType, buffer.length, sha256, localPath);
  const assetId = Number(lastInsertRowid);

  db.prepare(
    "INSERT INTO message_attachments (message_id, asset_id) VALUES (?, ?)",
  ).run(messageId, assetId);

  return { id: assetId, stored_filename: storedFilename, upload_status: "LOCAL_SAVED" };
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
