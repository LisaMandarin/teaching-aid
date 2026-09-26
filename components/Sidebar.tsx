"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const games = [
  { href: "/", name: "Hangman 吊人遊戲" },
  { href: "/tic-tac-toe", name: "Tic-Tac-Toe 圈圈叉叉" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

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
                <Link
                  href={g.href}
                  className={`sidebar-item ${pathname === g.href ? "is-active" : ""}`}
                  aria-current={pathname === g.href ? "page" : undefined}
                >
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
}
