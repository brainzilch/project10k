import { getDb, getMeta } from "./db";

export type Learning = {
  id: number;
  insight: string;
  evidence: string | null;
  created_at: string;
};

export function getActiveLearnings(limit = 12): Learning[] {
  return getDb()
    .prepare(
      "SELECT id, insight, evidence, created_at FROM learnings WHERE active = 1 ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as Learning[];
}

// Appended to the diagnosis / chat system prompts. Empty string until the
// first learnings exist, so prompts start lean and grow with the data.
export function learningsPromptBlock(): string {
  const learnings = getActiveLearnings();
  if (learnings.length === 0) return "";
  const lines = learnings
    .map((l) => `- ${l.insight}${l.evidence ? `（根拠: ${l.evidence}）` : ""}`)
    .join("\n");
  return `\n\n【このアカウントの実測から得た学び（診断・提案に反映すること）】\n${lines}`;
}

// Current feature set, told to the coach so app-improvement proposals are
// grounded in what exists. Update when features are added or changed.
const APP_FEATURES = `CLIMBの現在の機能:
- 投稿を書く: 原文→5項目AI診断+提案反映版(1案)→書き直し(全稿記録)→完成版保存/コピー
- AIチャット: 会話全保存・画像添付(ローカル+Google Drive自動保存)
- 投稿一覧: 推敲タイムライン・数字の手入力(追記型)・アナリティクススクショの自動読み取り(直接投稿の自動登録含む)
- フォロワー: 日次手入力+折れ線グラフ
- 週次: 数字サマリー・30日ペース換算・学び一覧・時間簿
- 設定: モデル設定・Drive接続/テスト/再送・スクショ収集(自画面キャプチャ/アップロード)・バックアップ3種
- ホーム: 進捗指標+AIコーチ(この分析)
制約: 1人用/X API不使用/スマホ利用がメイン/シンプルさ優先(PROJECT 10K > 開発)`;

// Compact snapshot of everything measured so far, for the coach analysis.
export function buildCoachContext(): string {
  const db = getDb();
  const meta = getMeta();

  const followers = db
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all() as { date: string; followers: number }[];

  const posts = db
    .prepare(
      `SELECT p.id, p.post_type, p.origin, p.status, p.created_at,
              COALESCE(p.final_text, p.raw_text) AS text
       FROM posts p ORDER BY p.id ASC`,
    )
    .all() as {
    id: number;
    post_type: string;
    origin: string;
    status: string;
    created_at: string;
    text: string;
  }[];

  const latestMetrics = db
    .prepare(
      `SELECT pm.* FROM post_metrics pm
       JOIN (SELECT post_id, MAX(measured_at) AS m FROM post_metrics GROUP BY post_id) x
         ON x.post_id = pm.post_id AND x.m = pm.measured_at`,
    )
    .all() as {
    post_id: number;
    impressions: number | null;
    likes: number | null;
    reposts: number | null;
    replies: number | null;
    bookmarks: number | null;
    profile_visits: number | null;
    follows: number | null;
  }[];
  const metricsByPost = new Map(latestMetrics.map((m) => [m.post_id, m]));

  const lines: string[] = [];
  lines.push(
    `プロジェクト: ${meta.start_date}開始、${meta.start_followers}→${meta.goal_followers}フォロワー、${meta.duration_days}日間`,
  );
  lines.push(`\n■ フォロワー推移（手入力の実測）`);
  for (const f of followers) lines.push(`${f.date}: ${f.followers}`);

  lines.push(`\n■ 投稿と最新の数字`);
  for (const p of posts) {
    const m = metricsByPost.get(p.id);
    const nums = m
      ? `Imp${m.impressions ?? "-"} いいね${m.likes ?? "-"} RP${m.reposts ?? "-"} 返信${m.replies ?? "-"} プロフ${m.profile_visits ?? "-"} フォロー${m.follows ?? "-"}`
      : "数字未記録";
    lines.push(
      `#${p.id} [${p.post_type}/${p.origin === "X_DIRECT" ? "直接投稿" : "CLIMB"}/${p.status}] ${p.created_at.slice(0, 10)} ${nums}\n  本文: ${p.text.replace(/\s+/g, " ").slice(0, 120)}`,
    );
  }

  const learnings = getActiveLearnings(50);
  if (learnings.length > 0) {
    lines.push(`\n■ 既に記録済みの学び（重複して出力しない）`);
    for (const l of learnings) lines.push(`- ${l.insight}`);
  }

  lines.push(`\n■ アプリの現状\n${APP_FEATURES}`);

  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM posts) AS posts,
        (SELECT COUNT(*) FROM post_metrics) AS metrics,
        (SELECT COUNT(*) FROM messages) AS chat_messages,
        (SELECT COUNT(*) FROM assets) AS assets,
        (SELECT COUNT(*) FROM time_logs) AS time_logs`,
    )
    .get() as Record<string, number>;
  lines.push(
    `利用状況: 投稿${usage.posts}件 / 数字記録${usage.metrics}回 / チャット${usage.chat_messages}通 / 画像${usage.assets}枚 / 時間簿${usage.time_logs}件`,
  );

  const openProposals = db
    .prepare("SELECT title FROM dev_proposals WHERE status = 'OPEN'")
    .all() as { title: string }[];
  if (openProposals.length > 0) {
    lines.push(`\n■ 提案済みで未対応のアプリ改善案（重複して出力しない）`);
    for (const p of openProposals) lines.push(`- ${p.title}`);
  }

  return lines.join("\n");
}
