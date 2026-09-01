import { NextResponse } from "next/server";
import { generateDevStories, openIdeas } from "@/lib/devstory";

// Manual "ネタを補充" button. The daily top-up runs from instrumentation.
export async function POST() {
  if (openIdeas().length >= 3) {
    return NextResponse.json(
      { error: "ストックが3件あります。先に使うかボツにしてください。" },
      { status: 409 },
    );
  }
  try {
    const added = await generateDevStories(2);
    return NextResponse.json({ ok: true, added });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 500 },
    );
  }
}
