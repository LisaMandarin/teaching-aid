// 開禮物: gifts imported from Excel and hidden in gift boxes, one gift per box.

import { listRef, saveWorkbook } from "./excel";
import { FONTS, type FontId, fontFromSetting } from "./fonts";
import { type Cell, directLink, fileInFolder, isDriveFolder, shuffle } from "./lessons";
import { applyReadings, loadPolyphones } from "./zhuyin";

export type GiftKind = "good" | "bad" | "bomb";

// The sounds a gift can play, in public/sounds. Each kind has its own unless the Excel file picks another.
export const SOUND_FILES = ["wow.mp3", "oh oh.mp3", "bomb.mp3"];

export const KINDS: { id: GiftKind; name: string; emoji: string; sound: string }[] = [
  { id: "good", name: "好禮物", emoji: "🎉", sound: "wow.mp3" },
  { id: "bad", name: "不好的禮物", emoji: "😅", sound: "oh oh.mp3" },
  { id: "bomb", name: "炸彈", emoji: "💥", sound: "bomb.mp3" },
];

// Played while the box shakes.
export const SHAKE_SOUND = "drum.mp3";

export const soundUrl = (sound: string) => `/sounds/${encodeURIComponent(sound)}`;

// `text` is the gift's name; `sound` overrides the default sound for its kind.
export type Gift = Cell & { kind: GiftKind; sound?: string };

export const soundOfGift = (gift: Gift) =>
  gift.sound && SOUND_FILES.includes(gift.sound) ? gift.sound : KINDS.find((k) => k.id === gift.kind)!.sound;

export type ColorMode = "random" | "custom";

export type GiftSetup = {
  fileName: string | null;
  // One box per gift, so the number of boxes is always gifts.length.
  gifts: Gift[];
  colorMode: ColorMode;
  // Box i's color in custom mode (hex); boxes past the end of the list reuse it from the start.
  colors: string[];
  // What's on the front of box i, in place of its number; a blank or missing cover shows the number.
  covers: Cell[];
  // Font for the cover text, as in 圈圈叉叉.
  font: FontId;
};

// Rows in the 禮物盒 sheet of the template.
const COLOR_ROWS = 30;

export const BOX_COLORS = [
  { name: "紅", hex: "#ef4444" },
  { name: "橘", hex: "#f97316" },
  { name: "黃", hex: "#facc15" },
  { name: "綠", hex: "#22c55e" },
  { name: "青", hex: "#14b8a6" },
  { name: "藍", hex: "#3b82f6" },
  { name: "紫", hex: "#a855f7" },
  { name: "粉紅", hex: "#ec4899" },
  { name: "金", hex: "#d4a017" },
  { name: "銀", hex: "#a8b0bd" },
];

const defaultColor = (i: number) => BOX_COLORS[i % BOX_COLORS.length].hex;

export const customColor = (setup: GiftSetup, i: number) =>
  setup.colors.length > 0 ? setup.colors[i % setup.colors.length] : defaultColor(i);

// Every box a different color while there are enough colors to go round.
export function randomColors(count: number): string[] {
  const out: string[] = [];
  while (out.length < count) out.push(...shuffle(BOX_COLORS.map((c) => c.hex)));
  return out.slice(0, count);
}

export const DEFAULT_SETUP: GiftSetup = {
  fileName: null,
  gifts: [
    { text: "⭐ 貼紙", image: null, kind: "good" },
    { text: "⭐ 貼紙", image: null, kind: "good" },
    { text: "🍬 糖果", image: null, kind: "good" },
    { text: "🍬 糖果", image: null, kind: "good" },
    { text: "🪙 三個金幣", image: null, kind: "good" },
    { text: "🎤 唱一首歌", image: null, kind: "bad" },
    { text: "😜 做鬼臉", image: null, kind: "bad" },
    { text: "炸彈", image: null, kind: "bomb" },
  ],
  colorMode: "random",
  colors: Array.from({ length: COLOR_ROWS }, (_, i) => defaultColor(i)),
  covers: [],
  font: "plain",
};

const HELP_SHEET = "說明";
const SETTINGS_SHEET = "設定";
const BOXES_SHEET = "禮物盒";
const GIFTS_SHEET = "禮物";
const OPTIONS_SHEET = "選項";

const FOLDER_LABEL = "圖片資料夾";
const COLOR_MODE_LABEL = "禮物盒顏色";
const FONT_LABEL = "字型";

const COLOR_MODES: { id: ColorMode; name: string }[] = [
  { id: "random", name: "隨機" },
  { id: "custom", name: "自訂" },
];

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

const isImageFile = (s: string) => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(s);

function kindOf(value: string): GiftKind | undefined {
  const v = value.replace(/\s/g, "");
  if (!v) return "good";
  if (v.includes("炸彈") || /bomb/i.test(v)) return "bomb";
  if (v.includes("不好") || v.includes("壞") || /bad/i.test(v)) return "bad";
  if (v.includes("好") || /good/i.test(v)) return "good";
  return undefined;
}

function colorOf(value: string): string | undefined {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) return "#" + [...value.slice(1)].map((c) => c + c).join("").toLowerCase();
  const v = value.replace(/色$/, "");
  return BOX_COLORS.find((c) => c.name === v)?.hex;
}

// Matched without caring about case, so "WOW.MP3" finds wow.mp3.
const soundOf = (value: string) => SOUND_FILES.find((f) => f.toLowerCase() === value.toLowerCase());

export type ParsedGifts = {
  setup: GiftSetup;
  // Image file names that must come from the teacher's computer (no folder link was given).
  localNames: string[];
  warnings: string[];
};

export async function parseGifts(file: File): Promise<ParsedGifts> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const [sheets, polyphones] = await Promise.all([readXlsxFile(file), loadPolyphones()]);
  const warnings: string[] = [];
  const setup: GiftSetup = { ...DEFAULT_SETUP, fileName: file.name, gifts: [], colors: [...DEFAULT_SETUP.colors], covers: [] };
  const sheetRows = (name: string) => sheets.find((s) => s.sheet.trim() === name)?.data ?? [];

  let folder = "";
  for (const row of sheetRows(SETTINGS_SHEET)) {
    const label = cellText(row[0]);
    const value = cellText(row[1]);
    if (!value) continue;
    if (label === FOLDER_LABEL) folder = value;
    else if (label === COLOR_MODE_LABEL) {
      const mode = COLOR_MODES.find((m) => m.name === value)?.id;
      if (mode) setup.colorMode = mode;
      else warnings.push(`「設定」的禮物盒顏色「${value}」看不懂，可以填：隨機、自訂。`);
    } else if (label === FONT_LABEL) {
      const font = fontFromSetting(value);
      if (font) setup.font = font;
      else warnings.push(`「設定」的字型「${value}」看不懂，可以填：${FONTS.map((f) => f.name).join("、")}。`);
    }
  }

  if (isDriveFolder(folder)) {
    warnings.push("「設定」的圖片資料夾是 Google Drive 資料夾；Google Drive 不能用檔名找圖片，所以改成從電腦選取圖片。");
    folder = "";
  }

  const localNames = new Set<string>();
  // A picture given as a URL, or as a file name found in the folder or picked from the computer later.
  const withImage = (text: string, img: string, where: string): Cell => {
    if (!img) return { text, image: null };
    if (isDriveFolder(img)) {
      warnings.push(`${where}：圖片欄是 Google Drive 資料夾連結，請改貼那張圖片自己的分享連結。`);
      return { text, image: null };
    }
    if (/^https?:\/\//i.test(img)) return { text, image: directLink(img), imageName: img };
    if (folder) return { text, image: fileInFolder(folder, img), imageName: img };
    localNames.add(img);
    return { text, image: null, imageName: img };
  };
  // 長[ㄓㄤˇ] → 長 + the variation selector the 注音 fonts use for that reading.
  const readings = (raw: string, where: string) => {
    const { text, problems } = applyReadings(raw, polyphones);
    for (const p of problems)
      warnings.push(`${where}的「${raw}」：「${p.char}」沒有「${p.reading}」這個讀音，可以寫：${p.options.join("、")}。`);
    return text;
  };

  // 禮物盒: 盒子 number, 顏色, 封面文字, 封面圖片.
  const boxRows = sheetRows(BOXES_SHEET);
  const boxHeader = boxRows[0]?.map(cellText) ?? [];
  const boxCol = (name: string, fallback: number) => {
    const i = boxHeader.findIndex((h) => h.includes(name));
    return i === -1 ? fallback : i;
  };
  const bc = { n: boxCol("盒子", 0), color: boxCol("顏色", 1), text: boxCol("封面文字", 2), image: boxCol("封面圖片", 3) };
  for (const row of boxRows.slice(1)) {
    const n = Number(cellText(row[bc.n]));
    if (!Number.isInteger(n) || n < 1) continue;
    const where = `「禮物盒」第 ${n} 個盒子`;

    const value = cellText(row[bc.color]);
    const color = value ? colorOf(value) : undefined;
    if (value && !color)
      warnings.push(`${where}的顏色「${value}」看不懂，可以填：${BOX_COLORS.map((c) => c.name).join("、")}。`);
    if (color) {
      while (setup.colors.length < n) setup.colors.push(defaultColor(setup.colors.length));
      setup.colors[n - 1] = color;
    }

    const coverText = cellText(row[bc.text]);
    const coverImage = cellText(row[bc.image]);
    if (coverText || coverImage) {
      while (setup.covers.length < n) setup.covers.push({ text: "", image: null });
      setup.covers[n - 1] = withImage(readings(coverText, where), coverImage, where);
    }
  }

  // The 禮物 sheet, or else the first sheet that isn't one of the others.
  const skip: string[] = [HELP_SHEET, SETTINGS_SHEET, BOXES_SHEET, OPTIONS_SHEET];
  const giftSheet =
    sheets.find((s) => s.sheet.trim() === GIFTS_SHEET) ?? sheets.find((s) => !skip.includes(s.sheet.trim()));
  const rows = (giftSheet?.data ?? []).filter((row) => row.some((v) => cellText(v) !== ""));

  const header = rows[0]?.map(cellText) ?? [];
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const nameCol = col("名稱", "禮物");
  const hasHeader = nameCol !== -1;
  const cols = {
    name: hasHeader ? nameCol : 0,
    image: hasHeader ? col("圖片") : 1,
    kind: hasHeader ? col("種類") : 2,
    amount: hasHeader ? col("數量") : 3,
    sound: hasHeader ? col("音效") : 4,
  };
  const at = (row: unknown[], i: number) => (i === -1 ? "" : cellText(row[i]));

  for (const row of hasHeader ? rows.slice(1) : rows) {
    let text = at(row, cols.name);
    let img = at(row, cols.image);
    const kindText = at(row, cols.kind);
    // A picture's file name written in the name column: treat it as the picture.
    if (!img && isImageFile(text)) [img, text] = [text, ""];
    if (!text && !img) continue;
    const label = text || img;

    let kind = kindOf(kindText);
    if (!kind) {
      warnings.push(`「${label}」的種類「${kindText}」看不懂，先當成好禮物。可以填：${KINDS.map((k) => k.name).join("、")}。`);
      kind = "good";
    }

    const amountText = at(row, cols.amount);
    let amount = amountText === "" ? 1 : Number(amountText);
    if (!Number.isInteger(amount) || amount < 0) {
      warnings.push(`「${label}」的數量「${amountText}」不是整數，先當成 1 個。`);
      amount = 1;
    }

    const soundText = at(row, cols.sound);
    const sound = soundText ? soundOf(soundText) : undefined;
    if (soundText && !sound)
      warnings.push(`「${label}」的音效「${soundText}」找不到，改用 ${KINDS.find((k) => k.id === kind)!.sound}。可以選：${SOUND_FILES.join("、")}。`);

    const gift: Gift = { ...withImage(text, img, `「${label}」`), kind, sound };
    // Copies share one object so a local image picked later fills them all.
    for (let i = 0; i < amount; i++) setup.gifts.push(gift);
  }

  const extra = setup.covers.length - setup.gifts.length;
  if (setup.gifts.length > 0 && extra > 0)
    warnings.push(`「禮物盒」有 ${setup.covers.length} 個封面，但禮物只有 ${setup.gifts.length} 份（一份一個盒子），最後 ${extra} 個封面用不到。`);

  return { setup, localNames: [...localNames], warnings };
}

const bold = { fontWeight: "bold", backgroundColor: "#fce7f3" } as const;

export async function downloadGiftTemplate() {
  const help = [
    "「開禮物」範本",
    "",
    "・有下拉選單的格子，點一下右邊的小箭頭就能選。",
    "・「禮物」工作表每列一種禮物，每一份禮物放進一個禮物盒：禮物盒的數量 = 所有禮物的「數量」加起來。",
    "    - 名稱：打開時顯示的字，可以加表情符號，例如 🍬 糖果。有圖片的話可以留空。",
    "    - 圖片：檔名（例如 apple.png）或完整網址；留空就只顯示名稱（炸彈沒有圖片時會顯示 💣）。",
    "    - 種類：好禮物、不好的禮物、炸彈。",
    "    - 數量：這個禮物放幾份，留空就是 1 份。",
    "    - 音效：留空就用種類的音效（好禮物 wow.mp3、不好的禮物 oh oh.mp3、炸彈 bomb.mp3）；想換才要選。",
    "・「設定」的「禮物盒顏色」：",
    "    - 隨機：每一局隨機配色。",
    "    - 自訂：用「禮物盒」工作表裡每個盒子的顏色。",
    "・「禮物盒」工作表的「封面文字」「封面圖片」：放在盒子正面，取代盒子上的數字；兩個都留空就顯示數字。",
    "    - 封面文字可以寫國字、注音、拼音或英文；圖片的寫法和「禮物」的圖片一樣。",
    "    - 封面是照盒子的位置（第 1 個、第 2 個……）放的，禮物每局會重新打亂，所以同一個封面底下的禮物每局都不一樣。",
    "・「設定」的「字型」決定封面文字的字型：",
    "    - 一般字型：國字、拼音、英文。",
    "    - 注音・楷書／注音・圓體／注音・芫荽：國字旁邊加注音。",
    "    - 只有注音：只顯示注音。",
    "・破音字：在字後面用括號寫讀音，例如 長[ㄓㄤˇ]大、音樂[ㄩㄝˋ]、銀行[ㄏㄤˊ]。",
    "    - 括號可以用 [ ]、( )、（ ）或【 】；一聲不用寫聲調，輕聲的「˙」寫前面或後面都可以。",
    "    - 沒寫讀音的破音字，會顯示最常見的讀音。",
    "    - 也可以用 ToneOZ 選音編輯器（toneoz.com/ime）選好讀音後，直接複製貼上。",
    "・圖片填檔名時：",
    "    - 「設定」有填圖片資料夾（Dropbox 資料夾的分享連結）→ 到那個資料夾找圖。",
    "    - 沒有填 → 匯入時會請你從電腦選取圖片，依檔名配對。",
    "・檔名要完全一樣（包含 .jpg / .png），大小寫不拘；圖片要直接放在那個資料夾裡，不能在子資料夾。",
    "・Google Drive 不能只寫檔名，要貼每張圖的分享連結（共用設定為「知道連結的任何人」）。",
    "・圖片建議小於 200 KB，太大會讓遊戲載入很慢。",
  ];

  const gifts: [string, string, string, number | null][] = [
    ["⭐ 貼紙", "", "好禮物", 2],
    ["🍬 糖果", "", "好禮物", 2],
    ["🪙 三個金幣", "", "好禮物", null],
    ["🎤 唱一首歌", "", "不好的禮物", null],
    ["😜 做鬼臉", "", "不好的禮物", null],
    ["炸彈", "", "炸彈", null],
  ];

  // A few covers to show what can go there; the other boxes show their numbers.
  const sampleCovers = ["蘋果", "長[ㄓㄤˇ]大", "píngguǒ", "apple"];

  const kinds = KINDS.map((k) => k.name);
  const colorNames = BOX_COLORS.map((c) => c.name);
  // Numbers, not text, so a typed number matches its dropdown.
  const amounts = Array.from({ length: 10 }, (_, i) => i + 1);
  const modes = COLOR_MODES.map((m) => m.name);
  const fonts = FONTS.map((f) => f.name);
  const options: (string | number)[][] = [kinds, SOUND_FILES, modes, colorNames, amounts, fonts];
  const optionRows = Math.max(...options.map((o) => o.length));
  // Choices for the drop-down lists, one column each, on a hidden sheet.
  const choices = (col: string, list: unknown[]) => listRef(OPTIONS_SHEET, col, 2, list.length + 1);
  const GIFT_ROWS = 200;

  await saveWorkbook(
    [
      {
        sheet: HELP_SHEET,
        columns: [{ width: 90 }],
        data: help.map((line, i) => [i === 0 ? { value: line, fontWeight: "bold" as const, fontSize: 16 } : line]),
      },
      {
        sheet: GIFTS_SHEET,
        columns: [{ width: 24 }, { width: 30 }, { width: 14 }, { width: 8 }, { width: 14 }],
        stickyRowsCount: 1,
        data: [
          ["名稱", "圖片", "種類", "數量", "音效"].map((h) => ({ value: h, ...bold })),
          ...gifts.map(([name, image, kind, amount]) => [name, image, kind, amount, ""]),
        ],
      },
      {
        sheet: SETTINGS_SHEET,
        columns: [{ width: 16 }, { width: 50 }, { width: 50 }],
        data: [
          [{ value: "項目", ...bold }, { value: "內容", ...bold }, { value: "說明", ...bold }],
          [FOLDER_LABEL, "", { value: "貼上 Dropbox 資料夾的分享連結；圖片放在自己電腦的話就留空", textColor: "#6b7280" }],
          [COLOR_MODE_LABEL, "隨機", { value: "選「自訂」時，用「禮物盒」工作表的顏色", textColor: "#6b7280" }],
          [FONT_LABEL, fonts[0], { value: "禮物盒封面文字的字型；國字加注音請選「注音・」開頭的字型", textColor: "#6b7280" }],
        ],
      },
      {
        sheet: BOXES_SHEET,
        columns: [{ width: 10 }, { width: 12 }, { width: 20 }, { width: 30 }],
        stickyRowsCount: 1,
        data: [
          ["盒子", "顏色", "封面文字", "封面圖片"].map((h) => ({ value: h, ...bold })),
          ...Array.from({ length: COLOR_ROWS }, (_, i) => [i + 1, colorNames[i % colorNames.length], sampleCovers[i] ?? "", ""]),
        ],
      },
      {
        sheet: OPTIONS_SHEET,
        data: [
          ["種類", "音效", "顏色模式", "顏色", "數量", "字型"].map((h) => ({ value: h, ...bold })),
          ...Array.from({ length: optionRows }, (_, r) => options.map((list) => list[r] ?? "")),
        ],
      },
    ],
    "開禮物範本.xlsx",
    {
      dropdowns: [
        { sheet: GIFTS_SHEET, range: `C2:C${GIFT_ROWS}`, source: choices("A", kinds) },
        { sheet: GIFTS_SHEET, range: `D2:D${GIFT_ROWS}`, source: choices("E", amounts), allowOther: true },
        { sheet: GIFTS_SHEET, range: `E2:E${GIFT_ROWS}`, source: choices("B", SOUND_FILES) },
        { sheet: SETTINGS_SHEET, range: "B3", source: choices("C", modes) },
        { sheet: SETTINGS_SHEET, range: "B4", source: choices("F", fonts) },
        { sheet: BOXES_SHEET, range: `B2:B${COLOR_ROWS + 1}`, source: choices("D", colorNames) },
      ],
      hidden: [OPTIONS_SHEET],
    },
  );
}
