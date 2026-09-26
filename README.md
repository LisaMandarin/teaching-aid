# teaching-aid

讓語言老師用遊戲來教學的網站。

A website that helps language teachers teach through games.

## 狀態

使用 Next.js（App Router）。目前有 Hangman、圈圈叉叉（Tic-Tac-Toe）遊戲。

## 開發

```bash
npm install
npm run dev   # http://localhost:3000
```

## 注音字型與破音字

- 字型都是可自由分享的開放授權字型（ButTaiwan/bpmfvs 系列）：楷書、圓體、芫荽由 Google Fonts 提供，「只有注音」放在 `public/fonts/`（授權檔在同一個資料夾）。
- 破音字用 IVS（讀音選擇記號）指定讀音。Excel 裡寫 `長[ㄓㄤˇ]`，匯入時會換成對應的記號；對照表是 `lib/polyphones.json`，來源是 bpmfvs 的 `poyin_db.txt`（教育部《國語一字多音審訂表》）。
- 更新對照表：`node scripts/build-polyphones.mjs`
