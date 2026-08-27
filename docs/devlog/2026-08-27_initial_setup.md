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
