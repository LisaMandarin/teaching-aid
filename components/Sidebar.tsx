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
];

const tools = [
  { href: "/rewards", name: "我的獎勵" },
  { href: "/draw", name: "抽籤筒" },
  { href: "/image-resizer", name: "圖片瘦身" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const { items, selectedId } = useMaterials();
  const onMaterials = pathname === "/materials";

  const item = (active: boolean) => ({
    className: `sidebar-item ${active ? "is-active" : ""}`,
    "aria-current": active ? ("page" as const) : undefined,
  });

  return (
    <aside className={`sidebar ${open ? "is-open" : "is-closed"}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "收合側欄" : "展開側欄"}
        aria-expanded={open}
      >
        {open ? "«" : "»"}
      </button>
      {open && (
        <nav>
          <h2 className="sidebar-title">遊戲</h2>
          <ul>
            {games.map((g) => (
              <li key={g.href}>
                <Link href={g.href} {...item(pathname === g.href)}>
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>

          <h2 className="sidebar-title">教材</h2>
          <ul>
            {items.map((m) => (
              <li key={m.id}>
                <Link
                  href="/materials"
                  onClick={() => selectMaterial(m.id)}
                  title={m.name}
                  {...item(onMaterials && selectedId === m.id)}
                >
                  {m.kind === "pdf" ? "📄" : "🖼️"} {m.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/materials" onClick={() => selectMaterial(null)} {...item(onMaterials && selectedId === null)}>
                ＋ 上傳教材
              </Link>
            </li>
          </ul>

          <h2 className="sidebar-title">工具</h2>
          <ul>
            {tools.map((t) => (
              <li key={t.href}>
                <Link href={t.href} {...item(pathname === t.href)}>
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {open && (
        <a className="sidebar-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
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
