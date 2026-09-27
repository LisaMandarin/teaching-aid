"use client";

// A board cell's picture and text, shared by the games that show 注音 text (圈圈叉叉, 開禮物).
// Text sizes are in cqmin, so the cell's container needs `container-type: size`.

import { useState } from "react";
import type { Cell } from "@/lib/lessons";
import { visibleLength } from "@/lib/zhuyin";

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
