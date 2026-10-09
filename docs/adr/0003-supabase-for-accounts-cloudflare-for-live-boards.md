# 帳號與資料放 Supabase，即時白板放 Cloudflare

老師登入、班級、學生名單、白板教案和白板課的基本資料都放在 Supabase（Auth + Postgres）；正在上課的學生白板則由 tldraw sync 在 Cloudflare 上即時同步（見 ADR 0001）。所以資料分在兩個地方。tldraw sync 的 Worker 會驗證 Supabase 發給老師的登入憑證，以及學生加入時拿到的學生憑證，再決定誰能進哪一張學生白板。

## Considered Options

- **全部放 Cloudflare**（D1 資料庫 + 自己寫登入）：只要一個平台，但 Google 登入、密碼重設、寄信都要自己做。
- **全部放 Supabase**（用 Supabase Realtime 同步白板）：tldraw 沒有官方支援這種做法，要自己處理衝突合併，這正是選 tldraw sync 想避免的事。

## Consequences

- Supabase 的免費專案一段時間沒有使用會被暫停。網站正式上線前，要確認流量能讓專案保持活躍，否則要考慮付費方案。
- 刪除白板課（包含 14 天到期）時，Supabase 和 Cloudflare 兩邊的資料都要刪乾淨。
