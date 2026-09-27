// Excel templates with drop-down lists. write-excel-file has no data validation, so the
// dropdowns are added to its output afterwards by editing the sheets' XML.

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
