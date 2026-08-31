# 2026-08-27 CLIMB v0.1 初期構築（Day 1）

## 目的

CLIMB v0.1 開発開始指示書に基づき、「今日から毎日使える最小構成」を構築する。
Day 1目標（Phase 1: 初期化・Git・SQLite schema・Dashboard・日次フォロワー・グラフ）に加え、
Phase 2（Compose・RAW保存・AI診断）とDay 2優先項目の一部（AI Chat・ローカル画像添付・Weekly・Settings）まで完了。

## 採用技術スタックと理由

- **Next.js 15 + TypeScript**: ローカルで安定、将来Web化可能、画面とAPIが1プロセスで完結
- **better-sqlite3（ORMなし・生SQL）**: 指示書候補のDrizzle ORMは採用しなかった。1人用・SQLite固定・SaaS抽象化禁止の条件下では、`src/lib/schema.sql` に全スキーマを平文で置く方が「データを後から失わない構造」の検証が容易で、依存も減るため
- **チャートはSVG手書き**: 折れ線1本のためにチャートライブラリを追加しない
- **@anthropic-ai/sdk**: モデル名はハードコードせず設定値（Settings画面 > 環境変数 > 既定値 `claude-opus-5`）

## 実装内容

1. `chore: initialize CLIMB project` — Next.js scaffold、.gitignore（`data/`・`.env*` 除外）、.env.example
2. `feat: add sqlite schema` — 全テーブルをDay 1で定義。**Asset / Attachment schemaもDay 1から**（後から画像を紐付け直さない設計）。`assets.upload_status` は LOCAL_SAVED / DRIVE_PENDING / DRIVE_UPLOADED / DRIVE_FAILED。起動時に冪等適用＋初期値seed（2026-08-27 / 1458 / 10000 / 365）
3. `feat: add project dashboard` — 現在フォロワー・残り・Day X/365
4. `feat: add daily follower input and graph` — 1日1行・同日上書き、SVG折れ線
5. `feat: add post draft workflow with Claude diagnosis` — RAW→5項目診断（各1行以内・prompt_version記録）→最小修正版（本人が希望した場合のみ1案）→FINAL→published。minimal_edit_used記録。メトリクスは追記型（上書き禁止）
6. `feat: add AI chat with local attachment storage` — 会話・メッセージ全DB保存。画像は `data/uploads/YYYY/MM/DD/` へ `YYYY-MM-DD_HHmmss_chat_<conv>_img_<seq>.<ext>` で保存、sha256計算、Claude呼び出し前にDB仮レコード作成（Claude API失敗でも画像・メッセージは残る）
7. `feat: add weekly summary, time log, and settings with manual backup` — 週次数字のみ・30日ペース換算（単純算数）・時間簿・Backup Now

## 変更ファイル

`src/lib/`（db.ts / schema.sql / anthropic.ts / diagnosis.ts / attachments.ts）、
`src/app/` 各画面（Dashboard / compose / chat / posts / followers / weekly / settings）、
`src/app/api/`（followers / posts / chat / conversations / assets / settings / backup / timelogs）

## 問題と解決

- npm installでTypeScript 7（Goネイティブ版）が入った → Next.js 15との互換性が不確実なためTypeScript 5.9へ固定
- チャット画像の耐障害性: ANTHROPIC_API_KEY未設定状態でテストし、Claude呼び出しが失敗してもメッセージ・画像ファイル・assetレコードが保存されることを確認済み

## 残課題（Day 2以降）

1. Google Drive OAuth 2.0（本人アカウント認証・トークンはローカルファイル保存、Gitコミット禁止）
2. PROJECT_10Kフォルダ構成の作成・接続テスト（Connect Google Drive / Test Upload）
3. チャット画像のバックグラウンドDriveアップロード（Claude処理と非同期）+ 起動時のPENDING/FAILED再送
4. Chat UIのDrive同期バッジは実装済み（現在は常にLocal ✓）— Drive実装後にそのまま機能する

## 追記: better-sqlite3 → node:sqlite への移行

Windows環境（Node 24）で `npm install` が失敗した。better-sqlite3のビルド済みバイナリが
Node 24用に存在せず、node-gypがVisual Studioを要求したため。
Visual Studioのインストールを求めるのは本末転倒なので、Node.js内蔵の `node:sqlite`
（Node 22.5+）へ移行し、ネイティブ依存を完全に排除した。

- `db.transaction()` → 手書きの `inTransaction()`（BEGIN/COMMIT/ROLLBACK）
- `db.backup()` → `VACUUM INTO`（稼働中でも一貫したスナップショット）
- 全機能（フォロワー入力・投稿・チャット画像保存・バックアップ）を再テスト済み

## 追記2: スクショ自動収集（証拠素材パイプライン）

報告投稿・note素材のためのスクショ収集を3点セットで実装（本人の依頼で確認の上追加）。

1. CLIMB自画面キャプチャ: `POST /api/capture` が playwright-core + インストール済みChrome/Edgeで
   全7画面をヘッドレス撮影し `source=CLIMB` のAssetとして登録（Settings画面のボタンから実行）
2. 取り込みフォルダ: `data/inbox/` に置いた画像をDashboard表示時とSettingsのスキャンボタンで
   自動Asset登録。サブフォルダ x / analytics / climb でsource分類、直下はOTHER
3. Windowsホットキースクリプト: `scripts/capture-screen.bat`（PowerShell、依存なし）で
   全画面PNGをinboxへ保存。ショートカットキー割り当て手順は scripts/README.md

Drive接続後は、これらのAssetも既存のupload_status機構でそのままGoogle Driveへ同期される。

## 追記3: スマホ対応 + パスワードゲート

- スマホ（同一Wi-Fi）からの利用がメイン投稿手段になるため、全画面をレスポンシブ化
  （チャットの会話一覧は横スクロールチップに、横長テーブルはパネル内スクロール）
- FINAL文面の「コピー」ボタンを追加（スマホ→Xアプリ貼り付けフロー用。
  LAN httpでは clipboard API が使えないため execCommand フォールバック付き）
- 「PCを起動していない時も使いたい」要望に備え、CLIMB_PASSWORD 環境変数による
  パスワードゲート（middleware + /login）を実装。未設定ならローカル利用に影響なし。
  クラウド常時稼働（VPS等）に載せる際の前提。ホスティング先は本人が選択する

## 追記4: Railwayへのクラウドデプロイ完了（Day 1）

- https://project10k-production.up.railway.app で常時稼働開始（本人がセットアップ）
- 構成: Dockerfile / 永続ボリューム `/data`（SQLite+画像原本）/ 環境変数
  ANTHROPIC_API_KEY・CLIMB_PASSWORD・CLIMB_DATA_DIR / 公開ポートは
  Railway注入の PORT=8080（next startが自動追従。本人が検出して設定）
- 以後クラウド側がデータの原本。PCローカル版とは併用しない
- git push で自動再デプロイ（ブランチ: claude/climb-v0-1-init-o5e7o2 を追跡）
- パスワード等の秘密情報はリポジトリに含めない（Railway Variablesのみ）

## 追記5: 推敲履歴と提案反映版の自動表示（本人による仕様変更）

「書き直しの過程そのものがストーリーになる」という本人の要望で、Composeを拡張。

- `post_revisions` テーブル追加（RAW / REWRITE / AI_EDIT / FINAL、追記専用）。
  全ての稿が時系列で残り、Postsページでタイムラインとして表示される
- 診断時に「提案反映版（AI案・1案）」を自動生成して同時表示するよう変更。
  指示書17条「本人が希望した場合のみ」は本人の判断で「常に表示」へ変更
  （1案のみ・複数案禁止は維持）。見た上で「自分で書き直す」「AI案を採用」
  「AI案を下書きに入れて調整」を選べる
- 書き直しは新しい稿として保存→自動再診断。原文（第1稿）は不変

## 追記6: アナリティクススクショの自動取り込み（2026-08-30）

X APIを使わない方針のまま、メトリクス手入力の負担を削減。

- Posts画面に「Xアナリティクス取り込み」を追加。ポストアクティビティのスクショを
  アップすると、Claudeの画像認識で本文と数字（Imp/Like/RP/返信/BM/プロフ訪問/フォロー）を
  抽出し、post_metricsへ追記（従来通り追記型）
- 本文の正規化照合で既存投稿とマッチング。CLIMBに記録がない投稿は
  origin='X_DIRECT'（直接投稿）として自動登録され、Posts画面にバッジ表示される
- postsテーブルにorigin列を追加（起動時マイグレーションで既存DBにもALTER適用、
  既存行はCLIMB扱い）
- スクショ自体もANALYTICS Assetとして保存されDrive（X/analytics/）へ自動同期
- 数字の読み取りはAIのため誤読の可能性あり。取り込み結果に数字が表示されるので
  目視確認し、違っていたら手入力で正しい行を追記する運用

## 追記7: AIコーチと学びのループ（2026-08-31）

「アプリが自分で成長し続け、フォロワーを増やす対策を常に提案してほしい」という
本人の要望に対し、アプリの境界内で成立する成長ループを実装。

- **AIコーチ**: ホームに常設。全実測データ（フォロワー推移・全投稿・最新メトリクス・
  既存の学び）をClaudeに渡し、「現状分析（3行）+ 明日からの具体的アクション3つ +
  新しい学び」を生成。coach_reportsに追記保存
- **学びの蓄積（成長の本体）**: 実測から得た教訓をlearningsテーブルに蓄積し、
  以後の投稿診断・AIチャットのシステムプロンプトへ自動注入。データが増えるほど
  診断・提案がこのアカウント固有の実測に基づいて賢くなる。prompt_versionをv2へ
- 週次画面に「学びの蓄積」一覧を表示（note素材にもなる）
- コーチは推測の数字を作らない制約付き（データが少なければ少ないと言う）。
  指示書10条「高度な予測AI禁止」は維持 — 予測ではなく実測に基づく助言のみ

## 追記8: アプリ自身による開発提案（2026-08-31）

「コード改善の提案もアプリ内でしてほしい。採用するかは本人が判断し、
採用時はClaude Codeへ指示する」という運用ループを実装。

- コーチ分析の出力に「アプリ改善提案」（最大2件）を追加。現在の機能一覧・
  利用状況・未対応の提案をコンテキストとして渡し、重複と過剰提案を抑制
  （シンプルさ優先の制約付き。価値が明確な時だけ提案する）
- dev_proposalsテーブル（OPEN/DONE/DISMISSED）。ホームにOPENの提案を表示し、
  各提案に「Claude Codeへそのまま貼れる実装指示文」+コピーボタン付き。
  採用→コピー→開発チャットへ貼る→実装→「実装済み」を押す、が改善ループ
- 修正: node:sqliteの行はnullプロトタイプで、Client Componentへ直接渡すと
  Next.jsがSSRエラーになる。プレーンオブジェクトへ変換してから渡すよう修正

## 追記9: 毎日のリマインドと連続記録（2026-08-31）

アプリ改善提案ループの初採用案件（コーチ提案→本人採用→Claude Codeで実装）。

- 設定に「毎日のリマインド」: ON/OFFトグル+時刻（既定22:00）。localStorage保存の
  端末ローカル設定でサーバー不要
- 設定時刻にその日のフォロワー数が未入力なら通知（Web Notification対応端末のみ・
  アプリを開いている間のみ）+ 全画面共通の未入力バナー（全端末で動作するフォールバック。
  iPhone Safariはページ通知非対応のためバナーが主役）。入力済みの日はスキップ、
  バナーは✕でその日だけ消せる
- フォロワー画面に「連続記録 N日」を表示。JSTで計算（サーバーはUTCのため+9h補正）。
  当日未入力の間は昨日までの連続でカウントし、途切れると0

## 追記10: 数字未記録の可視化（2026-08-31）

提案ループ採用第2号。公開済みなのにメトリクス0件の投稿を見逃さない導線。

- 投稿一覧: 該当カードに赤の「数字未記録」バッジ。タップでその投稿の
  手入力フォームが開いた状態で表示（?record=<id>+アンカーで実現、新規画面なし）
- 投稿一覧に「未記録のみ」トグルフィルタ（URLパラメータ方式）
- ホーム: コーチカードの上に「数字未記録の公開投稿 N件 →」警告バー。
  タップで未記録フィルタ済みの投稿一覧へ。0件なら非表示
- 入力後は全表示が自動で消えることを確認済み

## 追記11: 下書き滞留バッジ・スワイプ公開・数字待ちセクション（2026-09-01）

提案ループ採用第3号。

- 投稿一覧: 下書きカード右端に「N日滞留」バッジ（3日以上で赤）。
  カードを左スワイプで「公開済みにする」アクションが出現、タップで
  status=PUBLISHED+公開日記録。確認ダイアログなし・5秒のUndoトーストで復元
  （PATCHにunpublish復元パスを追加）
- ホーム: AIコーチの上に「数字待ち（N件）」セクション。公開済み&数字0件を
  公開日の古い順に最大3件、冒頭30文字+経過日数バッジ（3日以上で赤）で表示。
  行タップで該当投稿の手入力フォームが開いた状態に遷移、保存で消える。
  0件ならセクション非表示。前回実装の警告バーはこの上位互換のため置き換え

## 追記12: 数字未記録カードのインライン入力化（2026-09-01）

提案ループ採用第4号。ただしこの提案は既存の「数字待ち」セクションと大部分が
重複していた（原因: コーチに渡すアプリ機能一覧が最近の実装に未追随で、
重複抑制が効いていなかった）。新カードを増やさず既存セクションを提案仕様へ
アップグレードする形で実装。

- 対象を「公開から24時間経過かつ数字未記録」に限定（公開直後は数字が
  落ち着いていないため除外）。0件なら非表示（従来通り）
- 件数カードをタップで展開し、各行に インプ/いいね/RP/返信/プロフ/フォロー の
  インライン入力欄+「記録」+スクショ読み取り(📷)を併置。画面遷移なしで完結
- コーチのAPP_FEATURESを全機能に更新し「既存機能に近い提案はしない」を明記
  （重複提案の再発防止）

## 追記13: DRAFT滞留バナーと破棄（論理削除）（2026-09-01）

提案ループ採用第5号。

- 投稿一覧上部に「DRAFT滞留 N件：公開か破棄を決めよう」バナー（24時間以上
  DRAFTのままの投稿が対象、0件で非表示）。タップで該当DRAFTのみに絞り込み
- DRAFT行に「公開済みにする」「破棄」ボタン。破棄はstatus=DISCARDEDの論理削除で
  一覧から消えるがデータは保持。どちらも5秒Undoトーストで復元可能
- ホームの進捗指標下に「今日の公開数 N ／ DRAFT滞留 N件」を1行表示（JST基準）
- 週次集計とコーチ分析から破棄済み投稿を除外
- 技術: statusのCHECK制約にDISCARDEDを追加するため、起動時マイグレーションで
  postsテーブルを再構築（12-step ALTER、旧DB[origin列が末尾]と新DB両対応、
  実データ保持を旧スキーマDBで検証済み）

## 追記14（2026-08-31）: プロフィール画面 — bio診断と変更日マーカー（提案ループ第6号）

アプリ内提案の採用第6号。名前とbioを育てる画面を追加した。

- 新画面「プロフィール」（設定パネルからリンク）。入力は「名前」と「bio（160字、
  残り文字数カウンタ付き）」の2つだけ
- 「AIに診断」ボタン: bioを3項目（誰に何を約束しているか／固有の数字が入って
  いるか／フォローする理由が1行で分かるか）で各1行評価し、改善版を1案返す。
  structured output（json_schema）で形式保証、学び（learnings）も注入
- 「この文面にした（保存）」で履歴として積み上げ。各行に「この文にした日」
  バッジ、bio本文、診断結果（左ボーダーのタイムライン表示流用）
- フォロワーグラフに変更日の縦点線（黄・破線）を描画し、プロフィール変更
  前後の伸びを目視比較できるようにした。凡例1行付き
- 新テーブル profile_revisions（追記のみ、削除なし）。改善版bioはサーバー側でも
  160字にクリップ
