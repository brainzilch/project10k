import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";

// Imports the official X archive's tweet files (data/tweets.js, or
// tweets-part1.js etc. on large accounts). The file is JS of the form
// `window.YTD.tweets.part0 = [ { "tweet": {...} }, ... ]` - strip the
// assignment prefix and parse the array. Idempotent via tweet_id UNIQUE.
type ArchiveTweet = {
  tweet?: {
    id_str?: string;
    full_text?: string;
    created_at?: string;
    favorite_count?: string | number;
    retweet_count?: string | number;
    in_reply_to_status_id_str?: string | null;
  };
};

function parseArchiveFile(content: string): ArchiveTweet[] {
  const eq = content.indexOf("=");
  const body = (eq >= 0 ? content.slice(eq + 1) : content).trim();
  const parsed = JSON.parse(body);
  return Array.isArray(parsed) ? parsed : [];
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  }

  const db = getDb();
  let total = 0;
  let added = 0;
  try {
    for (const file of files) {
      const tweets = parseArchiveFile(await file.text());
      inTransaction(() => {
        for (const t of tweets) {
          const tw = t.tweet;
          if (!tw?.id_str || !tw.full_text) continue;
          total++;
          const createdAt = tw.created_at
            ? new Date(tw.created_at).toISOString()
            : "";
          const { changes } = db
            .prepare(
              `INSERT OR IGNORE INTO x_archive_posts
               (tweet_id, text, created_at, favorite_count, retweet_count, is_reply, is_retweet)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              tw.id_str,
              tw.full_text,
              createdAt,
              Number(tw.favorite_count ?? 0) || 0,
              Number(tw.retweet_count ?? 0) || 0,
              tw.in_reply_to_status_id_str ? 1 : 0,
              tw.full_text.startsWith("RT @") ? 1 : 0,
            );
          if (changes > 0) added++;
        }
      });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: `読み取れませんでした。アーカイブzip内の data/tweets.js をそのままアップロードしてください（${e instanceof Error ? e.message.slice(0, 80) : "parse error"}）`,
      },
      { status: 400 },
    );
  }

  const stats = db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(created_at) AS oldest, MAX(created_at) AS newest
       FROM x_archive_posts`,
    )
    .get() as { n: number; oldest: string | null; newest: string | null };
  return NextResponse.json({
    ok: true,
    added,
    total,
    stored: stats.n,
    oldest: stats.oldest?.slice(0, 10) ?? null,
    newest: stats.newest?.slice(0, 10) ?? null,
  });
}
