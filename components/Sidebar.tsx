"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { activities, savePicks, usePicks } from "@/lib/activities";
import { LINE_QR, LINE_URL } from "@/lib/line";
import { selectMaterial, useMaterials } from "@/lib/materials";

// Phone width: the open sidebar covers the page instead of squeezing it (see .sidebar in globals.css).
const NARROW = "(max-width: 700px)";
const isNarrow = () => window.matchMedia(NARROW).matches;

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const { items, selectedId } = useMaterials();
  const picks = usePicks();
  // While a 本堂課 card is dragged: which one, and the order it would drop into. Saved only on drop.
  const [dragged, setDragged] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[]>([]);
  const onMaterials = pathname === "/materials";

  // On a phone it starts closed, so the page gets the whole screen.
  useEffect(() => {
    if (isNarrow()) setOpen(false);
  }, []);

  const item = (active: boolean) => ({
    className: "nav-card",
    "aria-current": active ? ("page" as const) : undefined,
  });

  const dragOver = (href: string) => {
    if (dragged === null || href === dragged) return;
    const order = dragOrder.filter((h) => h !== dragged);
    order.splice(dragOrder.indexOf(href), 0, dragged);
    setDragOrder(order);
  };

  // A paper card pinned to the cork board.
  const card = (label: React.ReactNode) => (
    <>
      <span className="pin" aria-hidden="true" />
      <span className="nav-card-text">{label}</span>
    </>
  );

  return (
    <>
      <aside
        className={`sidebar cork cork--sidebar ${open ? "is-open" : "is-closed"}`}
        // On a phone the open sidebar covers the page: tabbing out of it closes it, so the focused control is visible.
        onBlur={(e) => {
          if (open && isNarrow() && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget))
            setOpen(false);
        }}
      >
        <div className="sidebar-head">
          {open && (
            <Link
              href="/"
              className="sidebar-logo paper"
              aria-label="教學便利通，回主頁"
              title="回主頁"
              onClick={() => isNarrow() && setOpen(false)}
            >
              <svg className="sidebar-logo-icon" viewBox="0 0 32 26" aria-hidden="true">
                <rect x="1" y="1" width="30" height="20" rx="2" className="logo-frame" />
                <rect x="4" y="4" width="24" height="14" className="logo-board" />
                <path d="M8 9 q3 -3 6 0 t6 0" className="logo-chalk" />
                <rect x="6" y="21" width="20" height="3" rx="1" className="logo-frame" />
              </svg>
              教學便利通
            </Link>
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
          // On a phone, picking a page closes the sidebar so the page shows.
          <nav onClick={(e) => (e.target as Element).closest("a") && isNarrow() && setOpen(false)}>
            <h2 className="sidebar-title tape-label">本堂課</h2>
            <ul
              // On the list, not the cards: a drop in the gap between two cards counts too.
              onDragOver={(e) => dragged !== null && e.preventDefault()}
              onDrop={(e) => {
                if (dragged === null) return;
                e.preventDefault();
                savePicks(dragOrder);
              }}
            >
              {(dragged === null ? picks : dragOrder)
                .flatMap((href) => activities.filter((a) => a.href === href))
                .map((a) => (
                  <li
                    key={a.href}
                    draggable
                    className={a.href === dragged ? "is-dragged" : undefined}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("application/x-class-pick", a.href);
                      setDragged(a.href);
                      setDragOrder(picks);
                    }}
                    onDragEnter={() => dragOver(a.href)}
                    onDragEnd={() => setDragged(null)}
                  >
                    {/* Not draggable itself, so the drag moves the card instead of carrying the link's address. */}
                    <Link href={a.href} draggable={false} {...item(pathname === a.href)}>
                      {card(a.en ? `${a.en} ${a.zh}` : a.zh)}
                    </Link>
                  </li>
                ))}
              {picks.length === 0 && (
                <li>
                  <Link href="/" {...item(pathname === "/")}>
                    {card("＋ 選遊戲和工具")}
                  </Link>
                </li>
              )}
            </ul>

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
      {/* Phone width only (hidden otherwise): tapping the page beside the open sidebar closes it. */}
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}
