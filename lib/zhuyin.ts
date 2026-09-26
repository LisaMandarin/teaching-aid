// 破音字 readings written in Excel as 長[ㄓㄤˇ] are turned into the Ideographic Variation
// Sequences that the 注音 fonts (ButTaiwan's bpmfvs spec) use to pick a reading.
// Text pasted from the ToneOZ / bpmfvs 選音 tools already carries these selectors and passes through.

// Readings per character in font order (see scripts/build-polyphones.mjs).
export type PolyphoneTable = Record<string, string>;

const VS_BASE = 0xe01e0;

// Variation selectors are invisible; they shouldn't count towards a word's length.
const SELECTORS = /[\u{E0100}-\u{E01EF}︀-️]/gu;
export const visibleLength = (text: string) => [...text.replace(SELECTORS, "").trim()].length;

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
    return index === 0 ? char : char + String.fromCodePoint(VS_BASE + index);
  });
  return { text: out, problems };
}
