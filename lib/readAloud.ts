// 唸課文 and 填空: the lesson text is a list of runs, each piece of text in its own font.
// Line breaks are "\n" inside the text. In 填空 a run can be (part of) a blank: all runs with the same
// `blank` number are one blank, whose words become a word card.

import { type FontId, isFontId } from "./fonts";
import { type ReadingProblem, applyReadings, loadPolyphones } from "./zhuyin";

export type Run = { text: string; font: FontId; blank?: number };

// Reading selectors (破音字, see lib/zhuyin.ts) belong to the character before them.
const isSelector = (ch: string) => /[\u{E0100}-\u{E01EF}︀-️]/u.test(ch);

// Joins neighbouring runs in the same font (and blank) and drops empty ones.
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out.at(-1);
    if (last && last.font === r.font && last.blank === r.blank) last.text += r.text;
    else out.push(r.blank === undefined ? { text: r.text, font: r.font } : { ...r });
  }
  return out;
}

export const plainText = (runs: Run[]) => runs.map((r) => r.text).join("");

// Moves start and end so a character isn't split from its reading selector (or its other half).
export function snapRange(text: string, start: number, end: number): [number, number] {
  while (start < end && isSelector(text[start] ?? "")) start++;
  while (end < text.length && (isSelector(text[end]) || /[\uDC00-\uDFFF]/.test(text[end]))) end++;
  return [start, end];
}

// Changes the runs' text from start to end (string offsets) with `change`, keeping each character with its reading selector.
export function changeRange(runs: Run[], start: number, end: number, change: (r: Run) => Run): Run[] {
  [start, end] = snapRange(plainText(runs), start, end);
  const out: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const from = at;
    const to = at + r.text.length;
    at = to;
    const a = Math.min(Math.max(start, from), to) - from;
    const b = Math.min(Math.max(end, from), to) - from;
    out.push({ ...r, text: r.text.slice(0, a) }, change({ ...r, text: r.text.slice(a, b) }), { ...r, text: r.text.slice(b) });
  }
  return mergeRuns(out);
}

export const setFont = (runs: Run[], start: number, end: number, font: FontId): Run[] =>
  changeRange(runs, start, end, (r) => ({ ...r, font }));

// The text split into lines, each a list of runs, for the board.
export function toLines(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ ...r, text: part });
    });
  }
  return lines;
}

export function isRuns(value: unknown): value is Run[] {
  return (
    Array.isArray(value) &&
    value.every(
      (r) =>
        typeof r?.text === "string" &&
        isFontId(r?.font ?? null) &&
        (r.blank === undefined || Number.isInteger(r.blank)),
    )
  );
}

// ---------- Opening a file ----------

// In a Word file, words marked with the highlighter get 注音 and the rest stays 繁體 (both games).
// In 填空, underlined words are the blanks, so one file works for both: 注音 for the words not learned yet,
// blanks for the lesson's target words.
const HIGHLIGHTED: FontId = "bpmf-kai";
const UNMARKED: FontId = "plain";

// A .txt file (UTF-8, or Big5 from older Windows programs) or a Word .docx file.
// Text without highlighting is all in the base font. `blanks`: underlined words become blanks.
export async function readTextFile(file: File, base: FontId, blanks = false): Promise<Run[]> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".docx")) return readDocx(bytes, base, blanks);
  if (name.endsWith(".doc")) throw new Error("舊版的 Word（.doc）檔打不開，請在 Word 另存成 .docx 再上傳。");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("big5").decode(bytes);
  }
  return mergeRuns([{ text: text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), font: base }]);
}

const propsOf = (run: Element) => [...([...run.children].find((c) => c.tagName === "w:rPr")?.children ?? [])];

// Word's highlighter is w:highlight; Google Docs and some Word versions save it as shading (w:shd) instead.
function isHighlighted(run: Element): boolean {
  for (const p of propsOf(run)) {
    if (p.tagName === "w:highlight" && p.getAttribute("w:val") !== "none") return true;
    if (p.tagName === "w:shd") {
      const fill = (p.getAttribute("w:fill") ?? "auto").toLowerCase();
      if (fill !== "auto" && fill !== "ffffff") return true;
    }
  }
  return false;
}

// Any underline style (single, double, dotted…); w:u with no w:val is a single underline.
const isUnderlined = (run: Element) =>
  propsOf(run).some((p) => p.tagName === "w:u" && p.getAttribute("w:val") !== "none");

async function readDocx(bytes: Uint8Array, base: FontId, blanks: boolean): Promise<Run[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  let xml: string;
  try {
    xml = strFromU8(unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" })["word/document.xml"]);
  } catch {
    throw new Error("無法讀取這個 Word 檔。");
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const pieces: { text: string; marked: boolean; underlined: boolean }[] = [];
  const lineBreak = { text: "\n", marked: false, underlined: false };
  [...doc.getElementsByTagName("w:p")].forEach((p, i) => {
    if (i > 0) pieces.push(lineBreak);
    for (const run of p.getElementsByTagName("w:r")) {
      const marked = isHighlighted(run);
      const underlined = isUnderlined(run);
      for (const node of run.children) {
        if (node.tagName === "w:t") pieces.push({ text: node.textContent ?? "", marked, underlined });
        else if (node.tagName === "w:tab") pieces.push({ text: "\t", marked, underlined });
        else if (node.tagName === "w:br" || node.tagName === "w:cr") pieces.push(lineBreak);
      }
    }
  });
  const anyMarked = pieces.some((p) => p.marked && p.text.trim());
  // Each underlined stretch is one blank; underlined spaces around the words aren't part of it.
  let blank = 0;
  let inBlank = false;
  return mergeRuns(
    pieces.map((p) => {
      const font = anyMarked ? (p.marked ? HIGHLIGHTED : UNMARKED) : base;
      const isBlank = blanks && p.underlined && p.text.trim() !== "";
      if (isBlank && !inBlank) blank++;
      inBlank = isBlank;
      return isBlank ? { text: p.text, font, blank } : { text: p.text, font };
    }),
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

// 長[ㄓㄤˇ] becomes 長 with its reading picked. Readings that don't exist come back as a notice for the teacher.
export async function withReadings(from: Run[]): Promise<{ runs: Run[]; notice: string | null }> {
  const polyphones = await loadPolyphones();
  const problems: ReadingProblem[] = [];
  const runs = keepReadingsWithCharacters(from).map((r) => {
    const done = applyReadings(r.text, polyphones);
    problems.push(...done.problems);
    return { ...r, text: done.text };
  });
  const notice =
    problems.length > 0
      ? `這些讀音找不到：${problems.map((p) => `${p.char}[${p.reading}]（可用：${p.options.join("、")}）`).join("；")}`
      : null;
  return { runs, notice };
}
