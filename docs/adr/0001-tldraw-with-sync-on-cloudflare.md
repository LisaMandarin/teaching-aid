# 互動白板用 tldraw，同步伺服器用 tldraw sync 架在 Cloudflare

網站其他功能都只在瀏覽器裡運作，但互動白板需要老師和學生即時同步，所以這是網站第一個需要伺服器的功能。我們選用 tldraw 當白板，同步用 tldraw 官方的 sync，架在 Cloudflare Workers 上：每張學生白板是一個 Durable Object，圖片存放在 R2。網站本身維持原本的部署方式。

## Considered Options

- **自己寫白板**（雛形就是這樣做的）：可以驗證「每人一張白板、老師看全部」的模型，但圖片、複製貼上、平板縮放都要重寫，成本太高。
- **Excalidraw**：MIT 授權，免費。但文字是畫在 canvas 上，很難接上 bpmfvs 注音字型和拼音標註。
- **Liveblocks**：完全託管，最省事。但不是 tldraw 官方的同步方式，連線數超過免費額度就要付費。
- **Canva**：學生要有 Canva 帳號，老師也要到 Canva 才能看學生作品，用不到網站的注音和拼音功能。

## Consequences

- tldraw 正式上線需要授權金鑰。網站目前免費、非營利，所以先申請 Hobby 授權；如果將來要營利，就要改用商業授權。
- 開發時要多管理一個 Cloudflare 帳號，以及一個獨立部署的 Worker。
