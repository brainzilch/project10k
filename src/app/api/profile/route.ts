import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// Save a profile revision (この文にした日 = today, JST). Any diagnosis shown
// at save time is stored with the revision for the story.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const bio = String(body.bio ?? "").trim();
  if (!name || !bio) {
    return NextResponse.json({ error: "名前とbioを入力してください" }, { status: 400 });
  }
  if (bio.length > 160) {
    return NextResponse.json({ error: "bioは160字以内です" }, { status: 400 });
  }
  getDb()
    .prepare(
      "INSERT INTO profile_revisions (name, bio, ai_feedback, ai_edit, applied_on) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      name,
      bio,
      body.ai_feedback ? String(body.ai_feedback) : null,
      body.ai_edit ? String(body.ai_edit) : null,
      jstToday(),
    );
  return NextResponse.json({ ok: true });
}
