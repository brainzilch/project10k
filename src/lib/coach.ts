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
- 投稿一覧: 推敲タイムライン・数字の手入力とスクショ自動読み取り(投稿ごとの直接ボタンあり)・
  一括アナリティクス取り込み(直接投稿の自動登録含む)・「数字未記録」赤バッジと未記録のみフィルタ・
  下書きの「N日滞留」バッジ(3日で赤)・下書き左スワイプで即公開(Undoトースト付き)・
  公開直後のシートで24時間後の数字記録通知(デフォルトON)とX投稿URLの紐付け
  (未記録カードに「Xで開く」リンク表示)
- フォロワー: 日次手入力+折れ線グラフ+連続記録N日表示
- 週次: 週ごとカードの数字サマリー・30日ペース換算・学び一覧・時間簿・
  テーマ別成績(投稿にテーマを付けると公開本数/平均インプ/平均いいね/平均プロフを集計)
- 設定: モデル設定・Drive接続/テスト/再送・スクショ収集・バックアップ3種・
  毎日のリマインド(時刻設定・未入力時のみ通知/バナー・入力済みならスキップ)
- プロフィール画面(設定から): 名前/bio(160字)の保存履歴・bioの3項目AI診断+改善版1案・
  変更日はフォロワーグラフに縦点線表示
- 報告記事の自動生成: 週1回+マイルストーン到達時の20時に、実データから本人の文体で
  報告文と進捗カード画像(1200x675)を自動作成しホームに下書き表示。スマホの共有シートで
  Xアプリへ1タップ共有(投稿の最終判断・実行は本人)
- 開発ネタのストック(ホーム): AIと組んだ現場の出来事を本人の文体で投稿ネタ化し
  最大3件ストック(毎日20時自動補充+手動補充)。採用すると本テーマ「AI開発」の下書きになる
- Xアーカイブ取り込み(設定): 公式アーカイブのtweets.jsで過去全投稿を蓄積、文体学習に使用
- ホーム: 進捗指標+「今日の公開数/DRAFT滞留数」行+「数字未記録の公開投稿」件数カード
  (24時間経過分のみ・タップ展開で行内インライン入力+スクショ読み取り・記録率と未記録連続日数の
  サブ行付き、記録率50%未満か3日連続で赤、全件記録済みなら緑で「全部記録できています」)
  +報告記事の下書きカード+AIコーチ(この分析)+アプリ改善提案
- 投稿一覧: 24時間以上滞留DRAFTのバナー(タップで絞り込み)・DRAFT行に公開/破棄ボタン
  (破棄は論理削除DISCARDED・Undoトースト付き)
制約: 1人用/X API不使用/スマホ利用がメイン/シンプルさ優先(PROJECT 10K > 開発)
注意: 上記に既にある機能・それに近い機能は提案しないこと`;

// Compact snapshot of everything measured so far, for the coach analysis.
export function buildCoachContext(): string {
  const db = getDb();
  const meta = getMeta();

  const followers = db
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all() as { date: string; followers: number }[];

  const posts = db
    .prepare(
      `SELECT p.id, p.post_type, p.origin, p.status, p.created_at, p.theme,
              COALESCE(p.final_text, p.raw_text) AS text
       FROM posts p WHERE p.status != 'DISCARDED' ORDER BY p.id ASC`,
    )
    .all() as {
    id: number;
    post_type: string;
    origin: string;
    status: string;
    created_at: string;
    theme: string | null;
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
  lines.push(
    `中間目標（収益化の階段）: 第一関門=報酬プログラム（認証済みフォロワー500人・認証済みインプ50万/90日。2026-09-01実測: 135人・1.46万）→ 次=サブスク解放（認証済み2,000人・500万インプ/3ヶ月）。認証済みフォロワーは総フォロワーの一部（実測比率 約9%）なので、第一関門は総フォロワー約5,000人規模に相当。提案はフォロワー数とインプ総量の両方を伸ばす観点で。`,
  );
  lines.push(`\n■ フォロワー推移（手入力の実測）`);
  for (const f of followers) lines.push(`${f.date}: ${f.followers}`);

  const dailyStats = db
    .prepare(
      `SELECT date, impressions, profile_visits, new_follows, unfollows, posts_created
       FROM x_daily_stats ORDER BY date DESC LIMIT 30`,
    )
    .all() as {
    date: string;
    impressions: number;
    profile_visits: number;
    new_follows: number;
    unfollows: number;
    posts_created: number;
  }[];
  if (dailyStats.length > 0) {
    lines.push(
      `\n■ 日次アカウント実績（Xアナリティクス実データ・直近${dailyStats.length}日）`,
    );
    lines.push("日付: Imp / プロフ訪問 / 新規フォロー / 解除 / 投稿数");
    for (const d of dailyStats.reverse()) {
      lines.push(
        `${d.date}: ${d.impressions} / ${d.profile_visits} / +${d.new_follows} / -${d.unfollows} / ${d.posts_created}本`,
      );
    }
  }

  lines.push(`\n■ 投稿と最新の数字`);
  for (const p of posts) {
    const m = metricsByPost.get(p.id);
    const nums = m
      ? `Imp${m.impressions ?? "-"} いいね${m.likes ?? "-"} RP${m.reposts ?? "-"} 返信${m.replies ?? "-"} プロフ${m.profile_visits ?? "-"} フォロー${m.follows ?? "-"}`
      : "数字未記録";
    lines.push(
      `#${p.id} [${p.post_type}/${p.origin === "X_DIRECT" ? "直接投稿" : "CLIMB"}/${p.status}${p.theme ? `/テーマ:${p.theme}` : ""}] ${p.created_at.slice(0, 10)} ${nums}\n  本文: ${p.text.replace(/\s+/g, " ").slice(0, 120)}`,
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
