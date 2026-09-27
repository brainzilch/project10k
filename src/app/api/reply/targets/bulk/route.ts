import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";

// Bulk add from pasted lines: "@handle", "handle", or a profile URL. Existing
// handles are skipped (and re-activated if they had been removed).
function parseHandle(line: string): string | null {
  let s = line.trim();
  if (!s) return null;
  const url = s.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i);
  if (url) s = url[1];
  s = s.replace(/^@/, "").replace(/[\/?#].*$/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const lines = String(body.text ?? "").split(/[\r\n,、\s]+/);
  const db = getDb();
  let added = 0;
  let duplicates = 0;
  let invalid = 0;
  inTransaction(() => {
    const seen = new Set<string>();
    for (const line of lines) {
      const h = parseHandle(line);
      if (!h) {
        if (line.trim()) invalid++;
        continue;
      }
      const key = h.toLowerCase();
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      const existing = db
        .prepare("SELECT id, active FROM reply_targets WHERE lower(handle) = ?")
        .get(key) as { id: number; active: number } | undefined;
      if (existing) {
        duplicates++;
        if (!existing.active) {
          db.prepare("UPDATE reply_targets SET active = 1 WHERE id = ?").run(existing.id);
        }
        continue;
      }
      db.prepare("INSERT INTO reply_targets (handle) VALUES (?)").run(h);
      added++;
    }
  });
  return NextResponse.json({ ok: true, added, duplicates, invalid });
}
