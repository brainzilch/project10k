import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";
import { getClient, getModel, textOf } from "@/lib/anthropic";
import { saveAssetFile, SUPPORTED_IMAGE_MIMES, timestampParts } from "@/lib/attachments";

const EXTRACT_SYSTEM = `あなたはX(Twitter)のアナリティクス（ポストアクティビティ）スクリーンショットの読み取り係。
画像から以下をJSONだけで出力する。説明文・コードフェンスは禁止。読み取れない項目はnull。

{
  "post_text": "投稿本文（画像に見えている範囲すべて。末尾が…で切れていればそのまま）",
  "post_date": "投稿日をMM-DD形式で（例: 8月27日→08-27）。不明ならnull",
  "impressions": 数値,
  "likes": 数値,
  "reposts": 数値,
  "replies": 数値,
  "bookmarks": 数値,
  "profile_visits": 数値,
  "follows": 数値
}`;

// 空白・省略記号を除いた先頭部分で本文を照合する
function normalizeText(s: string): string {
  return s.replace(/[\s…。、．\.]+/g, "");
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,，]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSONを抽出できませんでした");
  return JSON.parse(text.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files" }, { status: 400 });
  }

  const db = getDb();
  let model: string;
  let client: ReturnType<typeof getClient>;
  try {
    model = getModel();
    client = getClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Anthropic client init failed" },
      { status: 500 },
    );
  }
  const results: {
    filename: string;
    status: "appended" | "created" | "error";
    post_id?: number;
    detail: string;
  }[] = [];

  for (const file of files) {
    try {
      if (!SUPPORTED_IMAGE_MIMES.includes(file.type)) {
        throw new Error(`未対応の画像形式: ${file.type || file.name}`);
      }
      const buffer = Buffer.from(await file.arrayBuffer());

      // スクショ自体もANALYTICS Assetとして保存（Driveへ自動同期）
      const ts = timestampParts();
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      saveAssetFile({
        buffer,
        source: "ANALYTICS",
        originalFilename: file.name,
        mimeType: file.type,
        storedFilename: `${ts.datePart}_${ts.timePart}_analytics_${safe}`,
      });

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: EXTRACT_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: file.type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                  data: buffer.toString("base64"),
                },
              },
              { type: "text", text: "このアナリティクス画像を読み取ってください。" },
            ],
          },
        ],
      });
      const extracted = parseJson(textOf(response));

      const postText = String(extracted.post_text ?? "").trim();
      const key = normalizeText(postText).slice(0, 20);
      if (key.length < 6) {
        throw new Error("投稿本文を読み取れませんでした（本文が写る形で撮り直してください）");
      }

      // 既存投稿と本文で照合
      const candidates = db
        .prepare("SELECT id, raw_text, final_text FROM posts ORDER BY id DESC")
        .all() as { id: number; raw_text: string; final_text: string | null }[];
      const match = candidates.find(
        (p) =>
          normalizeText(p.raw_text).includes(key) ||
          (p.final_text && normalizeText(p.final_text).includes(key)),
      );

      const metrics = {
        impressions: toNumber(extracted.impressions),
        likes: toNumber(extracted.likes),
        reposts: toNumber(extracted.reposts),
        replies: toNumber(extracted.replies),
        bookmarks: toNumber(extracted.bookmarks),
        profile_visits: toNumber(extracted.profile_visits),
        follows: toNumber(extracted.follows),
      };

      const insertMetrics = (postId: number | bigint) =>
        db
          .prepare(
            `INSERT INTO post_metrics
               (post_id, impressions, likes, reposts, replies, bookmarks, profile_visits, follows)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            postId,
            metrics.impressions,
            metrics.likes,
            metrics.reposts,
            metrics.replies,
            metrics.bookmarks,
            metrics.profile_visits,
            metrics.follows,
          );

      const summary = `Imp ${metrics.impressions ?? "-"} / Like ${metrics.likes ?? "-"} / RP ${metrics.reposts ?? "-"}`;

      if (match) {
        insertMetrics(match.id);
        results.push({
          filename: file.name,
          status: "appended",
          post_id: match.id,
          detail: `#${match.id} にメトリクス追記（${summary}）`,
        });
      } else {
        // CLIMB外で直接投稿されたポスト → 記録として新規登録
        const dateStr =
          typeof extracted.post_date === "string" && /^\d{2}-\d{2}$/.test(extracted.post_date)
            ? `${new Date().getFullYear()}-${extracted.post_date}`
            : null;
        const postId = inTransaction(() => {
          const { lastInsertRowid } = db
            .prepare(
              `INSERT INTO posts (origin, post_type, raw_text, status, published_at)
               VALUES ('X_DIRECT', 'CASUAL', ?, 'PUBLISHED', ?)`,
            )
            .run(postText, dateStr ?? new Date().toISOString().slice(0, 10));
          insertMetrics(lastInsertRowid);
          return Number(lastInsertRowid);
        });
        results.push({
          filename: file.name,
          status: "created",
          post_id: postId,
          detail: `#${postId} を直接投稿として新規登録（${summary}）`,
        });
      }
    } catch (e) {
      results.push({
        filename: file.name,
        status: "error",
        detail: e instanceof Error ? e.message : "取り込みに失敗しました",
      });
    }
  }

  return NextResponse.json({ results });
}
