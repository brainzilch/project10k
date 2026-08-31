import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Mark a coach app-improvement proposal DONE (implemented) or DISMISSED.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const status = String(body.status ?? "");
  if (!["DONE", "DISMISSED", "OPEN"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  const db = getDb();
  const proposal = db.prepare("SELECT id FROM dev_proposals WHERE id = ?").get(id);
  if (!proposal) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.prepare("UPDATE dev_proposals SET status = ? WHERE id = ?").run(status, id);
  return NextResponse.json({ ok: true });
}
