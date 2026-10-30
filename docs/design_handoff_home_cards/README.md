# Handoff: 主頁項目卡片（方向 1c「分區按鈕卡」）

## Overview
重新設計「本堂課要用哪些遊戲和工具？」頁面中的遊戲／工具卡片。目標：中文名稱為主、英文降為副標；卡片高度一致；「勾選」與「開啟」分成兩個獨立點擊區，避免誤觸；已勾選卡片顯示它在左側欄的順序。

## About the Design Files
`主頁卡片.dc.html` 是 HTML 設計參考（含 1a/1b/1c 三個方向），**只需實作 1c**（檔案中 `id="1c"` 區塊）。請用專案現有框架與慣例重建，不要直接複製 HTML。

## Fidelity
High-fidelity：顏色、字級、間距、狀態請照下方數值實作。

## Layout
- 卡片網格：`grid-template-columns: repeat(N, minmax(0,1fr))`，gap 12px。原頁寬度維持 4 欄；窄螢幕可降為 3/2/1 欄。
- 「遊戲」「工具」分區標籤沿用現有膠帶樣式。

## Card（橫向三段，flex row）
外框：min-height 84px；背景 `#fbf8f1`；radius 6px；overflow hidden；
shadow `0 1px 0 rgba(60,45,20,.08), 0 2px 6px rgba(60,45,20,.06)`；
已勾選時 `outline: 1.5px solid #26412f; outline-offset: -1.5px`（未勾選 transparent）。

1. **勾選區（左）** — 寬 52px，flex column 置中，gap 4px，cursor pointer。
   - 背景：未勾選 `#efe6d6`；已勾選 `#26412f`。transition background .15s。hover `filter: brightness(.96)`。
   - 勾選框：20×20，radius 4px，border 1.5px（未勾 `#b9af9b`／已勾 `#fff`），內容 ✓（白色，13px，weight 900）。
   - 下方順序數字：12px bold 白色，顯示左側欄順序（1、2、3…），未勾選不顯示。
2. **名稱區（中）** — flex 1，min-width 0，padding 12px 16px，垂直置中，gap 2px；**點擊同樣切換勾選**。
   - 中文名：20px / 700 / line-height 1.3 / `#2b2a24`。
   - 英文名：13px / 400 / `#8a8170`。工具類無英文名，只顯示中文。
3. **開啟區（右）** — 寬 48px，`border-left: 1px solid #ebe2d0`，置中 「→」20px `#7a715f`，title/aria-label「開啟」。
   - hover：背景 `#efe6d6`，文字 `#2b2a24`。點擊只開啟，不切換勾選（stopPropagation）。

字型：Noto Sans TC（400/500/700/900）。

## Interactions & State
- `selected: string[]` 有序陣列（勾選順序 = 左側欄順序）。
- 點勾選區或名稱區：若已在陣列則移除，否則 push 到尾端；順序數字即時更新。
- 點「→」：開啟該遊戲／工具，不影響勾選。
- 鍵盤：勾選區與開啟區應為兩個可聚焦按鈕（role="checkbox" aria-checked / button）。

## Data
遊戲（中文 / 英文）：吊人遊戲 Hangman、圈圈叉叉 Tic-Tac-Toe、開禮物 Mystery Gift、唸課文 Read Aloud、填空 Fill in the Blanks、快判卡 Quick Check、少了什麼 What is Missing?、立可拍 Instant Camera、拉霸機 Slot Machine、剪刀石頭布 Rock Paper Scissors、抽牌 Draw a Card。
工具：我的獎勵、抽籤筒、圖片瘦身。

## Design Tokens
- ink `#2b2a24`、muted `#8a8170`、icon muted `#7a715f`
- card `#fbf8f1`、page/hover `#efe6d6`、divider `#ebe2d0`、box border `#b9af9b`
- accent green `#26412f`
- radius 6px（卡）/ 4px（勾選框）

## Files
- `主頁卡片.dc.html` — 設計參考，看 `id="1c"` 區塊。
