# 互動白板實作計畫

> 狀態：計畫已定案，尚未開始實作（2026-10-09）
> 名詞以 [CONTEXT.md](../../CONTEXT.md) 為準。架構決定見 [ADR 0001–0004](../adr/)。
> 雛形保存在本機分支 `proto/whiteboard`（`npm run proto:whiteboard`）。

## 目標

老師課前在帳號裡準備好多份**白板教案**。上課時，用「教案 + 班級」開一堂**白板課**，把**學生連結**發給學生。每位學生拿到一張自己的**學生白板**，用來拖曳**華語詞卡**、排句子、寫字。老師在**監看牆**看全班的進度，可以**協助**、**鎖定**、**推送**新的一頁，也可以投影某位學生的白板。下課後匯出作品，白板課結束 14 天後自動刪除。

## 開始前必讀

- `AGENTS.md`：這個 Next.js（16.x）跟訓練資料裡的版本不同，寫程式前先讀 `node_modules/next/dist/docs/`。特別注意：**Middleware 已改名為 Proxy（`proxy.ts`）**，登入檢查要照 `01-app/02-guides/authentication.md` 的做法：Proxy 只做樂觀檢查，真正的權限檢查放在 Data Access Layer。
- `.claude/skills/import-template-conventions`：Excel 匯入（學生名單、詞卡）和範本都要照這份規範。範本裡需要選擇的欄位一律做成下拉選單。
- tldraw 目前是 **5.5.x**，`@tldraw/sync-core` 版本相同。API 一律以 tldraw.dev 上 5.x 的文件為準，不要憑記憶寫。

## 架構

```
┌──────────── Next.js 網站（原本的部署平台）────────────┐
│ 老師頁面（必須登入）            學生頁面（免登入）       │
│  /login                         /join/[code]          │
│  /whiteboard          教案列表   只有學生自己的白板      │
│  /whiteboard/plans/[id]  編輯器  沒有側欄和其他功能      │
│  /whiteboard/classes  班級                              │
│  /whiteboard/runs/[id]  監看牆                          │
│  Server Actions：建立白板課、改變階段、發「入場券」      │
└──────┬───────────────────────────────┬─────────────────┘
       │ Supabase JS（RLS）             │ WebSocket + 入場券
┌──────▼──────────┐             ┌──────▼──────────────────────────────┐
│ Supabase        │             │ Cloudflare Worker（tldraw sync）     │
│ Auth（Google、   │             │  BoardRunDO：一堂白板課一個           │
│ 帳號密碼）        │             │   階段、名單、裝置、推送過的頁、       │
│ Postgres：       │             │   鎖定、縮圖、最後活動時間             │
│  班級、學生名單、 │             │  StudentBoardDO：一位學生一個         │
│  白板教案、       │             │   TLSocketRoom + SQLite 儲存         │
│  白板課列表       │             │  R2：白板課裡的圖片                   │
│ Storage：教案圖片 │             │  Alarm：結束 14 天後自刪               │
└─────────────────┘             └─────────────────────────────────────┘
```

**入場券（ticket）**：Next.js 和 Worker 共用一把密鑰（`BOARD_TICKET_SECRET`），用 HMAC 簽一張短效的 JSON 憑證，內容是 `{ runId, role: "teacher" | "student" | "projector", studentId?, deviceId?, exp }`。Worker 只需要驗證入場券，**不必連到 Supabase**，兩邊的耦合因此降到最低。
- 老師：在已登入的 Server Action 裡確認「這堂白板課是我的」，再簽發入場券。
- 學生：`/join/[code]` 向 Worker 要名單，選好名字後由 Worker 的 BoardRunDO 簽發入場券，並記下 deviceId（裝置 ID 存在學生的 localStorage）。

### 程式命名對照

| 名詞 | 程式命名 |
| --- | --- |
| 白板教案 | `BoardPlan`／`board_plans` |
| 白板課 | `BoardRun`／`board_runs`（教案的一次「執行」） |
| 學生白板 | `StudentBoard` |
| 班級 | `ClassGroup`／`class_groups` |
| 學生名單 | `class_students` |
| 監看牆 | `TeacherWall` |
| 華語詞卡 | `HanziCardShape`（tldraw shape type `hanzi-card`） |
| 固定／可拖曳／可編輯 | `shape.meta.access = "fixed" \| "draggable" \| "editable"` |

不要用 `Lesson`：`lib/lessons.ts` 已經是圈圈叉叉的題庫。

---

## 第 0 步：事前準備（老師本人）

- [ ] 到 tldraw.dev 申請 **Hobby 授權**，拿到 license key。確認是否需要顯示浮水印。
- [ ] 註冊 Cloudflare 帳號，Workers 和 Durable Objects（SQLite）、R2 都要能用。
- [ ] 建立 Supabase 專案，在 Google Cloud 建立 OAuth 用戶端，設定 Google 登入。
- [ ] 確認網站目前部署在哪個平台，並設定環境變數：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`BOARD_TICKET_SECRET`、`NEXT_PUBLIC_BOARD_WORKER_URL`、`NEXT_PUBLIC_TLDRAW_LICENSE_KEY`。

## 第 1 步：先做技術驗證（spike），一到兩天

**下面四件事有任何一項做不到，都會影響後面的設計，所以要最先確認。** 做法是另開分支、寫一頁丟棄式的頁面，在單機的 tldraw 上驗證（還不需要同步）：

1. **華語詞卡**：寫一個自訂 shape，用 `HTMLContainer` 顯示文字，套用 `lib/fonts.ts` 的注音字型，拼音用 `lib/hanzi.ts` 加上 ruby 標註，破音字用 `lib/zhuyin.ts` 的 `applyReadings` 處理。要在 iPad Safari 上確認顯示正常、可以編輯。
2. **匯出 PNG**：用 tldraw 的圖片匯出 API 把整頁匯出成 PNG，確認**注音字型（來自 Google Fonts）有沒有被嵌進圖片**。如果沒有，要改成自己提供字型檔，或者自己實作詞卡的 `toSvg`。
3. **可拖曳但不能改**：用 `editor.sideEffects` 的 before-change／before-delete handler，擋下 `access` 為 `draggable` 的物件被修改文字或刪除，同時允許修改位置。固定的物件用 tldraw 內建的 locked，並把學生介面上的「解鎖」選項拿掉。
4. **iPad 操作**：確認雙指縮放、拖曳詞卡、中文輸入法打字都正常。

另外要順便讀 `TLRecordAuthorizers` 的文件（`authorizeRecord` 搭配 SessionMeta）。如果伺服器端可以低成本擋下對 `fixed` 和 `draggable` 物件的修改，就回頭修改 ADR 0004。

**完成條件**：四項都有結論，寫在這份文件最下面的「驗證紀錄」。

## 第 2 步：老師登入

- 安裝 `@supabase/supabase-js` 和 `@supabase/ssr`（照 Supabase 的 Next.js SSR 指南，用 cookie 存 session）。
- 新增 `proxy.ts`：沒有登入的人導向 `/login`。**排除** `/login`、`/auth/callback`、`/join/*`、`/_next/*`、`/fonts/*`、`/sounds/*` 和靜態檔。
- 新增 `lib/supabase/`（server／browser client）和 `lib/dal.ts`（`verifyTeacher()`）。Server Action 和 Server Component 都要經過 DAL 檢查，不能只靠 Proxy。
- `/login` 頁面：Google 登入，以及 Email 加密碼登入（含註冊和忘記密碼）。
- 側欄加上登出按鈕。
- **影響**：現有的遊戲上線後都要登入才能使用（ADR 0002）。localStorage 和 IndexedDB 裡的資料不受影響。
- **完成條件**：沒登入就看不到任何遊戲頁面；登入後一切跟原本一樣；`/join/xxx` 不需要登入。

## 第 3 步：班級與學生名單

- 資料表 `class_groups(id, teacher_id, name, created_at)`、`class_students(id, class_group_id, name, sort)`，RLS 設定為只有本人看得到。
- `/whiteboard/classes`：新增、改名、刪除班級。名單用 Excel 匯入，直接沿用 `lib/draw.ts` 的 `parseNames` 和 `downloadNamesTemplate`；也可以手動新增或刪除學生。
- **完成條件**：換一台電腦登入，看得到同樣的班級和名單。

## 第 4 步：白板教案編輯器

- 資料表 `board_plans(id, teacher_id, title, default_font, snapshot jsonb, updated_at)`。教案圖片放在 Supabase Storage 的 `plan-assets` bucket（路徑要難以猜測，學生要能讀取）。
- `/whiteboard`：教案列表，可以新增、複製、刪除、改名。
- `/whiteboard/plans/[id]`：tldraw 編輯器（單機版，不同步），自動存檔（debounce）到 `snapshot`。
  - 支援多頁，使用 tldraw 內建的頁面功能。
  - 「華語詞卡」工具：把第 1 步的 spike 做成正式版，可以選字型，預設用教案的 `default_font`。
  - 選取物件時，工具列可以切換「固定、可拖曳、可編輯」。預設值：文字和圖片是固定，華語詞卡是可拖曳。
  - 圖片：用 `lib/images.ts` 的 `shrinkImage` 壓小後上傳到 Storage（自訂 `TLAssetStore`）。
  - **Excel 匯入詞卡**：照 import-template-conventions 規範，「詞卡」工作表每列一張，字型欄位用下拉選單，破音字寫成 `長[ㄓㄤˇ]`，匯入後自動排列在目前這一頁。要附上範本下載。
  - **匯出、匯入教案檔案**：JSON 快照加上圖片，打包成 zip（用現有的 fflate）。這個功能同時用來備份，以及跟其他老師交換教案。
- **完成條件**：在家做的教案到學校打得開，內容一樣；詞卡的注音和拼音正確。

## 第 5 步：同步伺服器（Cloudflare Worker）

- 新增 `whiteboard-worker/` 資料夾（獨立的 `package.json` 和 `wrangler.toml`），以官方的 `tldraw/tldraw-sync-cloudflare` 範本為基礎。
- **StudentBoardDO**：每位學生一個 TLSocketRoom，使用 SQLite 儲存。
  - 第一次建立時，載入 BoardRunDO 提供的「目前版本」（教案快照加上所有推送過的頁）。
  - 連線時驗證入場券。老師可以進每一張學生白板；學生只能進自己的。投影用的連線是唯讀的。
  - **鎖定**：學生的連線改成 `isReadonly: true`，鎖定時中斷學生連線讓他重新連線。這一項要由伺服器擋下（ADR 0004）。
  - 註冊 `hanzi-card` shape 的 schema，前後端要一致，否則連線會無法通過 schema 驗證。
- **BoardRunDO**：每堂白板課一個。
  - 狀態包含：階段、教案快照（按下「開始」時寫入）、推送過的頁、名單（建立時從 Next 傳入）、`studentId → deviceId`、等待接手的請求、鎖定狀態、每位學生的縮圖和最後活動時間。
  - HTTP API（Next 用入場券或伺服器密鑰呼叫）：`start`、`end`、`push(page, target)`、`copyPage(from, to)`、`lock(target)`、`approveTakeover`、`roster`、`join`、`thumbs`。
  - 推送和複製：對目標的 StudentBoardDO 呼叫更新，加入新的一頁（不覆蓋任何內容），同時寫進「推送過的頁」，讓之後加入的學生也拿得到。
  - **Alarm**：結束 14 天後刪除自己、所有 StudentBoardDO 的資料，以及 R2 上這堂課的圖片（前綴是 `runs/{runId}/`）。
- 圖片上傳和下載沿用範本的 `assetUploads.ts`，路徑改為 `runs/{runId}/…`。第一版只有老師能上傳（Q13）。
- **完成條件**：本機 `wrangler dev` 下，兩個瀏覽器能即時同步同一張學生白板；鎖定時學生確實改不了；推送後，之後才加入的學生也拿得到。

## 第 6 步：白板課（老師端）與學生頁面

- 資料表 `board_runs(id, teacher_id, plan_id, class_group_id, join_code, status, created_at, started_at, ended_at)`，這是給「我的白板課」列表用的。即時狀態以 BoardRunDO 為準。
- `/whiteboard/runs`：依階段分類列出白板課。建立時選教案和班級，產生短代碼的學生連結（可以提前建立，Q20）。
- 「開始」：Server Action 讀取教案**當下的**快照（Q22），交給 BoardRunDO，並更新 `status`。
- `/join/[code]`（**不經過 Proxy 登入檢查，不使用網站的 layout**，要另外做一個極簡的 layout，沒有側欄、沒有歡迎視窗）：
  - 尚未開始：顯示「等老師開始」，自動輪詢。
  - 從名單點選名字；名單以外的學生可以輸入名字加入。
  - 名字已經被其他裝置使用時，顯示「請找老師」，等老師按允許（接手）。
  - 進入後是 tldraw，只有學生需要的工具：選取、移動、華語詞卡（學生打字也用這個，自動套用教案字型）、畫筆、橡皮擦、換頁、縮放。不提供圖片上傳。
  - 學生端每次有修改時，debounce 5 秒，產生一張小縮圖上傳到 BoardRunDO。
- **完成條件**：iPad 用學生連結加入，看到教案內容；遲到的學生也拿得到推送過的頁；換裝置時需要老師允許。

## 第 7 步：監看牆

- `/whiteboard/runs/[id]`：每 5 秒向 BoardRunDO 讀取縮圖和狀態（Q17）。
  - 每張卡片顯示：名字、在線狀態、縮圖、最後活動時間。超過 3 分鐘沒有動作就加上「閒置」標示。
  - 按鈕：協助（全螢幕打開該學生白板，可以編輯，學生看得到老師游標）、鎖定或解鎖、投影（另開唯讀的全螢幕視窗）、複製一頁給……（選一位學生）。
  - 全班操作：推送一頁（從教案選一頁，或空白頁）、全部鎖定或解鎖、結束白板課。
  - 等待接手的請求，以通知的形式顯示在最上方。
- **匯出全班作品**：逐一連線到每張學生白板（唯讀），把每一頁匯出成 PNG，用 fflate 打包成 `班級-日期.zip`，檔名是「學生名-第N頁.png」（Q18）。
- **完成條件**：一個班 40 人同時在線時，監看牆仍然順暢；匯出的 PNG 裡注音顯示正確。

## 第 8 步：清除與收尾

- Supabase：每天用 pg_cron 刪除 `ended_at` 超過 14 天的 `board_runs` 資料。Worker 那一邊由 Alarm 自行清除，兩邊各自負責，互不呼叫。
- 更新 `README.md`（白板功能說明、學生加入流程）、`CODEBASE.md`（新增後端、Worker、資料表）、`AGENTS.md`（如果需要），以及側欄的「白板」入口。
- **注意**：「清除所有遊戲設定」不會清除白板資料，因為白板資料存在雲端，不在瀏覽器裡。

---

## 已知風險

| 風險 | 處理方式 |
| --- | --- |
| 匯出 PNG 時注音字型沒有嵌入 | 第 1 步先驗證；必要時改用自己提供的字型檔 |
| Supabase 免費專案閒置會被暫停 | 上線前評估使用量，必要時升級付費方案 |
| tldraw Hobby 授權條件不適用 | 第 0 步就要確認；不行的話，要評估商業授權或改用 Excalidraw（重新開 ADR） |
| 40 位學生同時產生縮圖，iPad 效能吃不消 | 縮圖解析度要很低，debounce 5 秒；必要時改成只在換頁或閒置時產生 |
| 學生繞過「固定／可拖曳」的限制 | 已接受（ADR 0004）；第 1 步評估 `authorizeRecord` |

## 第二版以後（不在這次範圍）

學生貼圖片（自動壓縮，每張學生白板有總量上限）、老師控制學生能看到第幾頁、作品匯出 PDF、白板教案分享連結、伺服器端檢查固定和可拖曳、詳細的活動紀錄。

## 驗證紀錄

（第 1 步完成後填寫）
