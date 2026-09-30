# BGM を Suno で作って差し替える方法

この動画の BGM と効果音は、コードで合成した自作の音です（Suno は使っていません）。
Suno で作った曲に差し替える場合は、次の手順です。

1. Suno で下の指示文から曲を作り、`audio/bgm.mp3`（wav / m4a / ogg / flac も可）として保存する。
2. `npm run render:staff` を実行する。`audio/bgm.*` があれば、内蔵の BGM の代わりに自動でその曲を使う。
   - 曲は 90 秒より短ければ繰り返し、長ければ 90 秒で切って最後に 2 秒でフェードアウトする。
   - 公演中の生演奏の区間（58〜79 秒）は Suno の曲を消し、内蔵の生ピアノだけにする（区間は `scripts/render_staff.mjs` の `between(t,58,79)`）。
   - 効果音（ブブー、足音、ドア、拍手、チャイムなど）は内蔵のまま重ねる。
3. 映像を描き直さずに音だけ作り直す場合: `SKIP_VIDEO=1 npm run render:staff`（先に作った無音映像 `*_silent.mp4` を使う）。

## Suno に貼る指示文（案）

スタイル（Style of Music）:

```
instrumental, light upbeat corporate jingle, soft piano and pizzicato strings, gentle marimba, warm, friendly, clean, 96 bpm, C major, no vocals, 90 seconds, no big drop
```

歌詞欄:

```
[Instrumental]
```

除外したい要素（Exclude）:

```
vocals, heavy drums, distortion, EDM, dubstep
```

## 公演中（58〜79 秒）の生演奏について

映像では 58〜77 秒にピアノの生演奏があり、その後 77〜80 秒に拍手が入ります。
この区間は生音に近い静かなピアノだけにするため、Suno の曲は自動で消えます。
