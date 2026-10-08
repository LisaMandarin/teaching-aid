# Codebase 結構

這份文件整理「教學便利通」目前的程式結構，作為閱讀程式、定位功能及新增功能的入口。功能操作方式請見 [README.md](README.md)。

## 1. 專案概觀

這是一個以瀏覽器端互動為主的語言教學網站，使用 Next.js App Router、React 與 TypeScript。畫面包含遊戲、教材與教學工具，採黑板／粉筆／軟木布告欄主題。

| 項目 | 目前做法 |
| --- | --- |
| 框架 | `package.json` 宣告 Next.js `^16.3.6`、React／React DOM `^19.3.0` |
| 語言 | TypeScript，啟用 `strict`；`@/*` 對應專案根目錄 |
| 路由 | `app/`，共 13 個功能路由 |
| 畫面與互動 | `components/`；各功能主要使用 React hooks 管理狀態 |
| 邏輯與資料處理 | `lib/`，包含檔案解析、文字轉換、儲存、音效等 |
| 資料保存 | localStorage 存設定與部分進度；IndexedDB 存教材、照片 |
| 後端 | 目前沒有自訂 API route、Server Action、帳號系統或伺服器端資料庫 |
| 樣式 | 全域 CSS 與共用主題 CSS |

## 2. 目錄總覽

```text
teaching-aid/
├── app/                     # App Router、根版型與全域樣式
│   ├── layout.tsx           # 字型、metadata、Sidebar、Workspace、WelcomeDialog
│   ├── page.tsx             # /，對應吊人遊戲
│   ├── globals.css          # 全站布局、各功能樣式與動畫
│   └── <功能>/page.tsx      # 其餘 12 個功能路由
├── components/              # 功能畫面與共用 UI
│   ├── Workspace.tsx        # 路徑對應畫面、保留已開啟的功能
│   ├── Sidebar.tsx          # 導覽、教材清單、清除遊戲設定
│   ├── WelcomeDialog.tsx    # 歡迎視窗與 LINE 資訊
│   ├── CellContent.tsx      # 共用文字、拼音與格子圖片顯示
│   ├── Chalkboard.tsx       # 黑板容器
│   ├── DropZone.tsx         # 上傳區外觀容器
│   ├── Icons.tsx            # SVG 圖示
│   ├── Confetti.tsx         # 彩帶效果
│   └── <功能>.tsx           # 各遊戲、教材與工具的實作
├── lib/                     # 共用處理與功能資料邏輯，詳見下表
├── public/
│   ├── fonts/               # 只有注音的字型及授權文件
│   ├── sounds/              # 遊戲音效檔案
│   └── line-qr.png          # LINE 官方帳號 QR code
├── scripts/
│   └── build-polyphones.mjs # 產生破音字對照表
├── school-theme.css         # 主題變數與共用視覺 class
├── package.json             # 套件與開發指令
├── package-lock.json        # npm 相依版本鎖定
├── tsconfig.json            # TypeScript 設定及 @/* 路徑別名
├── next-env.d.ts            # Next.js 產生的型別參照
├── AGENTS.md                # 專案的 AI 開發規則
├── CLAUDE.md                # 引用 AGENTS.md
├── README.md                # 功能操作與開發說明
└── CODEBASE.md              # 本文件
```

`.agents/`、`.claude/` 與 `skills-lock.json` 為代理工具相關設定；`node_modules/`、`.next/`、`tsconfig.tsbuildinfo` 分別為安裝套件、Next.js 產物與 TypeScript 增量快取。

## 3. 畫面如何組成

```text
app/layout.tsx
├── Sidebar                 導覽連結與教材清單
├── main.stage
│   ├── Workspace           依 usePathname() 顯示功能元件
│   │   ├── 目前功能         顯示
│   │   └── 已開啟的其他功能  保持掛載，以 hidden 隱藏
│   └── children            各 page.tsx 目前皆回傳 null
└── WelcomeDialog           歡迎視窗
```

**找功能實作時，先看 `Workspace.tsx`，再看對應的 `components/*.tsx`。** `app/**/page.tsx` 目前只是建立可導覽的路由，實際畫面不在這些檔案裡。

`Workspace` 記錄已造訪的路徑，首次造訪才掛載該功能，切換時保留舊元件。因此老師從遊戲切到教材再回來，React 記憶體中的遊戲狀態仍在。重新整理後能恢復哪些資料，則取決於各功能實際寫入瀏覽器儲存的欄位；保留掛載與持久化是兩個不同機制。

## 4. 路由與功能對照

以下元件皆位於 `components/`，邏輯檔皆位於 `lib/`。

| 網址 | 功能 | 主要元件 | 主要邏輯／資料處理 |
| --- | --- | --- | --- |
| `/` | 吊人遊戲 | `Hangman.tsx`、`HangmanBoard.tsx` | 筆畫與遊戲狀態在元件內；`sounds.ts` |
| `/tic-tac-toe` | 圈圈叉叉 | `TicTacToe.tsx` | `lessons.ts`：題庫匯入、抽題、圖片 |
| `/gifts` | 開禮物 | `GiftBoxes.tsx` | `gifts.ts`：禮物設定、種類、範本與匯入 |
| `/read-aloud` | 唸課文 | `ReadAloud.tsx` | `readAloud.ts`、`runEditor.ts` |
| `/fill-blank` | 填空 | `FillBlank.tsx` | `fillBlank.ts`、`readAloud.ts`、`runEditor.ts` |
| `/quick-check` | 快判卡 | `QuickCheck.tsx` | 共用 `lessons.ts`；判定與卡片狀態在元件內 |
| `/instant-camera` | 立可拍 | `InstantCamera.tsx` | `camera.ts`：照片匯入、縮圖與儲存 |
| `/slot-machine` | 拉霸機 | `SlotMachine.tsx` | `slots.ts`：轉輪資料、設定、範本與匯入 |
| `/rock-paper-scissors` | 剪刀石頭布 | `RockPaperScissors.tsx` | 對戰與計分在元件內；`sounds.ts` |
| `/materials` | 教材 | `Materials.tsx` | `materials.ts`：教材清單、選取、增刪與儲存 |
| `/rewards` | 我的獎勵 | `Rewards.tsx` | `rewards.ts`：學生名單與金幣紀錄匯入／匯出 |
| `/draw` | 抽籤筒 | `NameDraw.tsx` | `draw.ts`：學生名單解析與範本 |
| `/image-resizer` | 圖片瘦身 | `ImageResizer.tsx` | `images.ts`；元件另使用 `fflate` 打包 ZIP |

## 5. `lib/` 模組分工

| 檔案 | 職責 |
| --- | --- |
| `lessons.ts` | `Cell`、`Lesson` 題庫模型；圈圈叉叉／快判卡 Excel 匯入與範本；洗牌、抽題、本機圖片配對及 Dropbox／Drive 圖片網址處理 |
| `gifts.ts` | 禮物、盒面與顏色設定，Excel 解析和範本 |
| `slots.ts` | 轉輪資料與限制、Excel 解析和範本 |
| `draw.ts` | 抽籤名單 Excel 解析與範本 |
| `rewards.ts` | 學生及金幣資料模型、Excel 解析、紀錄匯出與範本 |
| `readAloud.ts` | `Run` 課文模型、文字範圍／字型修改、分行、DOCX 解析，以及螢光筆／底線標記轉換 |
| `runEditor.ts` | contentEditable DOM 與 `Run[]` 互轉、讀取及還原選取範圍 |
| `fillBlank.ts` | 挖空／取消挖空、答案卡整理、空格寬度與洗牌 |
| `fonts.ts` | 可選字型、`FontId`、字型名稱與 Excel 設定值對應 |
| `zhuyin.ts` | 破音字標記解析、IVS 讀音選擇記號及可見文字長度 |
| `polyphones.json` | 漢字與注音讀音對照資料，由腳本產生 |
| `hanzi.ts` | 繁轉簡、漢語拼音、注音轉拼音；需要時才載入轉換套件 |
| `excel.ts` | 建立含下拉選單的 Excel；以 `fflate` 修改 XLSX 內的 XML，加入資料驗證與隱藏工作表 |
| `images.ts` | 瀏覽器圖片載入、Canvas 等比例縮放、透明度及壓縮處理 |
| `idb.ts` | IndexedDB object store 與交易的 Promise 封裝 |
| `materials.ts` | 教材 IndexedDB 存取、Blob URL 與共享狀態；透過 `useSyncExternalStore` 同步側欄及教材畫面 |
| `camera.ts` | 立可拍照片的 IndexedDB 存取、匯入排序與圖片縮放 |
| `sounds.ts` | Web Audio 合成音效、音效檔播放與預載 |
| `line.ts` | LINE 官方帳號網址與 QR code 路徑 |

`lib/` 並非全是純函式：`runEditor.ts` 操作 DOM，`materials.ts` 包含 React hook 與共享狀態，儲存及音效模組使用瀏覽器 API。

## 6. 資料模型與處理流程

兩個最常被共用的模型是：

- `Cell`（`lib/lessons.ts`）：文字、圖片 URL、選填圖片檔名與正誤答案。用於圈圈叉叉、快判卡，以及禮物／拉霸的相關內容。
- `Run`（`lib/readAloud.ts`）：`{ text, font, blank? }`。課文由多段 Run 組成；相同 `blank` 編號代表同一個填空答案，可跨不同字型段落。

```text
Excel → 各功能的 parse 函式 → 題庫／設定 → 功能元件 → localStorage
DOCX／輸入文字 → Run[] → runEditor 編輯 → RunText／BoardText 顯示
本機圖片 → images 縮放 → 遊戲用 data URL，或照片用 Blob + IndexedDB
PDF／教材圖片 → materials → IndexedDB → Blob URL → 教材畫面
```

文字顯示的共用鏈為 `fonts.ts`（選項）→ `zhuyin.ts`（指定讀音）→ `hanzi.ts`（需要時轉簡體／拼音）→ `CellContent.tsx`（呈現）。指定讀音使用如 `長[ㄓㄤˇ]` 的輸入格式，匯入或處理後轉為字型使用的 IVS 記號。

## 7. 狀態與儲存

| 層級 | 存放內容 | 實作位置 |
| --- | --- | --- |
| React 記憶體 | 當局互動、動畫、選取、遊戲進度等 | 各功能元件；`Workspace` 保留掛載 |
| localStorage | 各功能設定、部分進度、靜音／字型偏好與歡迎視窗偏好 | 各功能元件的初始化及儲存 effects |
| IndexedDB：`teaching-aid`／`materials` | 教材 PDF／圖片 Blob 與檔案資訊 | `materials.ts`、`idb.ts` |
| IndexedDB：`teaching-aid-camera`／`photos` | 立可拍照片 Blob、尺寸及匯入順序 | `camera.ts`、`idb.ts` |

課堂資料的主要 localStorage keys 是 `tictactoe-setup`、`gifts-setup`、`read-aloud`、`fill-blank`、`quick-check`、`instant-camera`、`slot-machine`、`rock-paper-scissors`、`draw-list`、`rewards-roster`。

「清除所有遊戲設定」由 `Sidebar.tsx` 的 `CLASS_DATA_KEYS` 與 `clearClassData()` 管理：移除指定 keys、清除立可拍照片，再重新整理頁面。教材、獨立存放的靜音及字型偏好會保留。新增需要一起清除的課堂資料時，需同步更新這裡。

目前沒有跨裝置同步；資料保存於使用中的瀏覽器與網站來源。Google Fonts、外部圖片網址仍可能需要網路，不能將瀏覽器端儲存視為完整離線支援。

## 8. 樣式與靜態資源

- `school-theme.css`：色彩與字型變數，以及 `.chalkboard`、`.cork`、`.paper`、`.pin`、`.tape`、`.btn-chalk` 等共用視覺 class。
- `app/globals.css`：開頭匯入主題檔，另定義全站布局、各功能樣式、動畫與本機注音字型。目前約 4,000 行，找功能樣式時可搜尋對應 class。
- `app/layout.tsx`：透過 `next/font/google` 載入霞鶩文楷與 Noto Sans TC，並以 Google Fonts stylesheet 載入注音字型。
- `public/fonts/`：只有注音的 WOFF2 字型及授權文件。
- `public/sounds/`：歡呼、金幣、書寫、開禮物等音效；部分其他音效由 `sounds.ts` 合成。

題目使用的字型由字型選單決定，與介面黑板／粉筆的主題字型分開處理。

## 9. 開發時從哪裡修改

| 修改目標 | 優先查看 |
| --- | --- |
| 新增一個功能頁 | `app/<功能>/page.tsx`、`Workspace.tsx` 的 `views`、`Sidebar.tsx` 的導覽清單、對應功能元件 |
| 調整某個遊戲規則／互動 | 對應 `components/*.tsx`，以及上方路由表列出的邏輯模組 |
| 修改 Excel 欄位／範本 | 對應功能的 `lib/*.ts`；共用下拉選單機制在 `excel.ts` |
| 修改課文編輯或 DOCX 匯入 | `readAloud.ts`、`runEditor.ts`；挖空規則另看 `fillBlank.ts` |
| 修改字型、注音、簡體或拼音 | `fonts.ts`、`zhuyin.ts`、`hanzi.ts`、`CellContent.tsx` |
| 修改教材／照片保存 | `materials.ts`、`camera.ts`、`idb.ts` |
| 修改全站外觀 | `school-theme.css` 與 `app/globals.css` |
| 修改課堂資料重設 | `Sidebar.tsx` 的清除資料流程 |

開發指令：`npm run dev` 啟動開發環境，`npm run build` 建置，`npm run start` 啟動建置後的應用程式。更新破音字資料執行 `node scripts/build-polyphones.mjs`，會從上游下載資料並覆寫 `lib/polyphones.json`。

目前未見專案測試檔或測試框架設定，`package.json` 也未提供 `test`／`lint` 指令。`AGENTS.md` 要求修改程式前先閱讀安裝版本的 `node_modules/next/dist/docs/` 相關指南。
