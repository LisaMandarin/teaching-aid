"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LINE_QR, LINE_URL } from "@/lib/line";
import { selectMaterial, useMaterials } from "@/lib/materials";

const games = [
  { href: "/", name: "Hangman 吊人遊戲" },
  { href: "/tic-tac-toe", name: "Tic-Tac-Toe 圈圈叉叉" },
  { href: "/gifts", name: "Mystery Gift 開禮物" },
  { href: "/read-aloud", name: "Read Aloud 唸課文" },
  { href: "/fill-blank", name: "Fill in the Blanks 填空" },
  { href: "/quick-check", name: "Quick Check 快判卡" },
];

// Everything a teacher sets up for one class; sounds, fonts and uploaded materials stay.
const CLASS_DATA_KEYS = ["tictactoe-setup", "gifts-setup", "read-aloud", "fill-blank", "quick-check", "draw-list", "rewards-roster"];

function clearClassData() {
  if (!confirm("確定要清除所有遊戲設定嗎？\n\n包含圈圈叉叉、開禮物、唸課文、填空的內容，以及抽籤名單和我的獎勵。教材不會被刪除。")) return;
  try {
    CLASS_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {}
  // Every game is kept mounted, so reload to make them all start empty.
  location.reload();
}

const tools = [
  { href: "/rewards", name: "我的獎勵" },
  { href: "/draw", name: "抽籤筒" },
  { href: "/image-resizer", name: "圖片瘦身" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const pathname = usePathname();
  const { items, selectedId } = useMaterials();
  const onMaterials = pathname === "/materials";

  const item = (active: boolean) => ({
    className: "nav-card",
    "aria-current": active ? ("page" as const) : undefined,
  });

  // A paper card pinned to the cork board.
  const card = (label: React.ReactNode) => (
    <>
      <span className="pin" aria-hidden="true" />
      <span className="nav-card-text">{label}</span>
    </>
  );

  // Clickable tape-label that expands/collapses the section below it.
  const sectionTitle = (label: string, sectionOpen: boolean, toggle: () => void) => (
    <button
      type="button"
      className="sidebar-title tape-label sidebar-title-toggle"
      onClick={toggle}
      aria-expanded={sectionOpen}
    >
      {label}
      <span className={`sidebar-title-arrow ${sectionOpen ? "is-open" : ""}`} aria-hidden="true">
        ▾
      </span>
    </button>
  );

  return (
    <aside className={`sidebar cork cork--sidebar ${open ? "is-open" : "is-closed"}`}>
      <div className="sidebar-head">
        {open && (
          <p className="sidebar-logo paper">
            <svg className="sidebar-logo-icon" viewBox="0 0 32 26" aria-hidden="true">
              <rect x="1" y="1" width="30" height="20" rx="2" className="logo-frame" />
              <rect x="4" y="4" width="24" height="14" className="logo-board" />
              <path d="M8 9 q3 -3 6 0 t6 0" className="logo-chalk" />
              <rect x="6" y="21" width="20" height="3" rx="1" className="logo-frame" />
            </svg>
            教學便利通
          </p>
        )}
        <button
          className="sidebar-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "收合側欄" : "展開側欄"}
          aria-expanded={open}
        >
          {open ? "«" : "»"}
        </button>
      </div>
      {open && (
        <nav>
          {sectionTitle("遊戲", gamesOpen, () => setGamesOpen((o) => !o))}
          {gamesOpen && (
            <ul>
              {games.map((g) => (
                <li key={g.href}>
                  <Link href={g.href} {...item(pathname === g.href)}>
                    {card(g.name)}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="sidebar-title tape-label">教材</h2>
          <ul>
            {items.map((m) => (
              <li key={m.id}>
                <Link
                  href="/materials"
                  onClick={() => selectMaterial(m.id)}
                  title={m.name}
                  {...item(onMaterials && selectedId === m.id)}
                >
                  {card(`${m.kind === "pdf" ? "📄" : "🖼️"} ${m.name}`)}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/materials" onClick={() => selectMaterial(null)} {...item(onMaterials && selectedId === null)}>
                {card("＋ 上傳教材")}
              </Link>
            </li>
          </ul>

          {sectionTitle("工具", toolsOpen, () => setToolsOpen((o) => !o))}
          {toolsOpen && (
            <ul>
              {tools.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} {...item(pathname === t.href)}>
                    {card(t.name)}
                  </Link>
                </li>
              ))}
              <li>
                <button type="button" className="nav-card nav-card-button" onClick={clearClassData}>
                  {card("🧹 清除所有遊戲設定")}
                </button>
              </li>
            </ul>
          )}
        </nav>
      )}
      {open && (
        <a className="sidebar-line paper" href={LINE_URL} target="_blank" rel="noopener noreferrer">
          <span className="tape" aria-hidden="true" />
          <img src={LINE_QR} alt="LINE 官方帳號 QR code" width={64} height={64} />
          <span>
            加入 LINE 官方帳號
            <br />
            <small>網址異動時通知您</small>
          </span>
        </a>
      )}
    </aside>
  );
}
