import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { useIdea } from "@/lib/devstory";

// use: creates a DRAFT post from the idea. dismiss: hides it (kept in DB).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  if (body.use === true) {
    const postId = useIdea(Number(id));
    if (postId == null)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, post_id: postId });
  }
  if (body.dismiss === true) {
    getDb()
      .prepare(
        "UPDATE dev_story_ideas SET status = 'DISMISSED' WHERE id = ? AND status = 'OPEN'",
      )
      .run(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unsupported" }, { status: 400 });
}
