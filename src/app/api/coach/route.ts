import { NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";
import { getClient, getModel, textOf } from "@/lib/anthropic";
import { buildCoachContext } from "@/lib/coach";

const COACH_SYSTEM = `あなたはPROJECT 10K（Xアカウントを365日で1,458→10,000フォロワーへ）の専属コーチ。
渡された実測データだけを根拠に分析する。推測で数字を作らない。データが少なければその旨を書く。

- summary: 現状分析（3行以内。数字を根拠に）
- actions: 明日からできる具体的な一手（各1行・最大3つ）。抽象論ではなく本人が明日実行できる粒度で書く
- learnings: 実測から言える教訓（insightは1行、evidenceは根拠の数字）。「既に記録済みの学び」と重複しない新しい発見のみ。新発見がなければ空配列
- proposals: アプリ改善提案。「コードを変えた方がフォロワー増加・記録の継続に効く」と判断した時だけ最大2件。既存機能とOPEN提案に重複しないこと。シンプルさ優先の制約を守り、価値が明確な時以外は空配列。instructionは機能名・画面・挙動を具体的に書く（開発担当のClaude Codeが読んでそのまま実装できる粒度）`;

// output_config.format guarantees the response text is valid JSON matching
// this schema - no fence-stripping or repair needed.
const COACH_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    actions: { type: "array", items: { type: "string" } },
    learnings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          insight: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["insight", "evidence"],
        additionalProperties: false,
      },
    },
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          reason: { type: "string" },
          instruction: { type: "string" },
        },
        required: ["title", "reason", "instruction"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "actions", "learnings", "proposals"],
  additionalProperties: false,
} as const;

// Run a coach analysis: data -> report + new learnings. The learnings feed
// back into every future diagnosis/chat prompt - the app's growth loop.
export async function POST() {
  try {
    const context = buildCoachContext();
    const response = await getClient().messages.create({
      model: getModel(),
      // adaptive thinking shares this budget - keep generous headroom so the
      // JSON is never truncated mid-string
      max_tokens: 12000,
      system: COACH_SYSTEM,
      output_config: { format: { type: "json_schema", schema: COACH_SCHEMA } },
      messages: [{ role: "user", content: context }],
    });
    const data = JSON.parse(textOf(response)) as Record<string, unknown>;

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
    const proposals = Array.isArray(data.proposals)
      ? data.proposals
          .map((p: unknown) => {
            const o = p as { title?: unknown; reason?: unknown; instruction?: unknown };
            return {
              title: String(o.title ?? "").trim(),
              reason: String(o.reason ?? "").trim(),
              instruction: String(o.instruction ?? "").trim(),
            };
          })
          .filter((p) => p.title && p.instruction)
          .slice(0, 2)
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
      for (const p of proposals) {
        db.prepare(
          "INSERT INTO dev_proposals (title, reason, instruction) VALUES (?, ?, ?)",
        ).run(p.title, p.reason, p.instruction);
      }
    });

    return NextResponse.json({
      ok: true,
      summary,
      actions,
      new_learnings: learnings,
      new_proposals: proposals,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "coach failed" },
      { status: 500 },
    );
  }
}
