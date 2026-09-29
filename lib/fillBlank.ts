// 填空: words picked in the lesson text become blanks on the board and word cards to drag into them.
// A blank is all the runs with the same `blank` number (see lib/readAloud.ts); it may be in more than one font.

import type { FontId } from "./fonts";
import { type Run, changeRange, mergeRuns, plainText, snapRange } from "./readAloud";
import { visibleLength } from "./zhuyin";

export type Blank = { id: number; runs: Run[]; answer: string };

// The blanks in the order they are in the text.
export function blanksOf(runs: Run[]): Blank[] {
  const byId = new Map<number, Blank>();
  for (const r of runs) {
    if (r.blank === undefined) continue;
    const b = byId.get(r.blank) ?? { id: r.blank, runs: [], answer: "" };
    b.runs.push(r);
    b.answer += r.text;
    byId.set(r.blank, b);
  }
  return [...byId.values()];
}

// The blanks from start to end; with just the cursor (start === end), the blank it is in or next to.
function blanksAt(runs: Run[], start: number, end: number): Set<number> {
  const spans = new Map<number, { from: number; to: number }>();
  let at = 0;
  for (const r of runs) {
    const from = at;
    at += r.text.length;
    if (r.blank !== undefined) spans.set(r.blank, { from: spans.get(r.blank)?.from ?? from, to: at });
  }
  const out = new Set<number>();
  for (const [id, { from, to }] of spans) {
    if (start === end ? from <= start && start <= to : from < end && start < to) out.add(id);
  }
  return out;
}

export const touchesBlank = (runs: Run[], start: number, end: number) => blanksAt(runs, start, end).size > 0;

// 挖空: the selected words become a blank. If the selection (or the cursor) is on a blank, that blank is undone instead.
// Returns the new runs, or an error for the teacher.
export function toggleBlank(runs: Run[], start: number, end: number): Run[] | { error: string } {
  const undo = blanksAt(runs, start, end);
  if (undo.size > 0) {
    return mergeRuns(runs.map((r) => (r.blank !== undefined && undo.has(r.blank) ? { text: r.text, font: r.font } : r)));
  }
  const text = plainText(runs);
  // Spaces around the words stay out of the blank.
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  [start, end] = snapRange(text, start, end);
  if (start >= end) return { error: "先選取要挖空的字詞。" };
  if (text.slice(start, end).includes("\n")) return { error: "挖空的字詞不能跨行，請一行一行分開選。" };
  const id = Math.max(0, ...runs.map((r) => r.blank ?? 0)) + 1;
  return changeRange(runs, start, end, (r) => ({ ...r, blank: id }));
}

// About how many em a word takes on the board: 注音 sits beside each character, 拼音 is wider than the character.
const EM_PER_CHAR: Record<FontId, number> = {
  plain: 1,
  hans: 1,
  "bpmf-kai": 1.45,
  "bpmf-huninn": 1.45,
  "bpmf-iansui": 1.45,
  "zhuyin-only": 1.3,
  "hans-pinyin": 1.6,
  "pinyin-only": 2.2,
};

const widthOf = (b: Blank) => b.runs.reduce((sum, r) => sum + visibleLength(r.text) * EM_PER_CHAR[r.font], 0);

// All blanks are as wide as the longest answer, so their size doesn't give the answer away.
export const slotWidth = (blanks: Blank[]) => Math.max(1.5, ...blanks.map(widthOf));

// The card ids in a random order, not left in the order of the text when there is more than one card.
export function shuffle(ids: number[]): number[] {
  for (let tries = 0; tries < 10; tries++) {
    const out = [...ids];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.length < 2 || out.some((id, i) => id !== ids[i])) return out;
  }
  return [...ids].reverse();
}
