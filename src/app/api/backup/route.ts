import path from "node:path";
import { NextResponse } from "next/server";
import { getDb, EXPORTS_DIR } from "@/lib/db";

// Manual "Backup Now": consistent snapshot of the SQLite DB into data/exports/.
// VACUUM INTO produces a compact, consistent copy even while the DB is in use.
export async function POST() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const dest = path.join(EXPORTS_DIR, `climb-${stamp}.db`);
  getDb().exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  return NextResponse.json({ ok: true, path: dest });
}
