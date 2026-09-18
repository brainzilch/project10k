import { getDb } from "./db";

// 型変換（セリフ型）: this account's measurably best-performing structure is
// the overheard-conversation post - a line from someone else, then the
// owner's own line. Exemplars are pulled from the imported X archive by
// likes, so the model imitates the owner's real dialogue posts rather than a
// generic template.

// Real dialogue posts open a line with the speech itself, or with a short
// speaker label right before it (舞台監督「…」 / 俺「…」 / 「そろそろ…」).
// A quoted title buried mid-sentence (今年、映画50本…「この世界の片隅に」が…)
// never matches, because the quote must sit within a few characters of the
// line start. Two such lines are required.
const SPEAKER_QUOTE = /(?:^|\n)[ \t　]*[^\s。、！？!?…「『]{0,8}[「『]/g;

function speakerQuoteCount(text: string): number {
  return (text.match(SPEAKER_QUOTE) ?? []).length;
}

export type Exemplar = { text: string; likes: number };

export function dialogueExemplars(limit = 3): Exemplar[] {
  const rows = getDb()
    .prepare(
      `SELECT text, favorite_count AS likes FROM x_archive_posts
       WHERE is_retweet = 0 AND is_reply = 0 AND favorite_count > 0
         AND text LIKE '%「%'
       ORDER BY favorite_count DESC LIMIT 40`,
    )
    .all() as { text: string; likes: number }[];
  return rows
    .filter((r) => speakerQuoteCount(r.text) >= 2)
    .slice(0, limit)
    .map((r) => ({ ...r }));
}

export function exemplarBlock(): string {
  const examples = dialogueExemplars();
  if (examples.length === 0) return "";
  return `\n\n【このアカウントで実際に伸びたセリフ型の投稿（構造を真似る対象。内容は真似ない）】\n${examples
    .map((e, i) => `--- 例${i + 1}（いいね${e.likes}）\n${e.text}`)
    .join("\n")}`;
}

export const STYLE_CONVERT_SYSTEM = `あなたはX投稿の「型変換」担当。本人が書いた原文を、事実を一切変えずに「セリフ型（会話形式）」へ書き換える。

セリフ型とは: 相手の発言を「」で示し、それに対する本人の反応・返答・心の声を続ける構造。場面が目に浮かび、読者が会話に立ち会っている感覚になる。

絶対ルール:
- 原文に無い事実・数字・出来事を足さない。誰が言ったかを捏造しない
- 原文に会話の相手がいない場合は、本人の心の声と現実の対比（「〜と思ってたら、〜だった」）で構成してよい
- 本人の語彙・語尾・改行の癖を保つ。本人が使わない言葉を持ち込まない
- 出力は書き換えた本文のみ。1案だけ。説明・前置き・複数案は禁止
- 140字以内を基本、最大200字。ハッシュタグは原文にあるものだけ残す`;
