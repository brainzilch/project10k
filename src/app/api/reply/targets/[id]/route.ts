import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// active=false hides a target (kept in DB with its history); priority reorders.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  if (typeof body.active === "boolean") {
    db.prepare("UPDATE reply_targets SET active = ? WHERE id = ?").run(body.active ? 1 : 0, id);
  }
  if (Number.isInteger(body.priority)) {
    db.prepare("UPDATE reply_targets SET priority = ? WHERE id = ?").run(body.priority, id);
  }
  return NextResponse.json({ ok: true });
}
