import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAttachmentsForMessages } from "@/lib/attachments";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const conversation = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id);
  if (!conversation)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = db
    .prepare(
      "SELECT id, role, content, model, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC",
    )
    .all(id) as { id: number }[];
  const attachments = getAttachmentsForMessages(messages.map((m) => m.id));

  return NextResponse.json({
    conversation,
    messages: messages.map((m) => ({
      ...m,
      attachments: (attachments.get(m.id) ?? []).map((a) => ({
        id: a.id,
        original_filename: a.original_filename,
        upload_status: a.upload_status,
      })),
    })),
  });
}
