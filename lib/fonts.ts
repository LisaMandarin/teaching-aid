// Fonts for the board text. All are free to share, so a board looks the same on every teacher's
// computer, and all follow ButTaiwan's bpmfvs spec, so 破音字 readings (see lib/zhuyin.ts) work in each.
// The 注音 fonts come from Google Fonts (app/layout.tsx); 只有注音 is served from public/fonts.
// 簡體 and 漢語拼音 use the system font: the text is converted and the 拼音 added in the page (lib/hanzi.ts).
export const FONTS = [
  { id: "plain", name: "繁體", family: null, aliases: ["一般字型"] },
  { id: "bpmf-kai", name: "注音・繁體楷書", family: '"Bpmf Zihi Kai Std"', aliases: ["注音・楷書"] },
  { id: "bpmf-huninn", name: "注音・繁體圓體", family: '"Bpmf Huninn"', aliases: ["注音・圓體"] },
  { id: "bpmf-iansui", name: "注音・繁體芫荽", family: '"Bpmf Iansui"', aliases: ["注音・芫荽"] },
  { id: "zhuyin-only", name: "只有注音", family: '"TeachingAid Zhuyin Only"', aliases: [] },
  { id: "hans", name: "簡體", family: null, aliases: ["简体"] },
  { id: "hans-pinyin", name: "簡體＋漢語拼音", family: null, aliases: ["简体＋汉语拼音"] },
  { id: "pinyin-only", name: "只有漢語拼音", family: null, aliases: ["只有汉语拼音"] },
] as const satisfies readonly { id: string; name: string; family: string | null; aliases: readonly string[] }[];

export type FontId = (typeof FONTS)[number]["id"];

export const isFontId = (v: string | null): v is FontId => FONTS.some((f) => f.id === v);

export const fontFamilyOf = (id: FontId) => FONTS.find((f) => f.id === id)?.family ?? null;

// Shown converted to 簡體 (and 拼音) rather than as typed.
export const isHans = (id: FontId) => id === "hans" || id === "hans-pinyin" || id === "pinyin-only";

const bare = (s: string) => s.replace(/[\s・·+＋]/g, "");

// The 字型 row of the Excel 設定 sheet, e.g. "注音・繁體楷書", "楷書", "簡體＋漢語拼音" or "只有注音".
// Names from older templates (一般字型, 注音・楷書…) still work.
export function fontFromSetting(value: string): FontId | undefined {
  const v = bare(value);
  if (!v) return undefined;
  const names = (f: (typeof FONTS)[number]): readonly string[] => [f.name, ...f.aliases];
  return (
    FONTS.find((f) => names(f).some((n) => bare(n) === v))?.id ??
    FONTS.find((f) => bare(f.name).includes(v))?.id
  );
}
