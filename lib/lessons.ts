// Question banks for Tic-Tac-Toe, imported from an Excel file: one sheet per lesson.

import { FONTS, type FontId, fontFromSetting } from "./fonts";
import { drawScaled, keepsTransparency, loadImage } from "./images";
import { listRef, saveWorkbook } from "./excel";
import { applyReadings, loadPolyphones } from "./zhuyin";

export type Cell = {
  text: string;
  // An http(s) URL or a data: URL; null when the cell is text only.
  image: string | null;
  // The file name as written in Excel, shown when the image can't be loaded.
  imageName?: string;
  // Optional answer used by games that reveal whether a card is right or wrong.
  correct?: boolean;
};

export type Lesson = { name: string; items: Cell[] };

export const BOARD_SIZE = 9;

const HELP_SHEET = "說明";
const SETTINGS_SHEET = "設定";
const FOLDER_LABEL = "圖片資料夾";
const FONT_LABEL = "字型";
// Hidden sheet holding the choices for the template's drop-down lists.
const OPTIONS_SHEET = "選項";
// Uploaded images are shrunk so they fit comfortably in localStorage.
const MAX_IMAGE_SIZE = 400;

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const emptyCell = (): Cell => ({ text: "", image: null });

// Pick 9 random items for one round; short lessons are padded with blank cells.
export function drawBoard(lesson: Lesson): Cell[] {
  const picked = shuffle(lesson.items).slice(0, BOARD_SIZE);
  while (picked.length < BOARD_SIZE) picked.push(emptyCell());
  return picked;
}

export async function readImage(file: File): Promise<string> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error(`無法讀取圖片：${file.name}`);
  }
  const type = keepsTransparency(file.type) ? "image/png" : "image/jpeg";
  return drawScaled(img, MAX_IMAGE_SIZE).toDataURL(type, 0.85);
}

function isDropbox(url: URL) {
  return url.hostname === "dropbox.com" || url.hostname.endsWith(".dropbox.com");
}

// Share links open a preview page; make them return the image itself.
export function directLink(link: string): string {
  try {
    const url = new URL(link);
    if (isDropbox(url)) {
      url.searchParams.delete("dl");
      url.searchParams.set("raw", "1");
    }
    // drive.google.com/file/d/<id>/view or ...?id=<id> → Drive's thumbnail endpoint serves the image.
    if (url.hostname === "drive.google.com") {
      const id = url.pathname.match(/\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
    }
    return url.toString();
  } catch {
    return link;
  }
}

// A file inside a shared folder. For a Dropbox folder link, `preview=<name>&raw=1`
// returns that file's bytes (not an official API, but it works for scl/fo links).
export function fileInFolder(folder: string, name: string): string {
  try {
    const url = new URL(folder);
    if (isDropbox(url)) {
      url.searchParams.delete("dl");
      url.searchParams.delete("st");
      url.searchParams.set("preview", name);
      url.searchParams.set("raw", "1");
      return url.toString();
    }
    url.pathname = url.pathname.replace(/\/*$/, "/") + encodeURIComponent(name);
    return url.toString();
  } catch {
    return folder.replace(/\/*$/, "/") + encodeURIComponent(name);
  }
}

// A Google Drive folder can't be addressed by file name, and its link is a web page, not an image.
export const isDriveFolder = (link: string) => /drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(link);

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export type ParsedWorkbook = {
  lessons: Lesson[];
  // File names that must come from the user's computer (no folder link was given).
  localNames: string[];
  // Problems worth telling the teacher about; the import still goes ahead.
  warnings: string[];
  // From the 字型 row of the 設定 sheet, so everyone who imports the file sees the same font.
  font?: FontId;
};

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const [sheets, polyphones] = await Promise.all([readXlsxFile(file), loadPolyphones()]);

  const warnings: string[] = [];
  let folder = "";
  let font: FontId | undefined;
  const settings = sheets.find((s) => s.sheet.trim() === SETTINGS_SHEET);
  for (const row of settings?.data ?? []) {
    const label = cellText(row[0]);
    const value = cellText(row[1]);
    if (label.includes(FOLDER_LABEL)) folder = value;
    else if (label.includes(FONT_LABEL) && value) {
      font = fontFromSetting(value);
      if (!font) warnings.push(`「設定」的字型「${value}」看不懂，可以填：${FONTS.map((f) => f.name).join("、")}。`);
    }
  }

  if (isDriveFolder(folder)) {
    warnings.push("「設定」的圖片資料夾是 Google Drive 資料夾；Google Drive 不能用檔名找圖片，所以改成從電腦選取圖片。");
    folder = "";
  }

  const lessons: Lesson[] = [];
  const localNames = new Set<string>();

  for (const { sheet, data } of sheets) {
    const name = sheet.trim();
    if (name === HELP_SHEET || name === SETTINGS_SHEET || name === OPTIONS_SHEET) continue;

    const rows = data.filter((row) => row.some((v) => cellText(v) !== ""));
    if (rows.length === 0) continue;

    // Find the columns by their headers; fall back to A = text, B = image.
    const header = rows[0].map(cellText);
    let textCol = header.findIndex((h) => h.includes("文字"));
    let imageCol = header.findIndex((h) => h.includes("圖片"));
    const answerCol = header.findIndex((h) => /^(Y\s*\/\s*N|答案|正確)$/i.test(h));
    const hasHeader = textCol !== -1 || imageCol !== -1 || answerCol !== -1;
    if (textCol === -1) textCol = imageCol === 0 ? 1 : 0;
    if (imageCol === -1) imageCol = textCol === 1 ? 0 : 1;

    const items: Cell[] = [];
    for (const row of hasHeader ? rows.slice(1) : rows) {
      const raw = cellText(row[textCol]);
      const img = cellText(row[imageCol]);
      const answer = answerCol === -1 ? "" : cellText(row[answerCol]).toUpperCase();
      if (!raw && !img) continue;

      const correct = answer === "N" ? false : answer === "Y" ? true : undefined;
      if (answer && correct === undefined)
        warnings.push(`「${name}」的「${raw || img}」：Y/N 欄請填 Y 或 N，這張卡先當作 Y。`);

      // 長[ㄓㄤˇ] → 長 + the variation selector the 注音 fonts use for that reading.
      const { text, problems } = applyReadings(raw, polyphones);
      for (const p of problems)
        warnings.push(`「${name}」的「${raw}」：「${p.char}」沒有「${p.reading}」這個讀音，可以寫：${p.options.join("、")}。`);

      if (!img) items.push({ text, image: null, correct });
      else if (isDriveFolder(img)) {
        warnings.push(`「${name}」的「${text}」：圖片欄是 Google Drive 資料夾連結，請改貼那張圖片自己的分享連結。`);
        items.push({ text, image: null, correct });
      }
      else if (/^https?:\/\//i.test(img)) items.push({ text, image: directLink(img), imageName: img, correct });
      else if (folder) items.push({ text, image: fileInFolder(folder, img), imageName: img, correct });
      else {
        items.push({ text, image: null, imageName: img, correct });
        localNames.add(img);
      }
    }
    if (items.length > 0) lessons.push({ name, items });
  }

  return { lessons, localNames: [...localNames], warnings, font };
}

// Fill in images that were given as bare file names, matching the chosen files by name.
// Returns the names that had no matching file.
export async function attachLocalImages(lessons: Lesson[], files: File[]): Promise<string[]> {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  const loaded = new Map<string, string>();
  const missing = new Set<string>();

  for (const lesson of lessons) {
    for (const item of lesson.items) {
      if (item.image || !item.imageName) continue;
      const key = item.imageName.toLowerCase();
      if (!loaded.has(key)) {
        const file = byName.get(key);
        if (!file) {
          missing.add(item.imageName);
          continue;
        }
        try {
          loaded.set(key, await readImage(file));
        } catch {
          missing.add(item.imageName);
          continue;
        }
      }
      item.image = loaded.get(key)!;
    }
  }
  return [...missing];
}

const bold = { fontWeight: "bold", backgroundColor: "#e0e7ff" } as const;

export async function downloadTemplate() {
  const help = [
    "「圈圈叉叉」題目範本",
    "",
    "・一個工作表 = 一課。工作表名稱就是課名，可以自己新增、複製、改名。",
    "・每課第一列是標題「文字」「圖片」，從第二列開始每列一題。",
    "・一課至少 9 題；超過 9 題時，每局會隨機抽 9 題。",
    "・「文字」：注音、國字、詞語、拼音都可以。",
    "・破音字：在字後面用括號寫讀音，例如 長[ㄓㄤˇ]大、音樂[ㄩㄝˋ]、銀行[ㄏㄤˊ]。",
    "    - 括號可以用 [ ]、( )、（ ）或【 】；一聲不用寫聲調，輕聲的「˙」寫前面或後面都可以。",
    "    - 沒寫讀音的破音字，會顯示最常見的讀音。",
    "    - 也可以用 ToneOZ 選音編輯器（toneoz.com/ime）選好讀音後，直接複製貼上。",
    "    - 讀音寫錯時，匯入後會提醒你這個字有哪些讀音可以寫。",
    "・「圖片」可以填：",
    "    1. 檔名，例如 apple.png",
    "    2. 完整網址，例如 https://……/apple.png，或 Google Drive / Dropbox 單一檔案的分享連結",
    "    3. 留空：這一題只有文字",
    "・填檔名時：",
    "    - 「設定」工作表有填圖片資料夾（Dropbox 資料夾的分享連結）→ 到那個資料夾找圖。",
    "    - 沒有填 → 匯入時會請你從電腦選取圖片，依檔名配對。",
    "・檔名要完全一樣（包含 .jpg / .png），大小寫不拘；圖片要直接放在那個資料夾裡，不能在子資料夾。",
    "・Google Drive 不能只寫檔名，要貼每張圖的分享連結（共用設定為「知道連結的任何人」）。",
    "・「設定」的「字型」決定遊戲顯示的字型，其他老師匯入同一個檔案也會看到一樣的字型：",
    `    ${FONTS.map((f) => f.name).join("、")}`,
    "    （選簡體或漢語拼音時，照樣打繁體字就好，遊戲會自動轉成簡體、加上拼音；寫注音的破音字讀音也會用在拼音上。）",
    "    （Excel 裡儲存格自己設定的字型不會帶進遊戲。）",
    "・圖片建議小於 200 KB，太大會讓遊戲載入很慢。",
    "・「說明」和「設定」這兩個工作表不會被當成題目。",
  ];

  const lesson = (words: string[]) => [
    [{ value: "文字", ...bold }, { value: "圖片", ...bold }],
    ...words.map((w) => [w, ""]),
  ];

  await saveWorkbook(
    [
    {
      sheet: HELP_SHEET,
      columns: [{ width: 90 }],
      data: help.map((line, i) => [i === 0 ? { value: line, fontWeight: "bold" as const, fontSize: 16 } : line]),
    },
    {
      sheet: SETTINGS_SHEET,
      columns: [{ width: 16 }, { width: 90 }],
      data: [
        [{ value: "項目", ...bold }, { value: "內容", ...bold }],
        [FOLDER_LABEL, ""],
        ["", "↑ 貼上 Dropbox 資料夾的分享連結；圖片放在自己電腦的話就留空"],
        [FONT_LABEL, FONTS[1].name],
        ["", "↑ 從下拉選單選"],
      ],
    },
    {
      sheet: "第一課",
      columns: [{ width: 20 }, { width: 50 }],
      stickyRowsCount: 1,
      data: lesson(["ㄅ", "ㄆ", "ㄇ", "ㄈ", "ㄉ", "ㄊ", "ㄋ", "ㄌ", "ㄍ", "ㄎ", "ㄏ", "ㄐ"]),
    },
    {
      sheet: "第二課",
      columns: [{ width: 20 }, { width: 50 }],
      stickyRowsCount: 1,
      data: lesson(["蘋果", "香蕉", "西瓜", "葡萄", "草莓", "橘子", "芒果", "鳳梨", "桃子"]),
    },
    {
      sheet: "破音字範例",
      columns: [{ width: 20 }, { width: 50 }],
      stickyRowsCount: 1,
      data: lesson([
        "長[ㄓㄤˇ]大",
        "長短",
        "音樂[ㄩㄝˋ]",
        "快樂",
        "銀行[ㄏㄤˊ]",
        "行走",
        "睡著[ㄓㄠˊ]",
        "還[ㄏㄨㄢˊ]書",
        "重[ㄔㄨㄥˊ]新",
      ]),
    },
    {
      sheet: OPTIONS_SHEET,
      data: [[{ value: FONT_LABEL, ...bold }], ...FONTS.map((f) => [f.name])],
    },
    ],
    "圈圈叉叉題目範本.xlsx",
    {
      dropdowns: [{ sheet: SETTINGS_SHEET, range: "B4", source: listRef(OPTIONS_SHEET, "A", 2, FONTS.length + 1) }],
      hidden: [OPTIONS_SHEET],
    },
  );
}

export async function downloadQuickCheckTemplate() {
  const help = [
    "「Quick Check 快判卡」素材範本",
    "",
    "・在「素材」工作表中，每列會成為一張卡片。",
    "・「文字」和「圖片」可以只填一種，也可以兩種都填。",
    "・「Y/N」填 Y 代表正確，填 N 代表錯誤；點擊卡片後才會揭曉。",
    "・破音字可在字後標記讀音，例如：長[ㄓㄤˇ]大、音樂[ㄩㄝˋ]、銀行[ㄏㄤˊ]。",
    "・在「設定」工作表選擇字型，可顯示繁體、注音、只有注音、簡體或漢語拼音。",
    "・「圖片」可以填圖片檔名、完整網址，或單一圖片的 Google Drive / Dropbox 分享連結。",
    "・填圖片檔名時，匯入 Excel 後會請你從電腦選取圖片，系統會依檔名自動配對。",
    "・檔名要完全一樣（包含 .jpg / .png），大小寫不拘。",
    "・「設定」可填 Dropbox 圖片資料夾分享連結；有填時會直接到該資料夾找圖。",
    "・Google Drive 資料夾不能依檔名找圖；請改貼單一圖片分享連結，或從電腦選取圖片。",
  ];

  await saveWorkbook(
    [
      {
        sheet: HELP_SHEET,
        columns: [{ width: 90 }],
        data: help.map((line, i) => [i === 0 ? { value: line, fontWeight: "bold" as const, fontSize: 16 } : line]),
      },
      {
        sheet: SETTINGS_SHEET,
        columns: [{ width: 16 }, { width: 90 }],
        data: [
          [{ value: "項目", ...bold }, { value: "內容", ...bold }],
          [FOLDER_LABEL, ""],
          ["", "↑ 可貼 Dropbox 資料夾分享連結；圖片放在電腦時留空"],
          [FONT_LABEL, FONTS[0].name],
        ],
      },
      {
        sheet: "素材",
        columns: [{ width: 24 }, { width: 50 }, { width: 12 }],
        stickyRowsCount: 1,
        data: [
          [{ value: "文字", ...bold }, { value: "圖片", ...bold }, { value: "Y/N", ...bold }],
          ["早餐", "", "Y"],
          ["午餐", "lunch.jpg", "Y"],
          ["晚餐", "https://example.com/dinner.jpg", "N"],
          ["點心", "", "N"],
        ],
      },
      {
        sheet: OPTIONS_SHEET,
        data: [
          [{ value: "Y/N", ...bold }, { value: FONT_LABEL, ...bold }],
          ["Y", FONTS[0].name],
          ["N", FONTS[1].name],
          ...FONTS.slice(2).map((font) => ["", font.name]),
        ],
      },
    ],
    "快判卡素材範本.xlsx",
    {
      dropdowns: [
        { sheet: "素材", range: "C2:C200", source: listRef(OPTIONS_SHEET, "A", 2, 3) },
        { sheet: SETTINGS_SHEET, range: "B4", source: listRef(OPTIONS_SHEET, "B", 2, FONTS.length + 1) },
      ],
      hidden: [OPTIONS_SHEET],
    },
  );
}
