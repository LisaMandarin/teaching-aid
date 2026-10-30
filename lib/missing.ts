// What is Missing? 少了什麼: cards spread over the board, and the ones the teacher marked disappear.

import { listRef, saveWorkbook } from "./excel";
import { FONTS } from "./fonts";
import { isCell, shuffle } from "./lessons";

export type MissingItem = {
  id: string;
  text: string;
  image: string | null;
  imageName?: string;
  // The card's center, as a percentage of the board.
  x: number;
  y: number;
  // Disappears when the teacher presses the button.
  missing: boolean;
};

export type MissingGroup = { id: string; name: string; items: MissingItem[] };

type Spot = { x: number; y: number };

// Not crypto.randomUUID(): it's missing on plain-http LAN addresses, which classrooms often use.
export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Share of a grid square a card fills; what's left is room to sit off-center, so the board doesn't look like a table.
const CARD_SHARE = 0.72;

// The board is wider than tall, so the grid is too. Always two rows, or a few cards would be as tall as the board.
function gridFor(count: number) {
  const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.6)));
  return { cols, rows: Math.max(2, Math.ceil(count / cols)) };
}

// A card's size as a percentage of the board, for a board of `count` cards.
export function cardSize(count: number) {
  const { cols, rows } = gridFor(count);
  return { width: (100 / cols) * CARD_SHARE, height: (100 / rows) * CARD_SHARE };
}

// A spot where the whole card stays on the board.
export function keepOnBoard({ x, y }: Spot, count: number): Spot {
  const { width, height } = cardSize(count);
  return {
    x: Math.min(100 - width / 2, Math.max(width / 2, x)),
    y: Math.min(100 - height / 2, Math.max(height / 2, y)),
  };
}

// One random square each, so cards never overlap.
export function scatter(count: number): Spot[] {
  const { cols, rows } = gridFor(count);
  const squares = shuffle(Array.from({ length: cols * rows }, (_, i) => i)).slice(0, count);
  const offset = () => ((1 - CARD_SHARE) / 2) * (Math.random() * 2 - 1);
  return squares.map((square) => ({
    x: ((square % cols) + 0.5 + offset()) * (100 / cols),
    y: (Math.floor(square / cols) + 0.5 + offset()) * (100 / rows),
  }));
}

// The pairs of cards that touch at the size a board of `count` cards gives them, as "i-j" indexes into `items`.
function touchingPairs(items: MissingItem[], count: number) {
  const { width, height } = cardSize(count);
  const spots = items.map((item) => keepOnBoard(item, count));
  const pairs = new Set<string>();
  spots.forEach((a, i) => {
    for (let j = i + 1; j < spots.length; j++)
      if (Math.abs(a.x - spots[j].x) < width && Math.abs(a.y - spots[j].y) < height) pairs.add(`${i}-${j}`);
  });
  return pairs;
}

const scattered = (items: MissingItem[]) => {
  const spots = scatter(items.length);
  return items.map((item, i) => ({ ...item, ...spots[i] }));
};

// Cards change size with their number, so a change in number can push cards together.
// Pairs the teacher already overlapped by dragging don't count: only a pair that was apart scatters the board.
function pushedTogether(items: MissingItem[], before: number, after: number) {
  const touching = touchingPairs(items, before);
  return [...touchingPairs(items, after)].some((pair) => !touching.has(pair));
}

export function withoutCard(items: MissingItem[], id: string): MissingItem[] {
  const left = items.filter((item) => item.id !== id);
  return pushedTogether(left, items.length, left.length) ? scattered(left) : left;
}

// The cards with a new one added where it fits, as far from the others as possible: they stay where the teacher put
// them. With no room left, or when the new size pushes them together, the whole board is scattered again.
export function withNewCard(items: MissingItem[], card: Omit<MissingItem, "x" | "y">): MissingItem[] {
  const count = items.length + 1;
  const { width, height } = cardSize(count);
  const others = items.map((item) => keepOnBoard(item, count));
  const fits = ({ x, y }: Spot) => others.every((o) => Math.abs(o.x - x) >= width || Math.abs(o.y - y) >= height);
  const room = ({ x, y }: Spot) => Math.min(...others.map((o) => Math.hypot(o.x - x, o.y - y)));

  const spots: Spot[] = [];
  for (let x = width / 2; x <= 100 - width / 2; x += 2)
    for (let y = height / 2; y <= 100 - height / 2; y += 2) if (fits({ x, y })) spots.push({ x, y });
  if (spots.length > 0 && !pushedTogether(items, items.length, count)) {
    const best = spots.reduce((a, b) => (room(b) > room(a) ? b : a));
    return [...items, { ...card, ...best }];
  }

  return scattered([...items, { ...card, x: 0, y: 0 }]);
}

const isSpot = (v: unknown) => Number.isFinite((v as Spot)?.x) && Number.isFinite((v as Spot)?.y);

// Groups read back from saved data; null if any of it isn't what a group should be.
export function groupsFrom(v: unknown): MissingGroup[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  // The board finds cards by id, so two sharing one would move and disappear together.
  const ids = new Set<string>();
  for (const group of v as MissingGroup[]) {
    if (typeof group?.id !== "string" || typeof group.name !== "string" || !Array.isArray(group.items) || ids.has(group.id))
      return null;
    ids.add(group.id);
    for (const item of group.items) {
      if (!isCell(item) || typeof item.id !== "string" || !isSpot(item) || typeof item.missing !== "boolean" || ids.has(item.id))
        return null;
      ids.add(item.id);
    }
  }
  return v;
}

const HELP_SHEET = "說明";
const SETTINGS_SHEET = "設定";
const OPTIONS_SHEET = "選項";
const FOLDER_LABEL = "圖片資料夾";
const FONT_LABEL = "字型";

const bold = { fontWeight: "bold", backgroundColor: "#e0e7ff" } as const;

// The template's sample groups, one sheet each.
const SAMPLE_GROUPS = [
  {
    sheet: "第一組",
    rows: [
      ["蘋果", "", "Y"],
      ["香蕉", "", "N"],
      ["西瓜", "", "N"],
      ["葡萄", "", "N"],
      ["草莓", "", "N"],
      ["橘子", "", "N"],
    ],
  },
  {
    sheet: "第二組",
    rows: [
      ["小狗", "dog.jpg", "N"],
      ["小貓", "cat.jpg", "Y"],
      ["小鳥", "https://example.com/bird.jpg", "Y"],
      ["小魚", "", "N"],
      ["烏龜", "", "N"],
      ["兔子", "", "N"],
    ],
  },
];

export async function downloadMissingTemplate() {
  const help = [
    "「What is Missing? 少了什麼」範本",
    "",
    "・每個素材工作表是一組，一次玩一組，用 ◀ ▶ 或鍵盤左右鍵換組。",
    "・工作表名稱就是組名；可以新增、複製或改名工作表，組的順序和工作表順序相同。",
    "・每個素材工作表中，每列會成為一張卡片，匯入後隨機放在黑板上。建議一組 6 到 12 張。",
    "・「文字」和「圖片」可以只填一種，也可以兩種都填。",
    "・「消失」用下拉選單選：Y 是按下按鈕後會消失的卡片，N 或留空是留在黑板上的卡片。",
    "    - 匯入後也可以到「⚙️ 設定」改。",
    "・破音字可在字後標記讀音，例如：長[ㄓㄤˇ]大、音樂[ㄩㄝˋ]、銀行[ㄏㄤˊ]。",
    `・在「設定」工作表選擇字型：${FONTS.map((f) => f.name).join("、")}。`,
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
          ["", "↑ 從下拉選單選"],
        ],
      },
      ...SAMPLE_GROUPS.map(({ sheet, rows }) => ({
        sheet,
        columns: [{ width: 24 }, { width: 50 }, { width: 12 }],
        stickyRowsCount: 1,
        data: [[{ value: "文字", ...bold }, { value: "圖片", ...bold }, { value: "消失", ...bold }], ...rows],
      })),
      {
        sheet: OPTIONS_SHEET,
        data: [
          [{ value: "消失", ...bold }, { value: FONT_LABEL, ...bold }],
          ["Y", FONTS[0].name],
          ["N", FONTS[1].name],
          ...FONTS.slice(2).map((font) => ["", font.name]),
        ],
      },
    ],
    "少了什麼範本.xlsx",
    {
      dropdowns: [
        ...SAMPLE_GROUPS.map(({ sheet }) => ({ sheet, range: "C2:C200", source: listRef(OPTIONS_SHEET, "A", 2, 3) })),
        { sheet: SETTINGS_SHEET, range: "B4", source: listRef(OPTIONS_SHEET, "B", 2, FONTS.length + 1) },
      ],
      hidden: [OPTIONS_SHEET],
    },
  );
}
