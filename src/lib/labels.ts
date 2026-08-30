// Display labels for spec vocabulary. DB values stay RAW/FINAL/PRIMARY/CASUAL
// (spec terms + aggregation keys); only what the user sees is Japanese.
export const POST_TYPE_LABEL: Record<string, string> = {
  PRIMARY: "本気投稿",
  CASUAL: "気軽な投稿",
};

export function postTypeLabel(type: string): string {
  return POST_TYPE_LABEL[type] ?? type;
}
