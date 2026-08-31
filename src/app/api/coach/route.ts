import { NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";
import { getClient, getModel, textOf } from "@/lib/anthropic";
import { buildCoachContext } from "@/lib/coach";

const COACH_SYSTEM = `あなたはPROJECT 10K（Xアカウントを365日で1,458→10,000フォロワーへ）の専属コーチ。
渡された実測データだけを根拠に分析する。推測で数字を作らない。データが少なければその旨を書く。
出力はJSONのみ。説明文・コードフェンス禁止。

{
  "summary": "現状分析（3行以内。数字を根拠に）",
  "actions": ["明日からできる具体的な一手（1行）", "…最大3つ"],
  "learnings": [{"insight": "実測から言える教訓（1行）", "evidence": "根拠の数字"}]
}

learningsは「既に記録済みの学び」と重複しない新しい発見のみ。新発見がなければ空配列。
actionsは抽象論ではなく、本人が明日実行できる粒度で書く。`;

function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("コーチ応答の解析に失敗しました");
  return JSON.parse(text.slice(start, end + 1));
}

// Run a coach analysis: data -> report + new learnings. The learnings feed
// back into every future diagnosis/chat prompt - the app's growth loop.
export async function POST() {
  try {
    const context = buildCoachContext();
    const response = await getClient().messages.create({
      model: getModel(),
      max_tokens: 2048,
      system: COACH_SYSTEM,
      messages: [{ role: "user", content: context }],
    });
    const data = parseJson(textOf(response));

    const summary = String(data.summary ?? "").trim();
    const actions = Array.isArray(data.actions)
      ? data.actions.map((a: unknown) => String(a).trim()).filter(Boolean).slice(0, 3)
      : [];
    const learnings = Array.isArray(data.learnings)
      ? data.learnings
          .map((l: unknown) => {
            const o = l as { insight?: unknown; evidence?: unknown };
            return {
              insight: String(o.insight ?? "").trim(),
              evidence: String(o.evidence ?? "").trim() || null,
            };
          })
          .filter((l) => l.insight)
          .slice(0, 3)
      : [];
    if (!summary) throw new Error("コーチ応答が空でした");

    const db = getDb();
    inTransaction(() => {
      db.prepare(
        "INSERT INTO coach_reports (summary, actions) VALUES (?, ?)",
      ).run(summary, JSON.stringify(actions));
      for (const l of learnings) {
        db.prepare(
          "INSERT INTO learnings (insight, evidence) VALUES (?, ?)",
        ).run(l.insight, l.evidence);
      }
    });

    return NextResponse.json({ ok: true, summary, actions, new_learnings: learnings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "coach failed" },
      { status: 500 },
    );
  }
}
