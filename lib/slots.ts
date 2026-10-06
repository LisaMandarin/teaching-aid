// 拉霸機: 2–5 reels, each with 2–5 pictures or words, imported from Excel.

import { listRef, saveWorkbook } from "./excel";
import { FONTS, type FontId, fontFromSetting } from "./fonts";
import { type Cell, directLink, fileInFolder, isDriveFolder } from "./lessons";
import { applyReadings, loadPolyphones } from "./zhuyin";

export const MIN_REELS = 2;
export const MAX_REELS = 5;
export const MIN_CELLS = 2;
export const MAX_CELLS = 5;

// `title` is written above the reel, e.g. 誰／在哪裡／做什麼; blank shows nothing.
export type Reel = { title: string; cells: Cell[] };

export type SlotSetup = {
  fileName: string | null;
  reels: Reel[];
  // Font for the reels' text and titles, as in 圈圈叉叉.
  font: FontId;
};

const words = (title: string, list: string[]): Reel => ({ title, cells: list.map((text) => ({ text, image: null })) });

// A sentence frame to show what the reels are for.
export const DEFAULT_SETUP: SlotSetup = {
  fileName: null,
  reels: [
    words("誰", ["我", "老師", "小狗", "媽媽"]),
    words("在哪裡", ["在學校", "在公園", "在家"]),
    words("做什麼", ["吃飯", "唱歌", "跑步", "看書"]),
  ],
  font: "plain",
};

const HELP_SHEET = "說明";
const SETTINGS_SHEET = "設定";
const DATA_SHEET = "拉霸";
const OPTIONS_SHEET = "選項";

const FOLDER_LABEL = "圖片資料夾";
const FONT_LABEL = "字型";
// 第 1 欄標題 … 第 5 欄標題
const titleLabel = (n: number) => `第 ${n} 欄標題`;

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

const isImageFile = (s: string) => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(s);

// "1", "第1欄", "第 2 欄" or a number → 1–5.
function reelNumber(value: string): number | undefined {
  const digits = value.replace(/[第欄\s]/g, "");
  const n = Number(digits);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export type ParsedSlots = {
  setup: SlotSetup;
  // Image file names that must come from the teacher's computer (no folder link was given).
  localNames: string[];
  warnings: string[];
  // Why nothing could be imported, when there aren't enough reels.
  error?: string;
};

export async function parseSlots(file: File): Promise<ParsedSlots> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const [sheets, polyphones] = await Promise.all([readXlsxFile(file), loadPolyphones()]);
  const warnings: string[] = [];
  const setup: SlotSetup = { ...DEFAULT_SETUP, fileName: file.name, reels: [] };
  const sheetRows = (name: string) => sheets.find((s) => s.sheet.trim() === name)?.data ?? [];

  // 長[ㄓㄤˇ] → 長 + the variation selector the 注音 fonts use for that reading.
  const readings = (raw: string, where: string) => {
    const { text, problems } = applyReadings(raw, polyphones);
    for (const p of problems)
      warnings.push(`${where}的「${raw}」：「${p.char}」沒有「${p.reading}」這個讀音，可以寫：${p.options.join("、")}。`);
    return text;
  };

  let folder = "";
  const titles = new Map<number, string>();
  for (const row of sheetRows(SETTINGS_SHEET)) {
    const label = cellText(row[0]);
    const value = cellText(row[1]);
    if (!value) continue;
    if (label === FOLDER_LABEL) folder = value;
    else if (label === FONT_LABEL) {
      const font = fontFromSetting(value);
      if (font) setup.font = font;
      else warnings.push(`「設定」的字型「${value}」看不懂，可以填：${FONTS.map((f) => f.name).join("、")}。`);
    } else {
      const n = /^第\s*(\d+)\s*欄標題$/.exec(label)?.[1];
      if (n) titles.set(Number(n), readings(value, `「設定」${label}`));
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

  // The 拉霸 sheet, or else the first sheet that isn't one of the others.
  const skip: string[] = [HELP_SHEET, SETTINGS_SHEET, OPTIONS_SHEET];
  const dataSheet =
    sheets.find((s) => s.sheet.trim() === DATA_SHEET) ?? sheets.find((s) => !skip.includes(s.sheet.trim()));
  const rows = (dataSheet?.data ?? []).filter((row) => row.some((v) => cellText(v) !== ""));

  const header = rows[0]?.map(cellText) ?? [];
  const col = (name: string) => header.findIndex((h) => h.includes(name));
  const hasHeader = col("欄") !== -1;
  const cols = hasHeader ? { reel: col("欄"), text: col("文字"), image: col("圖片") } : { reel: 0, text: 1, image: 2 };
  const at = (row: unknown[], i: number) => (i === -1 ? "" : cellText(row[i]));

  // Cells by reel number, in the order they're written.
  const byReel = new Map<number, Cell[]>();
  const tooFar = new Set<string>();
  for (const [r, row] of (hasHeader ? rows.slice(1) : rows).entries()) {
    let text = at(row, cols.text);
    let img = at(row, cols.image);
    // A picture's file name written in the text column: treat it as the picture.
    if (!img && isImageFile(text)) [img, text] = [text, ""];
    if (!text && !img) continue;
    const where = `「${DATA_SHEET}」第 ${r + (hasHeader ? 2 : 1)} 列`;

    const reelText = at(row, cols.reel);
    const n = reelNumber(reelText);
    if (n === undefined) {
      warnings.push(`${where}的欄「${reelText}」看不懂，這一列沒有匯入。請填 1 到 ${MAX_REELS}。`);
      continue;
    }
    if (n > MAX_REELS) {
      tooFar.add(String(n));
      continue;
    }
    const cells = byReel.get(n) ?? [];
    cells.push(withImage(readings(text, where), img, where));
    byReel.set(n, cells);
  }
  if (tooFar.size > 0) warnings.push(`拉霸機最多 ${MAX_REELS} 欄，第 ${[...tooFar].join("、")} 欄沒有匯入。`);

  // Skipped numbers close up: reels 1, 2 and 4 become three reels side by side.
  for (const n of [...byReel.keys()].sort((a, b) => a - b)) {
    let cells = byReel.get(n)!;
    if (cells.length < MIN_CELLS) {
      warnings.push(`第 ${n} 欄只有 ${cells.length} 格，每一欄至少要 ${MIN_CELLS} 格，這一欄沒有匯入。`);
      continue;
    }
    if (cells.length > MAX_CELLS) {
      warnings.push(`第 ${n} 欄有 ${cells.length} 格，每一欄最多 ${MAX_CELLS} 格，只用前 ${MAX_CELLS} 格。`);
      cells = cells.slice(0, MAX_CELLS);
    }
    setup.reels.push({ title: titles.get(n) ?? "", cells });
  }

  // Only pictures still in use need picking.
  const used = new Set(setup.reels.flatMap((r) => r.cells.map((c) => c.imageName)));
  const names = [...localNames].filter((n) => used.has(n));

  const error =
    setup.reels.length < MIN_REELS
      ? `拉霸機至少要 ${MIN_REELS} 欄，每欄 ${MIN_CELLS} 到 ${MAX_CELLS} 格，這個檔案只找到 ${setup.reels.length} 欄。請用範本的格式：「${DATA_SHEET}」工作表第一列是「欄」「文字」「圖片」。`
      : undefined;

  return { setup, localNames: names, warnings, error };
}

const bold = { fontWeight: "bold", backgroundColor: "#fce7f3" } as const;
const hint = (value: string) => ({ value, textColor: "#6b7280" });

export async function downloadSlotTemplate() {
  const help = [
    "「拉霸機」範本",
    "",
    "・有下拉選單的格子，點一下右邊的小箭頭就能選。",
    `・拉霸機有 ${MIN_REELS} 到 ${MAX_REELS} 欄（直排的轉輪），每一欄有 ${MIN_CELLS} 到 ${MAX_CELLS} 格。拉一下，每一欄隨機停在其中一格。`,
    "・「拉霸」工作表每列一格：",
    `    - 欄：這一格放在第幾欄（1～${MAX_REELS}）。用到幾欄，拉霸機就有幾欄。`,
    "    - 文字：格子裡的字，可以寫國字、注音、拼音或英文，也可以加表情符號。有圖片的話可以留空。",
    "    - 圖片：檔名（例如 apple.png）或完整網址；留空就只顯示文字。圖片和文字都有的話，文字寫在圖片下面。",
    `    - 同一欄的格子不用排在一起；超過 ${MAX_CELLS} 格只用前 ${MAX_CELLS} 格，少於 ${MIN_CELLS} 格的欄不會匯入。`,
    "・「設定」的「第 1 欄標題」～「第 5 欄標題」：寫在每一欄上面的字，例如 誰、在哪裡、做什麼；留空就不顯示。",
    "・「設定」的「字型」決定格子和標題的字型：",
    "    - 繁體：照打的字顯示，國字、拼音、英文都可以。",
    "    - 注音・繁體楷書／注音・繁體圓體／注音・繁體芫荽：國字旁邊加注音。",
    "    - 只有注音：只顯示注音。",
    "    - 簡體：打繁體字就好，遊戲會自動轉成簡體。",
    "    - 簡體＋漢語拼音：簡體字上面加拼音。",
    "    - 只有漢語拼音：只顯示拼音。",
    "・破音字：在字後面用括號寫讀音，例如 長[ㄓㄤˇ]大、音樂[ㄩㄝˋ]、銀行[ㄏㄤˊ]。",
    "    - 括號可以用 [ ]、( )、（ ）或【 】；一聲不用寫聲調，輕聲的「˙」寫前面或後面都可以。",
    "    - 沒寫讀音的破音字，會顯示最常見的讀音（拼音字型會依詞語判斷讀音）。",
    "    - 也可以用 ToneOZ 選音編輯器（toneoz.com/ime）選好讀音後，直接複製貼上。",
    "・圖片填檔名時：",
    "    - 「設定」有填圖片資料夾（Dropbox 資料夾的分享連結）→ 到那個資料夾找圖。",
    "    - 沒有填 → 匯入時會請你從電腦選取圖片，依檔名配對。",
    "・檔名要完全一樣（包含 .jpg / .png），大小寫不拘；圖片要直接放在那個資料夾裡，不能在子資料夾。",
    "・Google Drive 不能只寫檔名，要貼每張圖的分享連結（共用設定為「知道連結的任何人」）。",
    "・圖片建議小於 200 KB，太大會讓遊戲載入很慢。",
  ];

  const sampleTitles = ["誰", "在哪裡", "做什麼", "", ""];
  const sample: [number, string][] = [
    [1, "我"],
    [1, "老師"],
    [1, "小狗"],
    [1, "媽媽"],
    [2, "在學校"],
    [2, "在公園"],
    [2, "在家"],
    [3, "吃飯"],
    [3, "唱歌"],
    [3, "跑步"],
    [3, "看書"],
  ];

  // Numbers, not text, so a typed number matches its dropdown.
  const reelNumbers = Array.from({ length: MAX_REELS }, (_, i) => i + 1);
  const fonts = FONTS.map((f) => f.name);
  const options: (string | number)[][] = [reelNumbers, fonts];
  const optionRows = Math.max(...options.map((o) => o.length));
  // Choices for the drop-down lists, one column each, on a hidden sheet.
  const choices = (col: string, list: unknown[]) => listRef(OPTIONS_SHEET, col, 2, list.length + 1);
  const DATA_ROWS = 100;

  await saveWorkbook(
    [
      {
        sheet: HELP_SHEET,
        columns: [{ width: 90 }],
        data: help.map((line, i) => [i === 0 ? { value: line, fontWeight: "bold" as const, fontSize: 16 } : line]),
      },
      {
        sheet: DATA_SHEET,
        columns: [{ width: 8 }, { width: 24 }, { width: 30 }],
        stickyRowsCount: 1,
        data: [["欄", "文字", "圖片"].map((h) => ({ value: h, ...bold })), ...sample.map(([n, text]) => [n, text, ""])],
      },
      {
        sheet: SETTINGS_SHEET,
        columns: [{ width: 16 }, { width: 50 }, { width: 50 }],
        data: [
          [{ value: "項目", ...bold }, { value: "內容", ...bold }, { value: "說明", ...bold }],
          [FOLDER_LABEL, "", hint("貼上 Dropbox 資料夾的分享連結；圖片放在自己電腦的話就留空")],
          [FONT_LABEL, fonts[0], hint("格子和標題的字型；國字加注音請選「注音・」開頭的；簡體和拼音會自動轉換")],
          ...sampleTitles.map((title, i) => [
            titleLabel(i + 1),
            title,
            hint(i === 0 ? "寫在這一欄上面的字；留空就不顯示" : ""),
          ]),
        ],
      },
      {
        sheet: OPTIONS_SHEET,
        data: [
          ["欄", "字型"].map((h) => ({ value: h, ...bold })),
          ...Array.from({ length: optionRows }, (_, r) => options.map((list) => list[r] ?? "")),
        ],
      },
    ],
    "拉霸機範本.xlsx",
    {
      dropdowns: [
        { sheet: DATA_SHEET, range: `A2:A${DATA_ROWS}`, source: choices("A", reelNumbers) },
        { sheet: SETTINGS_SHEET, range: "B3", source: choices("B", fonts) },
      ],
      hidden: [OPTIONS_SHEET],
    },
  );
}
