"use client";

import { useState } from "react";

const games = [{ id: "hangman", name: "Hangman 吊人遊戲" }];

export default function Sidebar() {
  const [open, setOpen] = useState(true);

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
              <li key={g.id} className="sidebar-item is-active">
                {g.name}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
}
