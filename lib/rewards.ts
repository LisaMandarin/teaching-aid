// 我的獎勵: students and the gold coins they've collected, imported from and saved back to Excel.

import { rosterFont, rosterRows, saveRosterWorkbook } from "./excel";
import { type FontId, isFontId } from "./fonts";
import { applyReadings, loadPolyphones } from "./zhuyin";

export type Student = {
  name: string;
  coins: number;
  // Coins when the file was imported, so the saved file can show what was earned this class.
  start: number;
};

// `font` is how the names are shown on the board; it's saved in the downloaded file too.
export type Roster = { fileName: string; students: Student[]; font: FontId };

// A roster read back from saved data. A student saved without `start` counts from their coins.
export function rosterFrom(v: unknown): Roster | null {
  const r = v as Roster;
  if (!Array.isArray(r?.students)) return null;
  const students: Student[] = [];
  for (const s of r.students) {
    if (typeof s?.name !== "string" || !Number.isFinite(s.coins)) return null;
    students.push({ name: s.name, coins: s.coins, start: Number.isFinite(s.start) ? s.start : s.coins });
  }
  return { fileName: typeof r.fileName === "string" ? r.fileName : "", students, font: isFontId(r.font ?? null) ? r.font : "plain" };
}

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

// A file without a 字型 setting keeps `font`, the one in use now.
export async function parseRoster(file: File, font: FontId): Promise<{ roster: Roster; warnings: string[] }> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const [sheets, polyphones] = await Promise.all([readXlsxFile(file), loadPolyphones()]);
  const warnings: string[] = [];
  const fileFont = rosterFont(sheets, warnings);

  const rows = rosterRows(sheets, /學生|姓名|名字|name|金幣|coin/i);

  // Find the columns by their headers; fall back to A = name, B = coins.
  const header = rows[0]?.map(cellText) ?? [];
  let nameCol = header.findIndex((h) => /學生|姓名|名字|name/i.test(h));
  let coinCol = header.findIndex((h) => /金幣|coin/i.test(h));
  const hasHeader = nameCol !== -1 || coinCol !== -1;
  if (nameCol === -1) nameCol = coinCol === 0 ? 1 : 0;
  if (coinCol === -1) coinCol = nameCol === 1 ? 0 : 1;

  const students: Student[] = [];
  for (const row of hasHeader ? rows.slice(1) : rows) {
    const raw = cellText(row[nameCol]);
    if (!raw) continue;
    // 曾[ㄗㄥ] → 曾 with its reading picked, as in the other games.
    const { text: name, problems } = applyReadings(raw, polyphones);
    for (const p of problems)
      warnings.push(`「${raw}」：「${p.char}」沒有「${p.reading}」這個讀音，可以寫：${p.options.join("、")}。`);
    const coinText = cellText(row[coinCol]);
    let coins = coinText === "" ? 0 : Number(coinText);
    if (!Number.isFinite(coins) || coins < 0) {
      warnings.push(`「${raw}」的金幣「${coinText}」不是數字，先當成 0。`);
      coins = 0;
    }
    coins = Math.floor(coins);
    students.push({ name, coins, start: coins });
  }

  return { roster: { fileName: file.name, students, font: fileFont ?? font }, warnings };
}


const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const HELP = [
  "我的獎勵",
  "",
  "・在「我的獎勵」工作表，每列一位學生：「學生」寫名字，「金幣」寫目前有幾枚（留空就是 0）。",
  "・在「設定」工作表選擇字型，名字可以顯示成繁體、注音、只有注音、簡體或漢語拼音。",
  "・破音字可在字後標記讀音，例如：曾[ㄗㄥ]小明。",
  "・下課後在網站上按「下載紀錄」，下次上課上傳那個檔案就能接著累積；「今天」那欄只是紀錄，不會讀回來。",
];

// The saved file can be imported again next class: 學生, 金幣 and 字型 are read, 今天 is ignored.
// Names are written back with their 破音字 readings as picked (the selectors are invisible in Excel).
export function downloadRoster(roster: Roster) {
  return saveRosterWorkbook({
    help: HELP,
    sheet: "我的獎勵",
    columns: [{ width: 20 }, { width: 12 }, { width: 12 }],
    header: ["學生", "金幣", `今天 ${today()}`],
    rows: roster.students.map((s) => [s.name, s.coins, s.coins - s.start]),
    font: roster.font,
    fileName: `我的獎勵 ${today()}.xlsx`,
  });
}

export function downloadRosterTemplate() {
  return saveRosterWorkbook({
    help: HELP,
    sheet: "我的獎勵",
    columns: [{ width: 20 }, { width: 12 }],
    header: ["學生", "金幣"],
    rows: [["小明", 0], ["小華", 3], ["小美", 5]],
    font: "plain",
    fileName: "我的獎勵範本.xlsx",
  });
}
