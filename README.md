# teaching-aid

讓語言老師用遊戲來教學的網站。

A website that helps language teachers teach through games.

## 狀態

使用 Next.js（App Router）。目前有 Hangman、圈圈叉叉（Tic-Tac-Toe）遊戲，以及「教材」：老師可上傳 PDF 或圖片（存在瀏覽器的 IndexedDB），上課時在遊戲和教材之間切換，遊戲進度不會中斷。另有「圖片瘦身」工具：把圖片縮到最長邊 600 像素、每張約 200 KB 以下（檔名和格式不變），方便放上 Dropbox 給遊戲使用。「我的獎勵」：上傳學生名單 Excel（學生、金幣），每位學生一個寶箱，點一下掉進一枚金幣；下課後下載紀錄到電腦，下次再上傳接著累積。「開禮物」：上傳禮物 Excel（好禮物、不好的禮物、炸彈，各有數量），每一份禮物一個禮物盒，顏色可隨機或自訂，盒子正面可放圖片或文字（字型和破音字寫法同圈圈叉叉）取代數字；點盒子會搖晃（drum.mp3），打開後禮物從盒中出來放在盒子前面，依種類播 wow.mp3、oh oh.mp3 或 bomb.mp3。Excel 範本裡需要選擇的欄位都是下拉選單。

## 開發

```bash
npm install
npm run dev   # http://localhost:3000
```

## 注音字型與破音字

- 字型都是可自由分享的開放授權字型（ButTaiwan/bpmfvs 系列）：楷書、圓體、芫荽由 Google Fonts 提供，「只有注音」放在 `public/fonts/`（授權檔在同一個資料夾）。
- 破音字用 IVS（讀音選擇記號）指定讀音。Excel 裡寫 `長[ㄓㄤˇ]`，匯入時會換成對應的記號；對照表是 `lib/polyphones.json`，來源是 bpmfvs 的 `poyin_db.txt`（教育部《國語一字多音審訂表》）。
- 更新對照表：`node scripts/build-polyphones.mjs`
