// 簡體 and 漢語拼音 for the board text. Teachers type 繁體 (or 簡體) as usual; the text is converted
// when it's shown, so one question bank works for every font.
// A 破音字 reading picked in Excel (長[ㄓㄤˇ], see lib/zhuyin.ts) also sets its 拼音.

import { type PolyphoneTable, loadPolyphones } from "./zhuyin";

// One character of the board text: a Han character carries its 拼音.
export type Piece = { text: string; pinyin?: string };

export type Hanzi = { convert: (text: string) => Piece[] };

const VS_BASE = 0xe01e0;
const isSelector = (ch: string) => /[\u{E0100}-\u{E01EF}︀-️]/u.test(ch);

// ---------- 注音 → 拼音 ----------

const INITIALS: Record<string, string> = {
  ㄅ: "b", ㄆ: "p", ㄇ: "m", ㄈ: "f", ㄉ: "d", ㄊ: "t", ㄋ: "n", ㄌ: "l", ㄍ: "g", ㄎ: "k", ㄏ: "h",
  ㄐ: "j", ㄑ: "q", ㄒ: "x", ㄓ: "zh", ㄔ: "ch", ㄕ: "sh", ㄖ: "r", ㄗ: "z", ㄘ: "c", ㄙ: "s",
};

// Finals as spelled after an initial.
const FINALS: Record<string, string> = {
  "": "", ㄚ: "a", ㄛ: "o", ㄜ: "e", ㄝ: "ê", ㄞ: "ai", ㄟ: "ei", ㄠ: "ao", ㄡ: "ou", ㄢ: "an", ㄣ: "en", ㄤ: "ang", ㄥ: "eng", ㄦ: "er",
  ㄧ: "i", ㄧㄚ: "ia", ㄧㄛ: "io", ㄧㄝ: "ie", ㄧㄞ: "iai", ㄧㄠ: "iao", ㄧㄡ: "iu", ㄧㄢ: "ian", ㄧㄣ: "in", ㄧㄤ: "iang", ㄧㄥ: "ing",
  ㄨ: "u", ㄨㄚ: "ua", ㄨㄛ: "uo", ㄨㄞ: "uai", ㄨㄟ: "ui", ㄨㄢ: "uan", ㄨㄣ: "un", ㄨㄤ: "uang", ㄨㄥ: "ong",
  ㄩ: "ü", ㄩㄝ: "üe", ㄩㄢ: "üan", ㄩㄣ: "ün", ㄩㄥ: "iong",
};

// Finals as spelled on their own, without an initial.
const ALONE: Record<string, string> = {
  i: "yi", ia: "ya", io: "yo", ie: "ye", iai: "yai", iao: "yao", iu: "you", ian: "yan", in: "yin", iang: "yang", ing: "ying",
  u: "wu", ua: "wa", uo: "wo", uai: "wai", ui: "wei", uan: "wan", un: "wen", uang: "wang", ong: "weng",
  ü: "yu", üe: "yue", üan: "yuan", ün: "yun", iong: "yong",
};

const TONES: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"], e: ["ē", "é", "ě", "è"], i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"], u: ["ū", "ú", "ǔ", "ù"], ü: ["ǖ", "ǘ", "ǚ", "ǜ"], ê: ["ê̄", "ế", "ê̌", "ề"],
};

// tone: 1–4, or 0 for the light tone.
function markTone(syllable: string, tone: number): string {
  if (tone === 0) return syllable;
  // a or e takes the mark, then the o of ou, otherwise the last vowel (so iu → iù, ui → uì).
  let at = syllable.search(/[aeê]/);
  if (at === -1) at = syllable.indexOf("ou");
  if (at === -1) for (let i = 0; i < syllable.length; i++) if ("iouü".includes(syllable[i])) at = i;
  if (at === -1) return syllable;
  return syllable.slice(0, at) + TONES[syllable[at]][tone - 1] + syllable.slice(at + 1);
}

// "ㄓㄤˇ" → "zhǎng", "˙ㄉㄜ" → "de". Undefined if it isn't a 注音 syllable.
export function zhuyinToPinyin(zhuyin: string): string | undefined {
  let z = zhuyin.replace(/[\sˉ]/g, "");
  let tone = 1;
  if (z.startsWith("˙") || z.endsWith("˙")) {
    tone = 0;
    z = z.replace("˙", "");
  }
  const mark = "ˊˇˋ".indexOf(z.at(-1) ?? "");
  if (mark !== -1) {
    tone = mark + 2;
    z = z.slice(0, -1);
  }
  const initial = INITIALS[z[0]];
  const rest = initial === undefined ? z : z.slice(1);
  let final = FINALS[rest];
  if (final === undefined) return undefined;
  let syllable: string;
  if (initial === undefined) syllable = ALONE[final] ?? final;
  else {
    // ㄓㄔㄕㄖㄗㄘㄙ on their own are written with i: zhi, ci…
    if (final === "") final = "zh ch sh r z c s".split(" ").includes(initial) ? "i" : "";
    // After j, q, x the ü is written u.
    if ("jqx".includes(initial)) final = final.replace("ü", "u");
    if (final === "ê") final = "e";
    syllable = initial + final;
  }
  return syllable ? markTone(syllable, tone) : undefined;
}

// ---------- Loading ----------

let loading: Promise<Hanzi> | null = null;
let loaded: Hanzi | null = null;

// Undefined until loadHanzi() has finished.
export const hanziIfLoaded = () => loaded;

// The converters are large, so they're only fetched once a 簡體 or 拼音 font is picked.
export function loadHanzi(): Promise<Hanzi> {
  loading ??= Promise.all([import("opencc-js/t2cn"), import("pinyin-pro"), loadPolyphones()]).then(
    ([opencc, { pinyin }, polyphones]) => {
      // Taiwan 繁體 to 簡體, character for character: words like 軟體 aren't changed to 软件.
      const toHans = opencc.Converter({ from: "tw", to: "cn" });
      loaded = { convert: (text) => convert(text, toHans, pinyin, polyphones) };
      return loaded;
    },
  );
  return loading;
}

type PinyinPro = typeof import("pinyin-pro").pinyin;

function convert(text: string, toHans: (s: string) => string, pinyin: PinyinPro, polyphones: PolyphoneTable): Piece[] {
  // Split off the reading selectors: [character, reading picked in Excel].
  const chars: { ch: string; reading?: string }[] = [];
  for (const ch of text) {
    if (isSelector(ch)) {
      const last = chars.at(-1);
      const index = ch.codePointAt(0)! - VS_BASE;
      const zhuyin = last && index > 0 ? polyphones[last.ch]?.split(" ")[index] : undefined;
      if (last && zhuyin) last.reading = zhuyinToPinyin(zhuyin);
    } else chars.push({ ch });
  }

  // Converted as a whole so phrases pick the right character (乾淨 → 干净, 乾隆 stays), but kept
  // one character at a time if the length changes, so each 拼音 stays with its character.
  const whole = [...toHans(chars.map((c) => c.ch).join(""))];
  const hans = whole.length === chars.length ? whole : chars.map((c) => toHans(c.ch));

  // pinyin-pro reads the whole text too, so a 破音字 gets the reading that fits the word.
  const guessed = pinyin(hans.join(""), { type: "all" });
  const pieces: Piece[] = [];
  let i = 0;
  for (const g of guessed) {
    for (const ch of g.origin) {
      const reading = chars[i]?.reading;
      pieces.push(g.isZh ? { text: ch, pinyin: reading ?? g.pinyin } : { text: ch });
      i++;
    }
  }
  return pieces;
}
