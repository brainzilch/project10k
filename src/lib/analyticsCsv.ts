import { getDb, inTransaction } from "./db";

// X analytics content CSV (アカウントアナリティクス → コンテンツ → CSVを
// ダウンロード). Japanese headers, one row per post, exact numbers straight
// from X - more complete and reliable than screenshot OCR. Import is
// idempotent: posts match by X post id first, then by text; a metrics row is
// appended only when the numbers actually changed.

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

function normalizeText(s: string): string {
  return s.replace(/[\s…。、．\.]+/g, "");
}

function toInt(v: string | undefined): number {
  const n = Number(String(v ?? "").replace(/[,，]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Header name -> post_metrics column. 共有/詳細クリック etc. have no column
// and are intentionally dropped.
const HEADER_MAP: [string, string][] = [
  ["インプレッション数", "impressions"],
  ["いいね", "likes"],
  ["リポスト", "reposts"],
  ["返信", "replies"],
  ["ブックマーク", "bookmarks"],
  ["プロフィールへのアクセス数", "profile_visits"],
  ["新しいフォロー", "follows"],
];

export type CsvImportResult = {
  kind: "content" | "overview";
  rows: number;
  repliesSkipped: number;
  appended: number;
  unchanged: number;
  created: number;
};

// Overview CSV header -> x_daily_stats column.
const OVERVIEW_MAP: [string, string][] = [
  ["インプレッション数", "impressions"],
  ["いいね", "likes"],
  ["エンゲージメント", "engagements"],
  ["ブックマーク", "bookmarks"],
  ["共有された回数", "shares"],
  ["新しいフォロー", "new_follows"],
  ["フォロー解除", "unfollows"],
  ["返信", "replies"],
  ["リポスト", "reposts"],
  ["プロフィールへのアクセス数", "profile_visits"],
  ["ポストを作成", "posts_created"],
];

function importOverviewCsv(parsed: string[][]): CsvImportResult {
  const header = parsed[0];
  const col = (name: string) => header.findIndex((h) => h.trim() === name);
  const dateIdx = col("Date") >= 0 ? col("Date") : col("日付");
  const map = OVERVIEW_MAP.map(([h, field]) => [col(h), field] as const);
  const db = getDb();
  const result: CsvImportResult = {
    kind: "overview",
    rows: 0,
    repliesSkipped: 0,
    appended: 0,
    unchanged: 0,
    created: 0,
  };
  inTransaction(() => {
    for (const row of parsed.slice(1)) {
      const date = row[dateIdx] ? new Date(row[dateIdx]) : null;
      if (!date || Number.isNaN(date.getTime())) continue;
      result.rows++;
      const dateStr = date.toISOString().slice(0, 10);
      const values: Record<string, number> = {};
      for (const [idx, field] of map) values[field] = idx >= 0 ? toInt(row[idx]) : 0;
      const fields = map.map(([, f]) => f);
      const { changes } = db
        .prepare(
          `INSERT INTO x_daily_stats (date, ${fields.join(", ")})
           VALUES (?, ${fields.map(() => "?").join(", ")})
           ON CONFLICT(date) DO UPDATE SET
             ${fields.map((f) => `${f} = excluded.${f}`).join(", ")}
           WHERE ${fields.map((f) => `x_daily_stats.${f} != excluded.${f}`).join(" OR ")}`,
        )
        .run(dateStr, ...fields.map((f) => values[f]));
      if (changes > 0) result.appended++;
      else result.unchanged++;
    }
  });
  return result;
}

// Dispatch on the header row: the content CSV has ポストID, the account
// overview CSV starts with Date and has no post column.
export function importAnyAnalyticsCsv(text: string): CsvImportResult {
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("CSVに行がありません");
  const header = parsed[0].map((h) => h.trim());
  if (header.includes("ポストID")) return importAnalyticsCsv(text);
  if (header.includes("Date") || header.includes("フォロー解除")) {
    return importOverviewCsv(parsed);
  }
  throw new Error(
    "ヘッダーが想定と違います。Xアナリティクスの「コンテンツ」または「アカウント概要」のCSVをアップロードしてください",
  );
}

function importAnalyticsCsv(text: string): CsvImportResult {
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("CSVに行がありません");
  const header = parsed[0];
  const col = (name: string) => header.findIndex((h) => h.trim() === name);
  const idIdx = col("ポストID");
  const dateIdx = col("日付");
  const textIdx = col("ポスト本文");
  if (idIdx < 0 || textIdx < 0) {
    throw new Error(
      "ヘッダーが想定と違います。Xアナリティクスの「コンテンツ」CSVをそのままアップロードしてください",
    );
  }
  const metricIdx = HEADER_MAP.map(([h, field]) => [col(h), field] as const);

  const db = getDb();
  const result: CsvImportResult = {
    kind: "content",
    rows: 0,
    repliesSkipped: 0,
    appended: 0,
    unchanged: 0,
    created: 0,
  };

  inTransaction(() => {
    for (const row of parsed.slice(1)) {
      const xId = row[idIdx]?.trim();
      const postText = (row[textIdx] ?? "").trim();
      if (!xId || !postText) continue;
      result.rows++;
      if (postText.startsWith("@")) {
        result.repliesSkipped++;
        continue;
      }

      const metrics: Record<string, number> = {};
      for (const [idx, field] of metricIdx) {
        metrics[field] = idx >= 0 ? toInt(row[idx]) : 0;
      }

      // match by X post id, then by text; otherwise register as 直接投稿
      let post = db
        .prepare("SELECT id FROM posts WHERE x_post_id = ?")
        .get(xId) as { id: number } | undefined;
      if (!post) {
        const key = normalizeText(postText).slice(0, 20);
        const candidates = db
          .prepare(
            "SELECT id, raw_text, final_text, x_post_id FROM posts WHERE status != 'DISCARDED' ORDER BY id DESC",
          )
          .all() as {
          id: number;
          raw_text: string;
          final_text: string | null;
          x_post_id: string | null;
        }[];
        const m =
          key.length >= 6
            ? candidates.find(
                (p) =>
                  !p.x_post_id &&
                  (normalizeText(p.raw_text).includes(key) ||
                    (p.final_text && normalizeText(p.final_text).includes(key))),
              )
            : undefined;
        if (m) {
          db.prepare("UPDATE posts SET x_post_id = ? WHERE id = ?").run(xId, m.id);
          post = { id: m.id };
        }
      }
      if (!post) {
        const date = row[dateIdx] ? new Date(row[dateIdx]) : null;
        const dateStr =
          date && !Number.isNaN(date.getTime())
            ? date.toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO posts (origin, post_type, raw_text, status, published_at, x_post_id)
             VALUES ('X_DIRECT', 'CASUAL', ?, 'PUBLISHED', ?, ?)`,
          )
          .run(postText, dateStr, xId);
        post = { id: Number(lastInsertRowid) };
        result.created++;
      }

      // append only when the numbers moved since the last recorded row
      const latest = db
        .prepare(
          `SELECT impressions, likes, reposts, replies, bookmarks, profile_visits, follows
           FROM post_metrics WHERE post_id = ? ORDER BY measured_at DESC, id DESC LIMIT 1`,
        )
        .get(post.id) as Record<string, number | null> | undefined;
      const unchanged =
        latest &&
        Object.entries(metrics).every(([k, v]) => (latest[k] ?? 0) === v);
      if (unchanged) {
        result.unchanged++;
        continue;
      }
      db.prepare(
        `INSERT INTO post_metrics
           (post_id, impressions, likes, reposts, replies, bookmarks, profile_visits, follows)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        post.id,
        metrics.impressions,
        metrics.likes,
        metrics.reposts,
        metrics.replies,
        metrics.bookmarks,
        metrics.profile_visits,
        metrics.follows,
      );
      result.appended++;
    }
  });

  return result;
}
