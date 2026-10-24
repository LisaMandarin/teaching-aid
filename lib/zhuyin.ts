// 破音字 readings written in Excel as 長[ㄓㄤˇ] are turned into the Ideographic Variation
// Sequences that the 注音 fonts (ButTaiwan's bpmfvs spec) use to pick a reading.
// Text pasted from the ToneOZ / bpmfvs 選音 tools already carries these selectors and passes through.

// Readings per character in font order (see scripts/build-polyphones.mjs).
export type PolyphoneTable = Record<string, string>;

export const VS_BASE = 0xe01e0;

// Written after a 破音字 whose first reading was picked. The fonts show the first reading without a mark,
// but 拼音 would guess the reading from the word (音樂[ㄌㄜˋ] → yuè). Not VS_BASE itself: the fonts don't
// know that sequence, and the browser then draws the character in another font, without its 注音.
// A word joiner is invisible in every font and doesn't change line breaks.
export const FIRST_READING = "\u2060";

// Variation selectors and FIRST_READING: invisible, and they belong to the character before them.
export const READING_MARKS = /[\u{E0100}-\u{E01EF}\uFE00-\uFE0F\u2060]/gu;
export const isReadingMark = (ch: string) => /^[\u{E0100}-\u{E01EF}\uFE00-\uFE0F\u2060]$/u.test(ch);

// The reading marks shouldn't count towards a word's length.
export const visibleLength = (text: string) => [...text.replace(READING_MARKS, "").trim()].length;

// A Han character followed by a bracketed reading: 長[ㄓㄤˇ], 長(ㄓㄤˇ), 長（ㄓㄤˇ）, 長【ㄓㄤˇ】.
const MARKED = /(\p{Script=Han})\s*[[(（【]\s*([ㄅ-ㄯㆠ-ㆿˊˇˋ˙ˉ ]+?)\s*[\])）】]/gu;

let table: Promise<PolyphoneTable> | null = null;
export function loadPolyphones(): Promise<PolyphoneTable> {
  table ??= import("./polyphones.json").then((m) => m.default as PolyphoneTable);
  return table;
}

function normalize(reading: string): string {
  // First tone is usually written without a mark; the light-tone dot may be typed after the syllable.
  let r = reading.replace(/[\sˉ]/g, "");
  if (r.endsWith("˙")) r = "˙" + r.slice(0, -1);
  return r;
}

export type ReadingProblem = { char: string; reading: string; options: string[] };

export function applyReadings(text: string, polyphones: PolyphoneTable): { text: string; problems: ReadingProblem[] } {
  const problems: ReadingProblem[] = [];
  const out = text.replace(MARKED, (_, char: string, raw: string) => {
    const options = polyphones[char]?.split(" ");
    // Not a 破音字: the font only knows one reading, so the note isn't needed.
    if (!options) return char;
    const reading = normalize(raw);
    const index = options.indexOf(reading);
    if (index === -1) {
      problems.push({ char, reading, options });
      return char;
    }
    return char + (index === 0 ? FIRST_READING : String.fromCodePoint(VS_BASE + index));
  });
  return { text: out, problems };
}

// What to tell the teacher about readings that don't exist; null if there are none.
export const problemsNotice = (problems: ReadingProblem[]) =>
  problems.length > 0
    ? `這些讀音找不到：${problems.map((p) => `${p.char}[${p.reading}]（可用：${p.options.join("、")}）`).join("；")}`
    : null;

// Text typed straight into a field: 長[ㄓㄤˇ] becomes 長 with its reading, once the teacher is done typing.
// Null when there's nothing to do.
export async function typedReadings(text: string): Promise<{ text: string; notice: string | null } | null> {
  if (!/[[(（【]/.test(text)) return null;
  const done = applyReadings(text, await loadPolyphones());
  return { text: done.text, notice: problemsNotice(done.problems) };
}
