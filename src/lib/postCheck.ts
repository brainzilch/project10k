// Static pre-publish checks (client-safe, no AI). Rules come from the
// algorithm knowledge base: hashtags beyond one cost reach, in-body links
// cost 30-94%, and very short text-only posts tend to be thin. They warn;
// they never block.

export type PostWarning = {
  rule: "hashtags" | "link" | "short";
  message: string;
  matches: string[];
};

const HASHTAG = /#[^\s#＃]+/g;
const LINK = /https?:\/\/\S+/g;

export function checkPostText(text: string): PostWarning[] {
  const warnings: PostWarning[] = [];
  const tags = text.match(HASHTAG) ?? [];
  if (tags.length >= 2) {
    warnings.push({
      rule: "hashtags",
      message: `タグ${tags.length}個: 3個以上で約17%減。0〜1個推奨`,
      matches: tags,
    });
  }
  const links = text.match(LINK) ?? [];
  if (links.length > 0) {
    warnings.push({
      rule: "link",
      message: "本文リンクはリーチ30〜94%減。最初のリプに置く",
      matches: links,
    });
  }
  // CLIMB tracks text only - whether an image will be attached is unknown
  // here, so the rule is phrased as a conditional
  if (text.trim().length > 0 && text.trim().length < 140) {
    warnings.push({
      rule: "short",
      message: `${text.trim().length}字: 画像を付けないなら情報量が薄い可能性`,
      matches: [],
    });
  }
  return warnings;
}
