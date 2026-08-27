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
