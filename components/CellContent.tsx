"use client";

// A board cell's picture and text, shared by the games that show 注音 text (圈圈叉叉, 開禮物).
// Text sizes are in cqmin, so the cell's container needs `container-type: size`.

import { useEffect, useState } from "react";
import { type FontId, isHans } from "@/lib/fonts";
import { type Hanzi, type Piece, hanziIfLoaded, loadHanzi } from "@/lib/hanzi";
import type { Cell } from "@/lib/lessons";
import { visibleLength } from "@/lib/zhuyin";

// The 簡體／拼音 converter when the font needs it; null while it loads (the text shows as typed until then).
export function useHanzi(font: FontId): Hanzi | null {
  const [hanzi, setHanzi] = useState(hanziIfLoaded);
  const needed = isHans(font);
  useEffect(() => {
    if (needed && !hanzi) void loadHanzi().then(setHanzi);
  }, [needed, hanzi]);
  return needed ? hanzi : null;
}

// 只有漢語拼音: one syllable per character, with a space between syllables: "🍬 táng guǒ".
export function pinyinLine(pieces: Piece[]): string {
  let out = "";
  pieces.forEach((p, i) => {
    if (p.pinyin === undefined) out += p.text;
    else out += (pieces[i - 1]?.pinyin !== undefined ? " " : "") + p.pinyin;
  });
  return out;
}

// The board text in the chosen font: as typed, in 簡體, 簡體 with 拼音 above, or 拼音 only.
export function BoardText({ text, font, hanzi }: { text: string; font: FontId; hanzi: Hanzi | null }) {
  if (!hanzi) return text;
  const pieces = hanzi.convert(text);
  if (font === "pinyin-only") return pinyinLine(pieces);
  if (font === "hans") return <span lang="zh-Hans">{pieces.map((p) => p.text).join("")}</span>;
  return (
    <span lang="zh-Hans">
      {pieces.map((p, i) =>
        p.pinyin === undefined ? (
          p.text
        ) : (
          <ruby key={i}>
            {p.text}
            <rt>{p.pinyin}</rt>
          </ruby>
        ),
      )}
    </span>
  );
}

// Longer text gets a smaller font so it still fits the square.
export function textSize(text: string, withImage: boolean): string {
  if (withImage) return "is-caption";
  const len = visibleLength(text);
  if (len <= 1) return "is-xl";
  if (len <= 2) return "is-large";
  if (len <= 4) return "is-medium";
  return "is-small";
}

// Shows a warning with the file name when the image can't be loaded (wrong name, not shared, …).
export function CellImage({ cell }: { cell: Cell }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="ttt-img-missing">
        ⚠️ 找不到圖片
        {cell.imageName && <small>{cell.imageName}</small>}
      </span>
    );
  // Google Drive refuses images requested with another site as the referrer.
  return <img src={cell.image!} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
