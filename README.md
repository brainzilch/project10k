# CLIMB

**PROJECT 10K** — Xアカウント [@brainzilch](https://x.com/brainzilch) を 365日で **1,458 → 10,000 followers** へ成長させる実証プロジェクトの記録・投稿診断・AI対話ツール。

SNS運用をAIに代行させるツールではない。本人が体験し、考え、原文を書き、判断し、投稿する。AIは指摘・記録・整理・検索・分析補助を担当する。

- 開始日: 2026-08-27 / 開始フォロワー: 1,458 / 目標: 10,000 / 期間: 365日
- 1人用・ローカル中心・SQLite。認証・課金・マルチユーザーなし。

## 画面

| 画面 | 内容 |
|---|---|
| Dashboard | 現在フォロワー / 残り / Day X/365 |
| Compose | X投稿原文（RAW）→ AI 5項目診断 → 最小修正版（任意・1案）→ FINAL保存 |
| AI Chat | Claudeとの会話（全会話DB保存・画像添付可） |
| Posts | RAW→FINAL履歴・タグ・投稿メトリクス手入力（追記型） |
| Followers | 日次フォロワー手入力 + 折れ線グラフ |
| Weekly | 週次の数字のみ（増減・投稿数・minimal edit使用率・時間簿） |
| Settings | APIキー状態 / Claude model / Drive状態 / DB場所 / Backup Now |

## 起動方法

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY を設定
npm run dev                  # http://localhost:3000
```

初回起動時に `data/climb.db` が作成され、PROJECT 10K の初期値（開始日・1458・10000・365日）が自動seedされる。

## スマホからの利用（メインの投稿手段）

PCでCLIMBを起動したまま、同じWi-Fiに繋がったスマホのブラウザからアクセスする。

1. PCで `npm run dev` を起動すると、起動ログに `Network: http://192.168.x.x:3000` のようなURLが表示される（PCのIPは `ipconfig` の「IPv4 アドレス」でも確認可能）
2. スマホのブラウザでそのURL（例: `http://192.168.1.5:3000`）を開く
3. ホーム画面に追加しておくとアプリのように起動できる

スマホでの投稿フロー: Compose で原文を書く → AI診断 → FINAL保存 →「FINALをコピー」→ Xアプリに貼り付けて投稿。写真・スクショの添付も AI Chat からそのまま送れる（カメラロールから選択可）。

つながらない場合は Windows ファイアウォールで Node.js がブロックされている。初回起動時の許可ダイアログで「プライベートネットワーク」を許可するか、管理者のコマンドプロンプトで:

```cmd
netsh advfirewall firewall add rule name="CLIMB 3000" dir=in action=allow protocol=TCP localport=3000
```

※ 同一Wi-Fi内のみ。PCを起動していない時も使う場合は、次の「クラウド常時稼働」を使う。

## クラウド常時稼働（PCなしでスマホから使う）

CLIMBは設計を変えずにそのまま小さなクラウドサーバーで動く（`Dockerfile` 同梱）。
Railway / Fly.io / Render / 任意のVPSいずれでも同じ。必須条件は3つ:

1. **永続ボリュームを `/data` にマウントする**（SQLite・画像の原本がここに入る。ボリュームなしのデプロイはデータが消えるので厳禁）
2. **環境変数を設定する**: `ANTHROPIC_API_KEY`、`CLIMB_PASSWORD`（公開URLになるので必須）、`CLIMB_DATA_DIR=/data`
3. HTTPSで公開する（Railway/Fly/Renderは自動）

Railway の例: GitHubリポジトリを接続 → Volume を `/data` に追加 → 環境変数を設定 → デプロイ。
以後 `git push` するだけで自動更新される。

- スマホからは発行されたURL（`https://〜`）を開き、`CLIMB_PASSWORD` でログイン。ホーム画面に追加してアプリのように使う
- クラウド運用開始後は**クラウド側が原本**。ローカルPC側と二重運用しない（DBが分裂する）
- ローカルで使い始めたデータを引き継ぐ場合は `data/climb.db` をボリュームへコピーする（少量なら手入力し直しでもよい）
- 「CLIMB全画面をスクショ」はサーバー内のChromiumで動作する。Windowsホットキースクリプトのスクショは、Drive連携完成後はDrive経由で取り込む形になる

## 環境変数（.env.local）

| 変数 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI機能に必須 | Anthropic APIキー |
| `CLIMB_CLAUDE_MODEL` | 任意 | Claudeモデル名（既定: `claude-opus-5`。Settings画面からも変更可） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Drive連携時 | Google Drive OAuth 2.0（Day 2で実装） |
| `CLIMB_DATA_DIR` | 任意 | データディレクトリの場所（既定: `./data`） |

**`.env` / `.env.local` は絶対にGitへコミットしない**（`.gitignore` 済み）。APIキー・OAuthトークンをDBに平文保存しない。

## Anthropic API設定

1. https://console.anthropic.com でAPIキーを発行
2. `.env.local` の `ANTHROPIC_API_KEY` に設定して再起動
3. Settings画面で「API Key: set」になっていることを確認

## Google API設定（Drive連携・Day 2実装予定）

1. Google Cloud Console でプロジェクト作成 → Drive API 有効化
2. OAuth 2.0 クライアントID（デスクトップ/Webアプリ）を作成
3. `.env.local` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を設定
4. Settings → Connect Google Drive でユーザー本人のGoogleアカウントを認証（サービスアカウントは使わない）
5. My Drive に `PROJECT_10K/` フォルダ構成が作成され、AI Chatに送った画像が自動保存される

画像はまずローカル（`data/uploads/YYYY/MM/DD/`）に保存され、Driveはクラウドコピー。Drive障害時も画像は失われず、`DRIVE_PENDING` / `DRIVE_FAILED` のものは再送される。

## DB場所とデータ構造

```
data/
├── climb.db        # SQLite本体（原本）
├── uploads/        # 添付画像のローカル原本 YYYY/MM/DD/
└── exports/        # Backup Nowの出力先
```

主なテーブル: `posts`（RAW→FINAL）、`conversations` / `messages` / `message_attachments`、`assets`（sha256・Drive同期状態）、`daily_followers`、`post_metrics`（追記型）、`time_logs`、`sources`、`tags`。スキーマは `src/lib/schema.sql`。

## Backup方法

Settings → **Backup Now** で `data/exports/climb-YYYYMMDD-HHmmss.db` にスナップショットを作成（SQLite online backup使用・稼働中でも安全）。`data/` ディレクトリごと別ドライブ等にコピーすれば完全バックアップになる。

## 開発ログ

Claude Codeによる開発記録は `docs/devlog/` にMarkdownで残す（将来のnote素材）。

## 優先順位

**PROJECT 10K > CLIMB開発。** 開発がPROJECT 10Kの運用時間を食い始めたら、機能を削る。
