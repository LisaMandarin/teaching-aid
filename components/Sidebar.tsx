"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { selectMaterial, useMaterials } from "@/lib/materials";

const games = [
  { href: "/", name: "Hangman 吊人遊戲" },
  { href: "/tic-tac-toe", name: "Tic-Tac-Toe 圈圈叉叉" },
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
        </nav>
      )}
    </aside>
  );
}
