import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const rows = getDb()
    .prepare(
      "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
    )
    .all();
  return NextResponse.json(rows);
}
