"use client";

import Link from "next/link";
import { useState } from "react";
import { games, PICKS_KEY, savePicks, tools, usePicks, type Activity } from "@/lib/activities";
import { clearPhotos } from "@/lib/camera";
import StorageNotice from "./StorageNotice";

// Everything a teacher sets up for one class (and 立可拍's photos); sounds, fonts and uploaded materials stay.
const CLASS_DATA_KEYS = [
  PICKS_KEY,
  "tictactoe-setup",
  "gifts-setup",
  "read-aloud",
  "fill-blank",
  "quick-check",
  "whats-missing",
  "instant-camera",
  "slot-machine",
  "rock-paper-scissors",
  "card-draw",
  "draw-list",
  "rewards-roster",
];

async function clearClassData() {
  if (!confirm("確定要清除所有遊戲設定嗎？\n\n包含本堂課勾選的遊戲和工具，圈圈叉叉、開禮物、唸課文、填空、快判卡、少了什麼、拉霸機、抽牌的內容，剪刀石頭布的隊名和分數，立可拍的照片和文字，以及抽籤名單和我的獎勵。教材不會被刪除。")) return;
  for (;;) {
    const failed: string[] = [];
    try {
      // `:broken` holds saved data a game couldn't read; it's class data too.
      CLASS_DATA_KEYS.forEach((key) => {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}:broken`);
      });
    } catch {
      failed.push("遊戲設定");
    }
    try {
      await clearPhotos();
    } catch {
      failed.push("立可拍的照片");
    }
    if (failed.length === 0) break;
    if (!confirm(`${failed.join("和")}沒有清除成功。要再試一次嗎？\n\n如果一直失敗，請關掉其他開著這個網站的分頁再試。`)) break;
  }
  // Every game is kept mounted, so reload to make them all start empty (and show what's left if something failed).
  location.reload();
}

// The teacher ticks what this class will use; the sidebar only changes once they confirm.
export default function Home() {
  const picks = usePicks();
  // null until the teacher changes something, so it follows the saved picks.
  const [draft, setDraft] = useState<string[] | null>(null);
  const [full, setFull] = useState(false);
  const [seenPicks, setSeenPicks] = useState(picks);
  // The sidebar's drag or another tab changed the picks: keep only what the teacher ticked or unticked here,
  // so 確定 doesn't undo that change.
  if (picks !== seenPicks) {
    setSeenPicks(picks);
    if (draft) {
      const kept = picks.filter((h) => draft.includes(h) || !seenPicks.includes(h));
      setDraft([...kept, ...draft.filter((h) => !seenPicks.includes(h) && !kept.includes(h))]);
    }
  }
  const checked = draft ?? picks;
  const changed = draft !== null && draft.join() !== picks.join();

  const toggle = (href: string) =>
    setDraft(checked.includes(href) ? checked.filter((h) => h !== href) : [...checked, href]);

  const confirmPicks = () => {
    setFull(!savePicks(checked));
    setDraft(null);
  };

  const section = (title: string, list: Activity[]) => (
    <section className="home-section">
      <h2 className="tape-label">{title}</h2>
      <ul className="home-grid">
        {list.map((a) => {
          const order = checked.indexOf(a.href) + 1;
          return (
            <li key={a.href} className={`home-card ${order > 0 ? "is-checked" : ""}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={order > 0}
                aria-label={a.zh}
                className="home-card-pick"
                onClick={() => toggle(a.href)}
              >
                <span className="home-card-box" aria-hidden="true">
                  {order > 0 && "✓"}
                </span>
                {order > 0 && <span className="home-card-order">{order}</span>}
              </button>
              {/* The same toggle for the mouse; the checkbox beside it is the keyboard's way in. */}
              <div className="home-card-name" onClick={() => toggle(a.href)}>
                <span className="home-card-zh">{a.zh}</span>
                {a.en && <span className="home-card-en">{a.en}</span>}
              </div>
              <Link href={a.href} className="home-card-open" title="開啟" aria-label={`開啟 ${a.zh}`}>
                →
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="game home">
      <header className="page-header">
        <div>
          <h1 className="page-title">本堂課要用哪些遊戲和工具？</h1>
          <p className="home-hint">勾選後按「確定」，就會放在左側欄，可以拖曳調整順序。按左上角的「教學便利通」可以回到這一頁。</p>
        </div>
      </header>

      <StorageNotice
        full={full}
        fullText="這次勾選的項目沒有存起來，重新整理後會不見。"
        broken={false}
        onCloseBroken={() => {}}
      />

      {section("遊戲", games)}
      {section("工具", tools)}

      <div className="home-actions paper">
        <p role="status">
          已勾選 {checked.length} 項{!changed && picks.length > 0 && "，已放在左側欄"}
        </p>
        <button type="button" className="btn-board btn-board--sm home-confirm" onClick={confirmPicks} disabled={!changed}>
          確定
        </button>
      </div>

      <button type="button" className="home-clear" onClick={clearClassData}>
        🧹 清除所有遊戲設定
      </button>
    </div>
  );
}
