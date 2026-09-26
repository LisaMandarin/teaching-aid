// Fonts for the board text. All are free to share, so a board looks the same on every teacher's
// computer, and all follow ButTaiwan's bpmfvs spec, so 破音字 readings (see lib/zhuyin.ts) work in each.
// The first three come from Google Fonts (app/layout.tsx); 只有注音 is served from public/fonts.
export const FONTS = [
  { id: "plain", name: "一般字型", family: null },
  { id: "bpmf-kai", name: "注音・楷書", family: '"Bpmf Zihi Kai Std"' },
  { id: "bpmf-huninn", name: "注音・圓體", family: '"Bpmf Huninn"' },
  { id: "bpmf-iansui", name: "注音・芫荽", family: '"Bpmf Iansui"' },
  { id: "zhuyin-only", name: "只有注音", family: '"TeachingAid Zhuyin Only"' },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

export const isFontId = (v: string | null): v is FontId => FONTS.some((f) => f.id === v);

export const fontFamilyOf = (id: FontId) => FONTS.find((f) => f.id === id)?.family ?? null;

const bare = (s: string) => s.replace(/[\s・·]/g, "");

// The 字型 row of the Excel 設定 sheet, e.g. "注音・楷書", "注音楷書", "楷書" or "只有注音".
export function fontFromSetting(value: string): FontId | undefined {
  const v = bare(value);
  if (!v) return undefined;
  return FONTS.find((f) => bare(f.name) === v)?.id ?? FONTS.find((f) => bare(f.name).includes(v))?.id;
}
