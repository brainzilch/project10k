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
  migrate(db);
  seed(db);
  return db;
}

// Column additions for DBs created before the column existed in schema.sql
// (CREATE TABLE IF NOT EXISTS does not alter existing tables).
function migrate(db: DatabaseSync) {
  const postColumns = db.prepare("PRAGMA table_info(posts)").all() as {
    name: string;
  }[];
  if (!postColumns.some((c) => c.name === "origin")) {
    db.exec("ALTER TABLE posts ADD COLUMN origin TEXT NOT NULL DEFAULT 'CLIMB'");
  }

  // The status CHECK is baked into the existing table; adding DISCARDED needs
  // a table rebuild (SQLite 12-step). Explicit column lists on both sides -
  // older DBs have `origin` appended last by the ALTER above, fresh DBs have
  // it third.
  const postsSql = (
    db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'posts'",
      )
      .get() as { sql: string } | undefined
  )?.sql;
  if (postsSql && !postsSql.includes("DISCARDED")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(`CREATE TABLE posts_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER REFERENCES sources(id),
        origin TEXT NOT NULL DEFAULT 'CLIMB',
        post_type TEXT NOT NULL DEFAULT 'PRIMARY' CHECK (post_type IN ('PRIMARY', 'CASUAL')),
        raw_text TEXT NOT NULL,
        ai_feedback TEXT,
        ai_minimal_edit TEXT,
        final_text TEXT,
        minimal_edit_used INTEGER NOT NULL DEFAULT 0,
        prompt_version TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT'
          CHECK (status IN ('DRAFT', 'FINAL', 'PUBLISHED', 'DISCARDED')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        published_at TEXT
      )`);
      db.exec(`INSERT INTO posts_migrated
        (id, source_id, origin, post_type, raw_text, ai_feedback, ai_minimal_edit,
         final_text, minimal_edit_used, prompt_version, status, created_at, published_at)
        SELECT id, source_id, origin, post_type, raw_text, ai_feedback, ai_minimal_edit,
         final_text, minimal_edit_used, prompt_version, status, created_at, published_at
        FROM posts`);
      db.exec("DROP TABLE posts");
      db.exec("ALTER TABLE posts_migrated RENAME TO posts");
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      console.error(
        `[climb] posts migration failed: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }

  // theme came after the DISCARDED rebuild - re-read columns in case the
  // rebuild above just replaced the table.
  const postColumnsAfter = db.prepare("PRAGMA table_info(posts)").all() as {
    name: string;
  }[];
  if (!postColumnsAfter.some((c) => c.name === "theme")) {
    db.exec("ALTER TABLE posts ADD COLUMN theme TEXT");
  }
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
