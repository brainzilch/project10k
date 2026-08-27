# 2026-08-27 Google Drive自動保存 設計（Day 2実装予定）

## 目的

AI Chatに送信された画像を、確認なしで自動的にGoogle Driveへ保存する。
単なるバックアップではなく、PROJECT 10Kの証拠・note素材・将来の映像素材として
「あの日のスクショ」を後から取得できる状態を作る。

## 認証方式

- Google Drive API v3 + **OAuth 2.0（本人のGoogleアカウント）**。サービスアカウントは使わない
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` は `.env.local`（Gitコミット禁止）
- refresh tokenは `data/` 配下のローカルファイル（`.gitignore` 済み領域）に保存。DB平文保存はしない
- Settings → Connect Google Drive → OAuth同意 → callback → `PROJECT_10K/` フォルダ構成を作成または既存取得 → Test Upload

## フォルダ構成（初回接続時に作成）

```
PROJECT_10K/
├── 00_DAY0/
├── AI_CHAT/images/ , AI_CHAT/files/
├── X/screenshots/ , X/analytics/ , X/posts/
├── CLIMB/screenshots/ , CLIMB/development/ , CLIMB/exports/
├── NOTE/materials/ , NOTE/images/
├── MONTHLY/
└── ARCHIVE/
```

v0.1では `PROJECT_10K/AI_CHAT/images/` への保存が必須。他は作成のみ。
フォルダIDは `settings` テーブルに保存（`drive_folder_id` 等）。

## アップロードフロー（実装済みのschema前提）

1. 画像送信 → ローカル保存（`data/uploads/`）+ `assets` 仮レコード（`LOCAL_SAVED`）… **実装済み**
2. Claude API処理はDriveと完全非同期（Driveが遅くても会話は続く）… **実装済み**
3. Drive接続済みなら status を `DRIVE_PENDING` にし、レスポンス返却後にバックグラウンドでupload
4. 成功: `drive_file_id` / `drive_url` / `drive_folder_id` / `uploaded_at` を保存し `DRIVE_UPLOADED`
5. 失敗: `DRIVE_FAILED`。UIに「Drive failed / Retry」表示、手動再送可能
6. アプリ起動時（または定期的に）`DRIVE_PENDING` / `DRIVE_FAILED` を検索して再試行

## 不変条件

- ローカルが原本。Driveはクラウドコピー。Drive障害で画像を失わない
- 同一sha256でも自動削除しない（Assetは共有可能だがAttachment関係は会話ごとに別）
- ファイル名 `YYYY-MM-DD_HHmmss_chat_<conversation id>_img_<sequence>.<ext>` で衝突回避、元ファイル名はDB保存

## 実装完了（Day 1中に前倒し）

設計通りに実装した。追加の実装判断:

- googleapis SDKは使わず、fetchによる生REST（token refresh / files list・create /
  multipart upload）で実装。依存ゼロを維持
- スコープは `drive.file`（このアプリが作成したファイルのみアクセス可）で最小化
- Drive自動アップロードの起点は `saveAssetFile`（全Asset保存の関門）。接続前はno-op
- 再送は Dashboard 表示時 + Settings「未同期を再送」。同時実行ガード付き・最大50件/回
- OAuth state はCSRF対策としてcookie検証。redirect URIはアクセス中のoriginから自動導出
  （GOOGLE_REDIRECT_URI で明示上書きも可）
- オフサイトバックアップ: 「バックアップをダウンロード」（ブラウザDL）と
  「DBバックアップをDriveへ」（CLIMB/exports）を追加し、クラウド移行で生じた
  単一障害点（Railwayボリューム）を解消

ローカル検証済み: バックアップDLのDB整合性、未接続時の全エンドポイントの安全動作、
OAuth リダイレクトURL生成。Google API 実通信は本番でOAuth接続後に Test Upload で確認する。

## 本番接続完了 — v0.1完成（Day 1）

OAuth接続時に3つのエラーを順に解決した（すべてnote素材になる実録）:

1. `redirect_uri_mismatch`（1回目）: リダイレクトURIの不一致
2. `access_denied`: OAuth同意画面のテストユーザー未登録 → 本人のGmailを追加
3. `redirect_uri_mismatch`（2回目・真因）: Railwayプロキシ背後でNext.jsがリクエスト元を
   `localhost:8080` と認識し、`https://localhost:8080/...` を送っていた。
   Googleのエラー詳細画面で実際の送信値を確認して特定。
   `x-forwarded-host` / `x-forwarded-proto` ヘッダーから公開URLを組み立てる修正で解決。
   環境変数 GOOGLE_REDIRECT_URI への依存も廃止（設定ミスの余地を排除）

最終確認: AI Chatで画像送信 → Claude応答 → 「Local ✓ Drive ✓」バッジ →
PROJECT_10K/AI_CHAT/images/ への自動保存を本番で確認。

**指示書43条の完成条件10項目を全て達成。CLIMB v0.1完成（Day 1で完了）。**
