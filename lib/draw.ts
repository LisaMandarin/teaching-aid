// 抽籤筒: a class list imported from Excel, drawn one name at a time.

import { rosterFont, rosterRows, saveRosterWorkbook } from "./excel";
import type { FontId } from "./fonts";
import { applyReadings, loadPolyphones } from "./zhuyin";

const NAME_HEADER = /學生|姓名|名字|name/i;

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

// `font` is the 字型 on the file's 設定 sheet, if it has one.
export async function parseNames(file: File): Promise<{ names: string[]; font?: FontId; warnings: string[] }> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const [sheets, polyphones] = await Promise.all([readXlsxFile(file), loadPolyphones()]);
  const warnings: string[] = [];
  const font = rosterFont(sheets, warnings);

  const rows = rosterRows(sheets, NAME_HEADER);

  // The names are under a 學生 / 姓名 header if there is one, otherwise in column A with no header.
  // So the 我的獎勵 file works here too.
  const header = rows[0]?.map(cellText) ?? [];
  const headerCol = header.findIndex((h) => NAME_HEADER.test(h));
  const col = headerCol === -1 ? 0 : headerCol;

  const names = (headerCol === -1 ? rows : rows.slice(1))
    .map((row) => cellText(row[col]))
    .filter((n) => n !== "")
    // 曾[ㄗㄥ] → 曾 with its reading picked, as in the other games.
    .map((raw) => {
      const { text, problems } = applyReadings(raw, polyphones);
      for (const p of problems)
        warnings.push(`「${raw}」：「${p.char}」沒有「${p.reading}」這個讀音，可以寫：${p.options.join("、")}。`);
      return text;
    });

  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length > 0) warnings.push(`名單裡有重複的名字：${dupes.join("、")}。每一個都會放進籤筒。`);

  return { names, font, warnings };
}

export function downloadNamesTemplate() {
  return saveRosterWorkbook({
    help: [
      "抽籤筒名單範本",
      "",
      "・在「名單」工作表，從第二列開始每列寫一位學生的名字。",
      "・在「設定」工作表選擇字型，名字可以顯示成繁體、注音、只有注音、簡體或漢語拼音。",
      "・破音字可在字後標記讀音，例如：曾[ㄗㄥ]小明。",
      "・「我的獎勵」的檔案也可以直接拿來當名單。",
    ],
    sheet: "名單",
    columns: [{ width: 20 }],
    header: ["學生"],
    rows: [["小明"], ["小華"], ["小美"]],
    font: "plain",
    fileName: "抽籤筒名單範本.xlsx",
  });
}
