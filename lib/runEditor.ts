// The paper the teacher types the lesson text on (唸課文, 填空): a plain-text contentEditable.
// While the teacher types, the page is the source of truth and is read back into runs; when a font
// (or a blank) is applied, the runs are changed and the page is redrawn, one <span> per run.

import { type FontId, fontFamilyOf, isFontId } from "./fonts";
import { type Run, mergeRuns, plainText } from "./readAloud";

type Positions = Map<Node, { enter: number; exit: number }>;

export const fontOf = (el: Element): FontId | null => {
  const f = el.getAttribute("data-font");
  return isFontId(f) ? f : null;
};

const blankOf = (el: Element): number | undefined => {
  const b = el.getAttribute("data-blank");
  return b === null ? undefined : Number(b);
};

// Reads the editor into runs. Also notes where each node starts and ends in the text, to turn the selection into offsets.
export function readEditor(root: HTMLElement, base: FontId): { runs: Run[]; positions: Positions } {
  const runs: Run[] = [];
  const positions: Positions = new Map();
  let length = 0;
  const push = (text: string, font: FontId, blank: number | undefined) => {
    runs.push(blank === undefined ? { text, font } : { text, font, blank });
    length += text.length;
  };
  const endsWithBreak = () => runs.at(-1)?.text.endsWith("\n") ?? true;

  const walk = (node: Node, font: FontId, blank: number | undefined) => {
    const enter = length;
    if (node.nodeType === Node.TEXT_NODE) push((node as Text).data, font, blank);
    else if (node instanceof HTMLElement) {
      if (node.tagName === "BR") {
        // The browser keeps a <br> at the end of a line so an empty line has height; it isn't a line break.
        if (node.nextSibling) push("\n", font, undefined);
      } else {
        if ((node.tagName === "DIV" || node.tagName === "P") && !endsWithBreak()) push("\n", font, undefined);
        const own = fontOf(node) ?? font;
        const ownBlank = blankOf(node) ?? blank;
        node.childNodes.forEach((child) => walk(child, own, ownBlank));
      }
    }
    positions.set(node, { enter, exit: length });
  };
  root.childNodes.forEach((child) => walk(child, base, undefined));
  positions.set(root, { enter: 0, exit: length });
  return { runs: mergeRuns(runs), positions };
}

function offsetOf(positions: Positions, node: Node, offset: number): number | undefined {
  const at = positions.get(node);
  if (!at) return undefined;
  if (node.nodeType === Node.TEXT_NODE) return Math.min(at.enter + offset, at.exit);
  const child = node.childNodes[offset];
  return child ? positions.get(child)?.enter : at.exit;
}

// The editor's runs, and the selection in it as offsets into the text (start === end for just the cursor).
export function readSelection(
  root: HTMLElement,
  base: FontId,
): { runs: Run[]; start: number; end: number } | { runs: Run[]; start?: undefined; end?: undefined } {
  const { runs, positions } = readEditor(root, base);
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  if (!range || !root.contains(range.commonAncestorContainer)) return { runs };
  const start = offsetOf(positions, range.startContainer, range.startOffset);
  const end = offsetOf(positions, range.endContainer, range.endOffset);
  if (start === undefined || end === undefined || start > end) return { runs };
  return { runs, start, end };
}

// 注音 fonts show as they will on the board; 簡體 and 拼音 are marked in CSS and converted only on the board.
export const editorFamily = (font: FontId) => {
  const family = fontFamilyOf(font);
  // 繁體 is set too, so it doesn't take the editor's own font.
  return family ? `${family}, var(--font-body)` : "var(--font-body)";
};

// Draws the runs into the editor, one <span> per run.
export function drawEditor(root: HTMLElement, runs: Run[]) {
  const spans: Node[] = runs.map((r) => {
    const span = document.createElement("span");
    span.dataset.font = r.font;
    if (r.blank !== undefined) span.dataset.blank = String(r.blank);
    span.style.fontFamily = editorFamily(r.font);
    span.textContent = r.text;
    return span;
  });
  // Without it a line break at the very end wouldn't show a new line.
  if (plainText(runs).endsWith("\n")) spans.push(document.createElement("br"));
  root.replaceChildren(...spans);
}

// Selects text from start to end (offsets) in an editor drawn by drawEditor.
export function selectRange(root: HTMLElement, start: number, end: number) {
  // Between two spans, the start goes at the beginning of the next one, so it is in the selected words' font.
  const point = (target: number, isStart: boolean): [Node, number] => {
    let at = 0;
    for (const span of root.children) {
      const text = span.firstChild;
      if (!text) continue;
      const len = (text as Text).data.length;
      if (isStart ? target < at + len : target <= at + len) return [text, target - at];
      at += len;
    }
    return [root, root.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...point(start, true));
  range.setEnd(...point(end, false));
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
