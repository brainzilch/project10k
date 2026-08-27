import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";
import {
  AssetSource,
  MIME_BY_EXT,
  saveAssetFile,
  timestampParts,
} from "./attachments";

// Drop-folder for screenshots taken outside CLIMB (Claude Code, X analytics,
// any other tool). Files placed here are automatically registered as assets
// and moved into data/uploads. Subfolders map to asset sources.
export const INBOX_DIR = path.join(DATA_DIR, "inbox");

const SOURCE_BY_SUBDIR: Record<string, AssetSource> = {
  x: "X_SCREENSHOT",
  analytics: "ANALYTICS",
  climb: "CLIMB",
};

export function ensureInboxDirs() {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  for (const d of Object.keys(SOURCE_BY_SUBDIR)) {
    fs.mkdirSync(path.join(INBOX_DIR, d), { recursive: true });
  }
}

export function ingestInbox(): number {
  ensureInboxDirs();
  const dirs: [string, AssetSource][] = [
    [INBOX_DIR, "OTHER"],
    ...Object.entries(SOURCE_BY_SUBDIR).map(
      ([d, source]) => [path.join(INBOX_DIR, d), source] as [string, AssetSource],
    ),
  ];

  let count = 0;
  for (const [dir, source] of dirs) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;
      const ext = path.extname(name).slice(1).toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (!mime) continue;

      const buffer = fs.readFileSync(full);
      const ts = timestampParts();
      const safe = name.replace(/[^\w.\-]+/g, "_");
      saveAssetFile({
        buffer,
        source,
        originalFilename: name,
        mimeType: mime,
        storedFilename: `${ts.datePart}_${ts.timePart}_inbox_${safe}`,
      });
      fs.unlinkSync(full);
      count++;
    }
  }
  return count;
}
