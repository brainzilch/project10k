import { NextRequest, NextResponse } from "next/server";
import { getClient, getModel, textOf, trackUsage } from "@/lib/anthropic";
import { learningsPromptBlock } from "@/lib/coach";

const BIO_SYSTEM = `あなたはXプロフィール（bio）の診断者。PROJECT 10K（1,458→10,000フォロワーへの365日挑戦）のアカウント。
次の3項目のみで評価する。各項目は1行以内:
1. 約束: 誰に何を約束しているか
2. 数字: 固有の数字が入っているか
3. 理由: フォローする理由が1行で分かるか

improved_bioは160字以内で1案のみ。本人の語彙・トーンを保ち、勝手な実績を作らない。`;

const BIO_SCHEMA = {
  type: "object",
  properties: {
    assessment: { type: "string" },
    improved_bio: { type: "string" },
  },
  required: ["assessment", "improved_bio"],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const bio = String(body.bio ?? "").trim();
  if (!bio) return NextResponse.json({ error: "bioを入力してください" }, { status: 400 });

  try {
    const response = await getClient().messages.create({
      model: getModel(),
      max_tokens: 6000,
      system: BIO_SYSTEM + learningsPromptBlock(),
      output_config: { format: { type: "json_schema", schema: BIO_SCHEMA } },
      messages: [{ role: "user", content: `名前: ${name}\nbio:\n${bio}` }],
    });
    const data = JSON.parse(textOf(trackUsage("bio診断", response))) as {
      assessment: string;
      improved_bio: string;
    };
    return NextResponse.json({
      assessment: data.assessment,
      improved_bio: data.improved_bio.slice(0, 160),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "diagnosis failed" },
      { status: 500 },
    );
  }
}
