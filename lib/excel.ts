// Excel templates with drop-down lists. write-excel-file has no data validation, so the
// dropdowns are added to its output afterwards by editing the sheets' XML.

import { FONTS, type FontId, fontFromSetting } from "./fonts";

type SheetData = Parameters<typeof import("write-excel-file/browser").default>[0];

export type Dropdown = {
  sheet: string;
  // Cells that get the dropdown, e.g. "C2:C200".
  range: string;
  // Where the choices come from, e.g. "'選項'!$A$2:$A$4".
  source: string;
  // Let the teacher type something that isn't in the list (e.g. a URL), after a warning.
  allowOther?: boolean;
};

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// An absolute reference to a column of choices on another sheet, for Dropdown.source.
export const listRef = (sheet: string, col: string, firstRow: number, lastRow: number) =>
  `'${sheet}'!$${col}$${firstRow}:$${col}$${lastRow}`;

export async function saveWorkbook(
  sheets: SheetData,
  fileName: string,
  { dropdowns = [], hidden = [] }: { dropdowns?: Dropdown[]; hidden?: string[] } = {},
) {
  const [{ default: writeExcelFile }, { unzipSync, zipSync, strFromU8, strToU8 }] = await Promise.all([
    import("write-excel-file/browser"),
    import("fflate"),
  ]);
  const blob = await writeExcelFile(sheets).toBlob();
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));

  // write-excel-file names the sheet files sheet1.xml, sheet2.xml, … in the order given.
  const names = (Array.isArray(sheets) ? sheets : []).map((s) => ("sheet" in s ? String(s.sheet) : ""));

  names.forEach((name, i) => {
    const mine = dropdowns.filter((d) => d.sheet === name);
    if (mine.length === 0) return;
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    const rules = mine
      .map(
        (d) =>
          `<dataValidation type="list" allowBlank="1" showErrorMessage="1"${d.allowOther ? ' errorStyle="warning"' : ""} sqref="${d.range}"><formula1>${escapeXml(d.source)}</formula1></dataValidation>`,
      )
      .join("");
    const xml = strFromU8(files[path]).replace(
      "</sheetData>",
      `</sheetData><dataValidations count="${mine.length}">${rules}</dataValidations>`,
    );
    files[path] = strToU8(xml);
  });

  if (hidden.length > 0) {
    let workbook = strFromU8(files["xl/workbook.xml"]);
    for (const name of hidden)
      workbook = workbook.replace(`name="${escapeXml(name)}"/>`, `name="${escapeXml(name)}" state="hidden"/>`);
    files["xl/workbook.xml"] = strToU8(workbook);
  }

  const out = new Blob([zipSync(files) as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Reading a class list ----------

type ReadSheet = { sheet: string; data: unknown[][] };

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

// Sheets that explain the template rather than hold its data, e.g. 說明 or 學生名單匯入說明.
const NOT_DATA = /說明|設定|選項/;
// A header is a short label; a longer cell is a sentence that happens to mention it (請在這裡填學生…).
const HEADER_MAX = 8;

// The rows of the sheet holding a class list (抽籤筒, 我的獎勵): the first one whose header row has a
// `header` label, else the first with something in it. Help and settings sheets are skipped (an emptied
// template has none left, and its help text isn't a class list); blank rows are dropped.
export function rosterRows(sheets: ReadSheet[], header: RegExp): unknown[][] {
  const data = sheets
    .filter((s) => !NOT_DATA.test(s.sheet))
    .map((s) => s.data.filter((row) => row.some((v) => cellText(v) !== "")))
    .filter((rows) => rows.length > 0);
  if (data.length === 0) return [];
  const isHeader = (v: unknown) => cellText(v).length <= HEADER_MAX && header.test(cellText(v));
  return data.find((rows) => rows[0].some(isHeader)) ?? data[0];
}

const SETTINGS_SHEET = "設定";
const OPTIONS_SHEET = "選項";
const FONT_LABEL = "字型";
const bold = { fontWeight: "bold", backgroundColor: "#fef3c7" } as const;

// The 字型 picked on a class list's 設定 sheet; undefined if there's none (or it can't be read, with a warning).
export function rosterFont(sheets: ReadSheet[], warnings: string[]): FontId | undefined {
  const settings = sheets.find((s) => s.sheet.trim() === SETTINGS_SHEET);
  for (const row of settings?.data ?? []) {
    const value = cellText(row[1]);
    if (!cellText(row[0]).includes(FONT_LABEL) || !value) continue;
    const font = fontFromSetting(value);
    if (!font) warnings.push(`「設定」的字型「${value}」看不懂，可以填：${FONTS.map((f) => f.name).join("、")}。`);
    return font;
  }
  return undefined;
}

type Row = NonNullable<Parameters<typeof saveWorkbook>[0][number]["data"]>[number];

// A class list workbook in the shared template shape: 說明, 設定 (字型 dropdown), the list, hidden 選項.
export function saveRosterWorkbook(book: {
  help: string[];
  sheet: string;
  columns: { width: number }[];
  header: string[];
  rows: Row[];
  font: FontId;
  fileName: string;
}) {
  return saveWorkbook(
    [
      {
        sheet: "說明",
        columns: [{ width: 90 }],
        data: book.help.map((line, i) => [i === 0 ? { value: line, fontWeight: "bold" as const, fontSize: 16 } : line]),
      },
      {
        sheet: SETTINGS_SHEET,
        columns: [{ width: 16 }, { width: 40 }],
        data: [
          [{ value: "項目", ...bold }, { value: "內容", ...bold }],
          [FONT_LABEL, FONTS.find((f) => f.id === book.font)!.name],
          ["", "↑ 名字在黑板上用的字型（可選注音、簡體、漢語拼音）"],
        ],
      },
      {
        sheet: book.sheet,
        columns: book.columns,
        stickyRowsCount: 1,
        data: [book.header.map((h) => ({ value: h, ...bold })), ...book.rows],
      },
      { sheet: OPTIONS_SHEET, data: [[{ value: FONT_LABEL, ...bold }], ...FONTS.map((f) => [f.name])] },
    ],
    book.fileName,
    {
      dropdowns: [{ sheet: SETTINGS_SHEET, range: "B2", source: listRef(OPTIONS_SHEET, "A", 2, FONTS.length + 1) }],
      hidden: [OPTIONS_SHEET],
    },
  );
}
