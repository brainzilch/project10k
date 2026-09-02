import { getDb, inTransaction } from "./db";
import { getClient, getModel, textOf } from "./anthropic";
import { buildCoachContext } from "./coach";

const COACH_SYSTEM = `あなたはPROJECT 10K（Xアカウントを365日で1,458→10,000フォロワーへ）の専属コーチ。
渡された実測データだけを根拠に分析する。推測で数字を作らない。データが少なければその旨を書く。

分析の観点（データがある範囲で毎回チェックし、効く順に提案する）:
1. 頻度: 公開本数/日と日次インプ・新規フォローの関係。公開0本の日が続いていれば最優先の課題
2. 型とテーマ: テーマ別・型別（現場の写真/実物の公開/挑戦の報告/AI論/返信）の平均インプ。伸びた型を増やし、伸びない型を減らす
3. 転換: インプ→プロフ訪問→フォローの各率。プロフ訪問が多いのにフォローが少なければ、bio・固定ポスト・名前の問題として扱う
4. 時間帯・曜日: 実測の反応が良い枠に公開を寄せる
5. 分配: 友人向けの返信はインプ30程度で伸びに寄与しない。同ジャンル（AI×映像・現場）の大きいアカウントへの具体的な返信は露出経路になる。「リプ活動」の実施状況と枠の自動判定を見て、枠が足りない/こなせていない/リプ先の質が合っていない、のどれかを指摘する
6. 収益化の階段（認証済みフォロワー500人・認証済みインプ50万/90日）への距離

- summary: 現状分析（3行以内。数字を根拠に）
- actions: 明日からできる具体的な一手（各1行・最大3つ）。「いつ（時間帯）・何を（型/テーマ）・何本」の粒度。抽象論禁止。根拠の数字を括弧で添える
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
export type CoachResult = {
  summary: string;
  actions: string[];
  learnings: { insight: string; evidence: string | null }[];
  proposals: { title: string; reason: string; instruction: string }[];
};

// Run a coach analysis: data -> report + new learnings (+ proposals). Shared
// by the home button and the weekly automatic run.
export async function runCoach(): Promise<CoachResult> {
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

  return { summary, actions, learnings, proposals };
}

// Weekly automatic run: Monday 20:00 JST hour, once per day, then a push so
// the plan for the week is waiting on the phone. Manual runs are unchanged.
export async function autoCoachTick(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  if (jst.getUTCDay() !== 1 || jst.getUTCHours() !== 20) return;
  const today = jst.toISOString().slice(0, 10);
  const { getSetting, setSetting } = await import("./db");
  if (getSetting("coach_last_auto_date", "") === today) return;
  setSetting("coach_last_auto_date", today);
  const r = await runCoach();
  console.log(`[climb] weekly coach run: ${r.actions.length} actions, ${r.learnings.length} learnings`);
  const { pushOnce } = await import("./push");
  await pushOnce("coach", today, {
    title: "CLIMB",
    body: "今週のコーチ分析が届きました。今週の一手を確認しよう",
    url: "/",
    tag: "coach",
  });
}
