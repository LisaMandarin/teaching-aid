// Every game and tool on the home page, and the ones the teacher picked for this class (shown in the sidebar).

import { useSyncExternalStore } from "react";
import { isStringArray, keepBroken, readSaved, writeSaved } from "./storage";

export type Activity = { href: string; zh: string; en?: string };

export const games: Activity[] = [
  { href: "/hangman", zh: "吊人遊戲", en: "Hangman" },
  { href: "/tic-tac-toe", zh: "圈圈叉叉", en: "Tic-Tac-Toe" },
  { href: "/gifts", zh: "開禮物", en: "Mystery Gift" },
  { href: "/read-aloud", zh: "唸課文", en: "Read Aloud" },
  { href: "/fill-blank", zh: "填空", en: "Fill in the Blanks" },
  { href: "/quick-check", zh: "快判卡", en: "Quick Check" },
  { href: "/whats-missing", zh: "少了什麼", en: "What is Missing?" },
  { href: "/instant-camera", zh: "立可拍", en: "Instant Camera" },
  { href: "/slot-machine", zh: "拉霸機", en: "Slot Machine" },
  { href: "/rock-paper-scissors", zh: "剪刀石頭布", en: "Rock Paper Scissors" },
  { href: "/cards", zh: "抽牌", en: "Draw a Card" },
];

export const tools: Activity[] = [
  { href: "/rewards", zh: "我的獎勵" },
  { href: "/draw", zh: "抽籤筒" },
  { href: "/image-resizer", zh: "圖片瘦身" },
];

export const activities = [...games, ...tools];

export const PICKS_KEY = "class-picks";

const NONE: string[] = [];

let picks: string[] | null = null;
const listeners = new Set<() => void>();

// Another tab confirmed new picks, or cleared everything (key null). Without this, saving here would undo them.
function onStorage(e: StorageEvent) {
  if (e.key !== PICKS_KEY && e.key !== null) return;
  picks = null;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function load() {
  if (picks === null) {
    const { value } = readSaved(PICKS_KEY);
    if (value !== null && !isStringArray(value)) keepBroken(PICKS_KEY);
    picks = isStringArray(value) ? [...new Set(value)].filter((href) => activities.some((a) => a.href === href)) : NONE;
  }
  return picks;
}

export function usePicks() {
  return useSyncExternalStore(subscribe, load, () => NONE);
}

// In the order they were ticked, which is the sidebar's order.
// False when the browser refused to save: the picks then last until reload.
export function savePicks(next: string[]) {
  picks = next;
  listeners.forEach((l) => l());
  return writeSaved(PICKS_KEY, next);
}
