// 抽牌: each deck is a deck of playing cards, or the teacher's own cards (words or pictures) imported from Excel.

import { listRef, saveWorkbook } from "./excel";
import { FONTS, type FontId, fontFromSetting } from "./fonts";
import { type Cell, directLink, fileInFolder, isDriveFolder } from "./lessons";
import { applyReadings, loadPolyphones } from "./zhuyin";

export const MAX_DECKS = 2;
export const MIN_CARDS = 2;
export const MAX_CARDS = 200;

export type CardSetup = {
  fileName: string | null;
  // The imported cards of 第一副 and 第二副; null is a deck of playing cards.
  decks: (Cell[] | null)[];
  // Font for the imported cards' text, as in 圈圈叉叉.
  font: FontId;
};

export const DEFAULT_SETUP: CardSetup = { fileName: null, decks: [null, null], font: "plain" };

const HELP_SHEET = "說明";
const SETTINGS_SHEET = "設定";
const DATA_SHEET = "卡片";
const OPTIONS_SHEET = "選項";

const FOLDER_LABEL = "圖片資料夾";
const FONT_LABEL = "字型";

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

const isImageFile = (s: string) => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(s);

// "1", "第1副", "第一副", "第 2 副" or a number → 1, 2, …
function deckNumber(value: string): number | undefined {
  const digits = value.replace(/[第副\s]/g, "").replace(/^一$/, "1").replace(/^二$|^兩$/, "2");
  const n = Number(digits);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export type ParsedCards = {
  setup: CardSetup;
  // Image file names that must come from the teacher's computer (no folder link was given).
  localNames: string[];
  warnings: string[];
  // Why nothing could be imported.
  error?: string;
};

export async function parseCards(file: File): Promise<ParsedCards> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const [sheets, polyphones] = await Promise.all([readXlsxFile(file), loadPolyphones()]);
  const warnings: string[] = [];
  const setup: CardSetup = { ...DEFAULT_SETUP, fileName: file.name, decks: [null, null] };
  const sheetRows = (name: string) => sheets.find((s) => s.sheet.trim() === name)?.data ?? [];

  // 長[ㄓㄤˇ] → 長 + the variation selector the 注音 fonts use for that reading.
  const readings = (raw: string, where: string) => {
    const { text, problems } = applyReadings(raw, polyphones);
    for (const p of problems)
      warnings.push(`${where}的「${raw}」：「${p.char}」沒有「${p.reading}」這個讀音，可以寫：${p.options.join("、")}。`);
    return text;
  };

  let folder = "";
  for (const row of sheetRows(SETTINGS_SHEET)) {
    const label = cellText(row[0]);
    const value = cellText(row[1]);
    if (!value) continue;
    if (label === FOLDER_LABEL) folder = value;
    else if (label === FONT_LABEL) {
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

  // The 卡片 sheet, or else the first sheet that isn't one of the others.
  const skip: string[] = [HELP_SHEET, SETTINGS_SHEET, OPTIONS_SHEET];
  const dataSheet =
    sheets.find((s) => s.sheet.trim() === DATA_SHEET) ?? sheets.find((s) => !skip.includes(s.sheet.trim()));
  const rows = (dataSheet?.data ?? []).filter((row) => row.some((v) => cellText(v) !== ""));

  const header = rows[0]?.map(cellText) ?? [];
  // Exact names, so a first card like 第一副／文字遊戲 isn't taken for the header.
  const col = (name: string) => header.indexOf(name);
  const hasHeader = col("副") !== -1 || col("文字") !== -1 || col("圖片") !== -1;
  const cols = hasHeader ? { deck: col("副"), text: col("文字"), image: col("圖片") } : { deck: 0, text: 1, image: 2 };
  const at = (row: unknown[], i: number) => (i === -1 ? "" : cellText(row[i]));

  const byDeck: Cell[][] = Array.from({ length: MAX_DECKS }, () => []);
  for (const [r, row] of (hasHeader ? rows.slice(1) : rows).entries()) {
    let text = at(row, cols.text);
    let img = at(row, cols.image);
    // A picture's file name written in the text column: treat it as the picture.
    if (!img && isImageFile(text)) [img, text] = [text, ""];
    if (!text && !img) continue;
    const where = `「${DATA_SHEET}」第 ${r + (hasHeader ? 2 : 1)} 列`;

    // No 副 column, or left blank: 第一副.
    const deckText = at(row, cols.deck);
    const n = deckText ? deckNumber(deckText) : 1;
    if (n === undefined || n > MAX_DECKS) {
      warnings.push(`${where}的副「${deckText}」看不懂，這一列沒有匯入。請填 1 或 2。`);
      continue;
    }
    byDeck[n - 1].push(withImage(readings(text, where), img, where));
  }

  byDeck.forEach((cards, i) => {
    if (cards.length === 0) return;
    if (cards.length < MIN_CARDS) {
      warnings.push(`第 ${i + 1} 副只有 ${cards.length} 張，每一副至少要 ${MIN_CARDS} 張，這一副沒有匯入，還是用撲克牌。`);
      return;
    }
    if (cards.length > MAX_CARDS) {
      warnings.push(`第 ${i + 1} 副有 ${cards.length} 張，每一副最多 ${MAX_CARDS} 張，只用前 ${MAX_CARDS} 張。`);
      cards = cards.slice(0, MAX_CARDS);
    }
    setup.decks[i] = cards;
  });

  // Only pictures still in use need picking.
  const used = new Set(setup.decks.flatMap((d) => d?.map((c) => c.imageName) ?? []));
  const names = [...localNames].filter((n) => used.has(n));

  const error = setup.decks.every((d) => d === null)
    ? `這個檔案沒有找到卡片，每一副至少要 ${MIN_CARDS} 張。請用範本的格式：「${DATA_SHEET}」工作表第一列是「副」「文字」「圖片」。`
    : undefined;

  return { setup, localNames: names, warnings, error };
}

const bold = { fontWeight: "bold", backgroundColor: "#fce7f3" } as const;
const hint = (value: string) => ({ value, textColor: "#6b7280" });

export async function downloadCardTemplate() {
  const help = [
    "「抽牌」範本",
    "",
    "・有下拉選單的格子，點一下右邊的小箭頭就能選。",
    "・「卡片」工作表每列一張卡片：",
    "    - 副：這張卡片放在第 1 副還是第 2 副。只填第 1 副的話，第 2 副還是撲克牌。",
    "    - 文字：卡片上的字，可以寫國字、注音、拼音或英文，也可以加表情符號。有圖片的話可以留空。",
    "    - 圖片：檔名（例如 apple.png）或完整網址；留空就只顯示文字。圖片和文字都有的話，文字寫在圖片下面。",
    `    - 每一副 ${MIN_CARDS} 到 ${MAX_CARDS} 張；同一副的卡片不用排在一起，抽牌時會隨機排列。`,
    "    - 同一張卡片想放兩張，就寫兩列。",
    "・「設定」的「字型」決定卡片上的字型：",
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

  const sample: [number, string][] = [
    [1, "我"],
    [1, "你"],
    [1, "他"],
    [1, "老師"],
    [1, "小狗"],
    [2, "吃飯"],
    [2, "唱歌"],
    [2, "跑步"],
    [2, "看書"],
    [2, "睡覺"],
  ];

  // Numbers, not text, so a typed number matches its dropdown.
  const deckNumbers = Array.from({ length: MAX_DECKS }, (_, i) => i + 1);
  const fonts = FONTS.map((f) => f.name);
  const options: (string | number)[][] = [deckNumbers, fonts];
  const optionRows = Math.max(...options.map((o) => o.length));
  // Choices for the drop-down lists, one column each, on a hidden sheet.
  const choices = (col: string, list: unknown[]) => listRef(OPTIONS_SHEET, col, 2, list.length + 1);
  const DATA_ROWS = MAX_CARDS * MAX_DECKS + 1;

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
        data: [["副", "文字", "圖片"].map((h) => ({ value: h, ...bold })), ...sample.map(([n, text]) => [n, text, ""])],
      },
      {
        sheet: SETTINGS_SHEET,
        columns: [{ width: 16 }, { width: 50 }, { width: 50 }],
        data: [
          [{ value: "項目", ...bold }, { value: "內容", ...bold }, { value: "說明", ...bold }],
          [FOLDER_LABEL, "", hint("貼上 Dropbox 資料夾的分享連結；圖片放在自己電腦的話就留空")],
          [FONT_LABEL, fonts[0], hint("卡片上的字型；國字加注音請選「注音・」開頭的；簡體和拼音會自動轉換")],
        ],
      },
      {
        sheet: OPTIONS_SHEET,
        data: [
          ["副", "字型"].map((h) => ({ value: h, ...bold })),
          ...Array.from({ length: optionRows }, (_, r) => options.map((list) => list[r] ?? "")),
        ],
      },
    ],
    "抽牌範本.xlsx",
    {
      dropdowns: [
        { sheet: DATA_SHEET, range: `A2:A${DATA_ROWS}`, source: choices("A", deckNumbers) },
        { sheet: SETTINGS_SHEET, range: "B3", source: choices("B", fonts) },
      ],
      hidden: [OPTIONS_SHEET],
    },
  );
}
