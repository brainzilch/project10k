# CLIMB スクリプト

## capture-screen.bat / capture-screen.ps1（Windows全画面スクショ）

画面全体（マルチモニタ含む）をPNGで `data/inbox/` に保存する。
inboxに入った画像は、CLIMBのDashboardを開いた時（またはSettings→「取り込みフォルダをスキャン」）に
自動でAsset登録され、`data/uploads/` へ移動される。Drive接続後はGoogle Driveにも自動保存される。

### ホットキー設定（1回だけ）

1. `scripts\capture-screen.bat` を右クリック → 「その他のオプションを確認」→「ショートカットの作成」
2. できたショートカットをデスクトップへ移動
3. ショートカットを右クリック → プロパティ → 「ショートカットキー」欄をクリックし `Ctrl + Alt + S` を押す → OK

以後、どの画面でも `Ctrl + Alt + S` でスクショが撮れて、CLIMBに自動記録される。

- 全体ではなく一部を撮りたいときは従来通り `Win + Shift + S`（Snipping Tool）で撮り、
  保存したファイルを `data\inbox\` に入れればよい
- `data\inbox\x\`（X関連）、`analytics\`（アナリティクス）、`climb\`（CLIMB画面）に入れると
  Asset の source が自動分類される。直下に入れたものは OTHER になる

### 注意

全画面キャプチャなので、画面に映っているもの（メール・個人情報等）がそのまま保存される。
撮る前に画面の状態を確認すること。
