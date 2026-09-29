// 唸課文: the lesson text is a list of runs, each piece of text in its own font.
// Line breaks are "\n" inside the text.

import { type FontId, isFontId } from "./fonts";

export type Run = { text: string; font: FontId };

// Reading selectors (破音字, see lib/zhuyin.ts) belong to the character before them.
const isSelector = (ch: string) => /[\u{E0100}-\u{E01EF}︀-️]/u.test(ch);

// Joins neighbouring runs in the same font and drops empty ones.
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out.at(-1);
    if (last?.font === r.font) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

export const plainText = (runs: Run[]) => runs.map((r) => r.text).join("");

// Sets the font of the text from start to end (string offsets), keeping each character with its reading selector.
export function setFont(runs: Run[], start: number, end: number, font: FontId): Run[] {
  const text = plainText(runs);
  while (start < end && isSelector(text[start] ?? "")) start++;
  while (end < text.length && (isSelector(text[end]) || /[\uDC00-\uDFFF]/.test(text[end]))) end++;
  const out: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const from = at;
    const to = at + r.text.length;
    at = to;
    const a = Math.min(Math.max(start, from), to) - from;
    const b = Math.min(Math.max(end, from), to) - from;
    out.push({ text: r.text.slice(0, a), font: r.font }, { text: r.text.slice(a, b), font }, { text: r.text.slice(b), font: r.font });
  }
  return mergeRuns(out);
}

// The text split into lines, each a list of runs, for the board.
export function toLines(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ text: part, font: r.font });
    });
  }
  return lines;
}

export function isRuns(value: unknown): value is Run[] {
  return (
    Array.isArray(value) &&
    value.every((r) => typeof r?.text === "string" && isFontId(r?.font ?? null))
  );
}

// ---------- Opening a file ----------

// Words marked with the highlighter in Word get 注音; the rest stays 繁體.
const HIGHLIGHTED: FontId = "bpmf-kai";
const UNMARKED: FontId = "plain";

// A .txt file (UTF-8, or Big5 from older Windows programs) or a Word .docx file.
// Text without highlighting is all in the base font.
export async function readTextFile(file: File, base: FontId): Promise<Run[]> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".docx")) return readDocx(bytes, base);
  if (name.endsWith(".doc")) throw new Error("舊版的 Word（.doc）檔打不開，請在 Word 另存成 .docx 再上傳。");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("big5").decode(bytes);
  }
  return mergeRuns([{ text: text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), font: base }]);
}

// Word's highlighter is w:highlight; Google Docs and some Word versions save it as shading (w:shd) instead.
function isHighlighted(run: Element): boolean {
  const props = [...run.children].find((c) => c.tagName === "w:rPr");
  if (!props) return false;
  for (const p of props.children) {
    if (p.tagName === "w:highlight" && p.getAttribute("w:val") !== "none") return true;
    if (p.tagName === "w:shd") {
      const fill = (p.getAttribute("w:fill") ?? "auto").toLowerCase();
      if (fill !== "auto" && fill !== "ffffff") return true;
    }
  }
  return false;
}

async function readDocx(bytes: Uint8Array, base: FontId): Promise<Run[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  let xml: string;
  try {
    xml = strFromU8(unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" })["word/document.xml"]);
  } catch {
    throw new Error("無法讀取這個 Word 檔。");
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const pieces: { text: string; marked: boolean }[] = [];
  [...doc.getElementsByTagName("w:p")].forEach((p, i) => {
    if (i > 0) pieces.push({ text: "\n", marked: false });
    for (const run of p.getElementsByTagName("w:r")) {
      const marked = isHighlighted(run);
      for (const node of run.children) {
        if (node.tagName === "w:t") pieces.push({ text: node.textContent ?? "", marked });
        else if (node.tagName === "w:tab") pieces.push({ text: "\t", marked });
        else if (node.tagName === "w:br" || node.tagName === "w:cr") pieces.push({ text: "\n", marked: false });
      }
    }
  });
  const anyMarked = pieces.some((p) => p.marked && p.text.trim());
  return mergeRuns(
    pieces.map((p) => ({ text: p.text, font: anyMarked ? (p.marked ? HIGHLIGHTED : UNMARKED) : base })),
  );
}

// A 破音字 reading written right after its character, 長[ㄓㄤˇ], may be in another run than the character
// (only the character highlighted, say). It moves to the character's run, so the reading can be applied.
const READING_AT_START = /^\s*[[(（【]\s*[ㄅ-ㄯㆠ-ㆿˊˇˋ˙ˉ ]+?\s*[\])）】]/u;
export function keepReadingsWithCharacters(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  for (let i = 1; i < out.length; i++) {
    const m = out[i].text.match(READING_AT_START);
    if (m && /\p{Script=Han}$/u.test(out[i - 1].text)) {
      out[i - 1].text += m[0];
      out[i].text = out[i].text.slice(m[0].length);
    }
  }
  return mergeRuns(out);
}
