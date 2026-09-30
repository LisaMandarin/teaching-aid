"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import FillBlank from "./FillBlank";
import GiftBoxes from "./GiftBoxes";
import Hangman from "./Hangman";
import ImageResizer from "./ImageResizer";
import Materials from "./Materials";
import NameDraw from "./NameDraw";
import QuickCheck from "./QuickCheck";
import ReadAloud from "./ReadAloud";
import Rewards from "./Rewards";
import TicTacToe from "./TicTacToe";

const views = [
  { href: "/", fill: false, render: () => <Hangman /> },
  { href: "/tic-tac-toe", fill: false, render: () => <TicTacToe /> },
  { href: "/gifts", fill: true, render: () => <GiftBoxes /> },
  { href: "/read-aloud", fill: true, render: () => <ReadAloud /> },
  { href: "/fill-blank", fill: true, render: () => <FillBlank /> },
  { href: "/quick-check", fill: true, render: () => <QuickCheck /> },
  { href: "/materials", fill: true, render: () => <Materials /> },
  { href: "/image-resizer", fill: true, render: () => <ImageResizer /> },
  { href: "/rewards", fill: true, render: () => <Rewards /> },
  { href: "/draw", fill: true, render: () => <NameDraw /> },
];

// Keeps every opened view mounted and only hides the inactive ones, so a teacher can jump
// from a game to the materials and back without losing the game in progress.
export default function Workspace() {
  const pathname = usePathname();
  const [visited, setVisited] = useState<string[]>([pathname]);
  if (!visited.includes(pathname) && views.some((v) => v.href === pathname)) {
    setVisited([...visited, pathname]);
  }

  return views
    .filter((v) => visited.includes(v.href))
    .map((v) => (
      <div key={v.href} className={`view ${v.fill ? "is-fill" : ""}`} hidden={v.href !== pathname}>
        {v.render()}
      </div>
    ));
}
