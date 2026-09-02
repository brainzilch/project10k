# Xアルゴリズム調査 2026-09版

海外ソース中心の調査結果。CLIMBの知識ベース（src/lib/growthKnowledge.ts）の根拠。
重み数値は解析記事間でばらつきがあるため「比率の目安」として扱う。

## 背景: 2026年1月の全面刷新
- 2026-01-11/19、X Engineeringが新推薦システムをオープンソース化（github.com/xai-org/x-algorithm）。
  旧Scala実装を廃棄し、Grok系Transformer（通称Phoenix）へ全面移行。Rust/Python
- 手作業のフィルタ層・ハッシュタグ/キーワード一致は廃止され、全投稿を意味で理解して配信
- 2025-11-30以降「フォロー中」タブも時系列ではなくランキング表示
- 小規模アカウントへの明示的ブースト、スパム・重複への明示的ペナルティ

## エンゲージメント重み（いいね=1、複数ソースの一致範囲）
| シグナル | 重み | 備考 |
|---|---|---|
| 会話カスケード（リプ→本人返信→相手が再反応） | +75（約150倍） | 最強 |
| リプライ | 約27倍（+13.5表記の解析も） | |
| リポスト | 約20倍 | |
| ブックマーク | 約15倍 | |
| プロフィールクリック（+エンゲージ） | 12〜24倍 | |
| 2秒以上の滞在（dwell） | 約4倍 | |
| 最初の30-60分のエンゲ速度 | 拡散の分水嶺 | |

## 負のシグナル
- 通報: -234〜-369（解析により幅。いずれも致命的）
- ミュート: 約-59 / ブロック: 約-31 / 興味なし: 約-43
- 負の履歴はアカウント評価に蓄積し数ヶ月リーチを下げる
- エンゲベイト（「フォローで◯◯」等）はGrok検出、3回で収益化剥奪+審査送り
- テンプレ調・使い回しAI文は検出・抑制、そもそもリプが付かず自然淘汰

## コンテンツ形式
- 本文中の外部リンク: リーチ30-50%減（2026Q1計測では最大94%減の報告も）。
  対策: リンクは最初のリプに置く（現在も有効）
- ネイティブ動画（2:20以内）が最優先形式。動画付きはテキストのみの約10倍のエンゲ報告
- ハッシュタグ: 1-2個は約+21%、3個以上で約-17%、5個以上で約-40%
- 長文はPremiumのArticles/長文投稿でdwell稼ぎが有効
- Grokセンチメント: 建設的・前向きなトーンが優遇、攻撃的トーンはエンゲが高くても抑制

## アカウント・運用
- Premiumブースト: 規定でイン網4倍/外網2倍。Buffer 1,880万投稿の実測では
  中央値でPremiumは無料の約10倍、Premium+は15倍超のインプ
- リプライ欄でもPremiumが上位表示（返信インプ+30-40%）
- 投稿頻度: 3-5本/日が最適レンジ、初心者は1-3本から。質>量
- ニッチ一貫性: 意味ベースの著者理解により、テーマの一貫性が配信先の決定に直結
- 小規模アカウントの主戦術: 自分より大きい同ジャンルアカウントへ投稿後30分以内の
  価値あるリプ（70%リプ/30%自作）。1K→10K達成アカウント分析で84%が主戦術と回答

## 日本独自
- 能動利用ピーク: 朝7-9時・昼12-13時・夜21-23時（JST）
- 引用リポスト文化が海外より強い。引用+リプで会話連鎖
- リプ欄の「大喜利」化は会話カスケードの量産装置
- 雑誌型（1枚に情報を詰めた）画像はdwellを稼ぎ日本で特に有効
- 推し活・食・現場系（イベント/ライブ）ジャンルが反応を得やすい

## 主要ソース
- https://typefully.com/blog/x-algorithm-open-source
- https://github.com/xai-org/x-algorithm
- https://ppc.land/xs-algorithm-source-code-drops-what-it-reveals-about-the-platforms-feed-mechanics/
- https://buffer.com/resources/x-premium-review/
- https://sproutsocial.com/insights/twitter-algorithm/
- https://www.socialpilot.co/blog/twitter-algorithm
- https://socialbee.com/blog/twitter-algorithm/
- https://www.socialmediatoday.com/news/x-formerly-twitter-switching-to-fully-ai-powered-grok-algorithm/803174/
- https://www.socialmediatoday.com/news/x-updates-its-engagement-bait-detection/825495/
- https://www.teract.ai/resources/twitter-reply-guy-strategy-2026
- https://grahammann.net/blog/how-to-grow-on-x-twitter-2026
- https://posteverywhere.ai/blog/how-the-x-twitter-algorithm-works
- https://opentweet.io/blog/how-twitter-x-algorithm-works-2026
- https://www.ownly.jp/sslab/x-algorithm （日本語・時間帯）
- https://www.shuttlerock.co.jp/article/detail/post-21234/ （日本語・トレンド/形式）
