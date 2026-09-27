// 抽籤筒: a class list imported from Excel, drawn one name at a time.

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export async function parseNames(file: File): Promise<{ names: string[]; warnings: string[] }> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  const warnings: string[] = [];

  // The first sheet that has something in it; the others (e.g. notes) are ignored.
  const rows =
    sheets.map((s) => s.data.filter((row) => row.some((v) => cellText(v) !== ""))).find((r) => r.length > 0) ?? [];

  // The names are under a 學生 / 姓名 header if there is one, otherwise in column A with no header.
  // So the 我的獎勵 file works here too.
  const header = rows[0]?.map(cellText) ?? [];
  const headerCol = header.findIndex((h) => /學生|姓名|名字|name/i.test(h));
  const col = headerCol === -1 ? 0 : headerCol;

  const names = (headerCol === -1 ? rows : rows.slice(1)).map((row) => cellText(row[col])).filter((n) => n !== "");

  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length > 0) warnings.push(`名單裡有重複的名字：${dupes.join("、")}。每一個都會放進籤筒。`);

  return { names, warnings };
}

export async function downloadNamesTemplate() {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile([
    {
      sheet: "名單",
      columns: [{ width: 20 }],
      stickyRowsCount: 1,
      data: [[{ value: "學生", fontWeight: "bold", backgroundColor: "#fef3c7" }], ["小明"], ["小華"], ["小美"]],
    },
  ]).toFile("抽籤筒名單範本.xlsx");
}
