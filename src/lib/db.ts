// Uses Node's built-in node:sqlite (Node 22.5+) - no native compilation needed,
// so installation works on Windows without Visual Studio build tools.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR =
  process.env.CLIMB_DATA_DIR || path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "climb.db");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");

const PROJECT_SEED: Record<string, string> = {
  project_name: "PROJECT 10K",
  start_date: "2026-08-27",
  start_followers: "1458",
  goal_followers: "10000",
  duration_days: "365",
};

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "schema.sql"),
    "utf-8",
  );
  db.exec(schema);
  seed(db);
  return db;
}

// Run fn inside a transaction; rolls back on any error.
export function inTransaction<T>(fn: () => T): T {
  const d = getDb();
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

function seed(db: DatabaseSync) {
  const insertMeta = db.prepare(
    "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)",
  );
  for (const [k, v] of Object.entries(PROJECT_SEED)) insertMeta.run(k, v);
  // Day 0 follower count
  db.prepare(
    "INSERT OR IGNORE INTO daily_followers (date, followers) VALUES (?, ?)",
  ).run(PROJECT_SEED.start_date, Number(PROJECT_SEED.start_followers));
}

export function getMeta(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM app_meta")
    .all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getSetting(key: string, fallback: string): string {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}
