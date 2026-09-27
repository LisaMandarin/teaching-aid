// 我的獎勵: students and the gold coins they've collected, imported from and saved back to Excel.

export type Student = {
  name: string;
  coins: number;
  // Coins when the file was imported, so the saved file can show what was earned this class.
  start: number;
};

export type Roster = { fileName: string; students: Student[] };

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export async function parseRoster(file: File): Promise<{ roster: Roster; warnings: string[] }> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  const warnings: string[] = [];

  // The first sheet that has something in it; the others (e.g. notes) are ignored.
  const rows =
    sheets.map((s) => s.data.filter((row) => row.some((v) => cellText(v) !== ""))).find((r) => r.length > 0) ?? [];

  // Find the columns by their headers; fall back to A = name, B = coins.
  const header = rows[0]?.map(cellText) ?? [];
  let nameCol = header.findIndex((h) => /學生|姓名|名字|name/i.test(h));
  let coinCol = header.findIndex((h) => /金幣|coin/i.test(h));
  const hasHeader = nameCol !== -1 || coinCol !== -1;
  if (nameCol === -1) nameCol = coinCol === 0 ? 1 : 0;
  if (coinCol === -1) coinCol = nameCol === 1 ? 0 : 1;

  const students: Student[] = [];
  for (const row of hasHeader ? rows.slice(1) : rows) {
    const name = cellText(row[nameCol]);
    if (!name) continue;
    const raw = cellText(row[coinCol]);
    let coins = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(coins) || coins < 0) {
      warnings.push(`「${name}」的金幣「${raw}」不是數字，先當成 0。`);
      coins = 0;
    }
    coins = Math.floor(coins);
    students.push({ name, coins, start: coins });
  }

  return { roster: { fileName: file.name, students }, warnings };
}

const bold = { fontWeight: "bold", backgroundColor: "#fef3c7" } as const;

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The saved file can be imported again next class: 學生 and 金幣 are read, 今天 is ignored.
export async function downloadRoster(roster: Roster) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile([
    {
      sheet: "我的獎勵",
      columns: [{ width: 20 }, { width: 12 }, { width: 12 }],
      stickyRowsCount: 1,
      data: [
        [{ value: "學生", ...bold }, { value: "金幣", ...bold }, { value: `今天 ${today()}`, ...bold }],
        ...roster.students.map((s) => [s.name, s.coins, s.coins - s.start]),
      ],
    },
  ]).toFile(`我的獎勵 ${today()}.xlsx`);
}

export async function downloadRosterTemplate() {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile([
    {
      sheet: "我的獎勵",
      columns: [{ width: 20 }, { width: 12 }],
      stickyRowsCount: 1,
      data: [
        [{ value: "學生", ...bold }, { value: "金幣", ...bold }],
        ["小明", 0],
        ["小華", 3],
        ["小美", 5],
      ],
    },
  ]).toFile("我的獎勵範本.xlsx");
}
