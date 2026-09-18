import { NextResponse } from "next/server";
import { fetchFollowerCount, getHandle, recordAutoFollowers } from "@/lib/followerFetch";

// Manual "取得する" button: runs the same layered fetch as the scheduler and
// reports exactly which source answered (or why each failed).
export async function POST() {
  const result = await fetchFollowerCount();
  if (result.followers === null) {
    return NextResponse.json(
      {
        error: "自動取得できませんでした",
        handle: getHandle(),
        attempts: result.attempts,
      },
      { status: 502 },
    );
  }
  const written = recordAutoFollowers(result.followers);
  return NextResponse.json({
    ok: true,
    followers: result.followers,
    source: result.source,
    written,
    attempts: result.attempts,
  });
}
