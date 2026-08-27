import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getClient, getModel, textOf } from "@/lib/anthropic";
import { MINIMAL_EDIT_SYSTEM } from "@/lib/diagnosis";

// Generates exactly one minimal-edit version, only when the user asks for it.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const post = db
    .prepare("SELECT id, raw_text FROM posts WHERE id = ?")
    .get(id) as { id: number; raw_text: string } | undefined;
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const response = await getClient().messages.create({
      model: getModel(),
      max_tokens: 1024,
      system: MINIMAL_EDIT_SYSTEM,
      messages: [{ role: "user", content: post.raw_text }],
    });
    const edit = textOf(response);
    db.prepare("UPDATE posts SET ai_minimal_edit = ? WHERE id = ?").run(edit, id);
    return NextResponse.json({ ai_minimal_edit: edit });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "minimal edit failed" },
      { status: 500 },
    );
  }
}
