---
name: import-template-conventions
description: Conventions for this teaching-aid app's file-import and template ("範本") features — what format a game should accept when a teacher brings in data (vocabulary, quiz questions, gifts, rosters, lesson text...), how a downloadable template/sample file should be laid out, and when a Chinese-text field needs a font-choice option. Use this whenever adding a new "匯入"/upload feature to a game, changing what file type a game accepts, generating or editing a download*Template()/範本 function, or adding any field where a teacher types Chinese text that will show on the board/card. Push back toward this skill even if the request only mentions one of these (e.g. "let teachers upload an Excel file for X") without using the words "template" or "convention".
---

# Import & template conventions

This app has several games (TicTacToe 圈圈叉叉, QuickCheck 快判卡, GiftBoxes 開禮物, Rewards 我的獎勵,
NameDraw 抽籤筒, FillBlank 填空, ReadAloud 唸課文...), each letting a teacher bring their own data in.
They've converged on one shared shape, built on two shared helpers (`lib/excel.ts`, `lib/fonts.ts`).
Keeping a new or changed feature in that shape means a teacher who's used one game's template already
knows the next one, and whoever reads this code next isn't reverse-engineering a one-off format.

## Excel first, Word only as a real fallback, never .txt/.csv

When a teacher is importing a *list of things* — vocabulary, quiz questions, gift items, roster names,
reward entries — the data is naturally one row per item, and Excel is the only format here that can
actually carry the structure: a header row, named columns, multiple sheets (說明/設定/data), and
per-cell dropdown validation. A .txt or .csv file can't hold any of that, so every rule ends up
explained in prose instead of enforced by the format, and a Word document isn't built for rows and
dropdowns either. So: **default new row-shaped import features to Excel (.xlsx) only.** Add Word only
when there's a genuine reason (see the exception below) — never add .txt or .csv for this kind of data.

Reference implementations: `components/TicTacToe.tsx` + `lib/lessons.ts`, `components/QuickCheck.tsx`
(same `lib/lessons.ts`), `components/GiftBoxes.tsx` + `lib/gifts.ts`, `components/Rewards.tsx` +
`lib/rewards.ts`, `components/NameDraw.tsx` + `lib/draw.ts`. Each pairs a component (accept attribute,
upload button, "下載範本" button) with a lib file (`read*`/parse function + `download*Template()`).

### The exception: continuous prose isn't row-shaped

ReadAloud (唸課文) and FillBlank (填空) import a whole lesson text, not a list of records — and there
the Word format is doing real work: a teacher highlights words (→ 注音) and underlines words (→ blanks)
right in Word, which an Excel template can't reproduce without turning the lesson into one awkward row
per phrase/font change. For this shape of input, `lib/readAloud.ts`'s `readDocxFile` keeps Word as the
*only* upload format, and the live in-page editor (type or paste, then click a font button) plays the
role a template would for row data. Don't force an Excel path onto this kind of free-flowing text.

The test: data that's naturally a table of records → Excel. Text where formatting is attached to spans
of running prose rather than to fields → Word's markup (or the live editor) is doing something Excel
can't, so staying Word-only (or editor-only) there is correct, not a gap to fill.

## Matching an existing template's layout

Copy the shared skeleton (see `downloadTemplate()` in `lib/lessons.ts` for the fullest example) rather
than inventing a new one:

1. **說明 sheet** — plain-language instructions, one row per line, first row bold/larger as the title.
   Explain every column and every valid value — a teacher has no other documentation to check, so this
   sheet *is* the manual.
2. **設定 sheet** (when there's a document-wide setting, like 字型 or a shared image-folder link) — a
   項目/內容 (label/value) table, with a hint row underneath each value explaining what to do.
3. **One or more data sheets** — bold header row, one row per record, `stickyRowsCount: 1` so the header
   stays visible while scrolling.
4. **選項 sheet** — hidden, holds the literal choice lists a dropdown points at (e.g. font names). Never
   shown to the teacher directly.

Build and save the workbook with `saveWorkbook` from `lib/excel.ts` — it wraps `write-excel-file` and
patches in the `<dataValidation>` XML for dropdowns (which `write-excel-file` can't produce on its own)
and hides sheets. Point a dropdown at the 選項 sheet with `listRef(sheet, col, firstRow, lastRow)`.
Don't hand-roll XLSX XML or add another Excel library — this is already solved once, here.

Name the downloaded file `"<遊戲名稱>範本.xlsx"`, matching the existing `抽籤筒名單範本.xlsx`,
`我的獎勵範本.xlsx`, `開禮物範本.xlsx`, `圈圈叉叉題目範本.xlsx`, `快判卡素材範本.xlsx`.

## Any Chinese-text field a teacher fills in needs a font choice

A teacher might want 注音 for beginners, 簡體 for simplified-script students, or 拼音 — not just plain
繁體 — for *any* text that ends up on a board, card, or cell. So never hardcode plain 繁體 as the only
option for teacher-provided text; give it a 字型 (font) choice next to it.

- The canonical list is `lib/fonts.ts`'s `FONTS` (id, display name, CSS family, aliases) — import it,
  don't duplicate it.
- In a template, make 字型 a dropdown sourced from the 選項 sheet, built from `FONTS.map(f => f.name)`,
  exactly like the 設定 sheet's 字型 row in `lib/lessons.ts`. This is the same reasoning behind this
  project's existing rule that any field where a teacher picks from a fixed set of values belongs in a
  dropdown, not free text (see `lib/excel.ts`'s `Dropdown` type) — a font choice is one instance of that.
- When parsing the file back, resolve the typed value with `fontFromSetting()` rather than comparing
  strings directly — it also accepts older alias names, so templates from earlier versions of a game
  keep working after `FONTS` changes.
- In the live UI (not just the template), reuse the same `FONTS` array for font buttons/selects, the way
  `FillBlank.tsx`, `ReadAloud.tsx`, and `QuickCheck.tsx` already do, so "what fonts exist" has one source
  of truth everywhere.

## Checklist for a new or changed import feature

- [ ] Row-shaped data → .xlsx only. Free-flowing prose → Word (or the live editor) is fine; say why in
      a comment if it's not obvious from the surrounding code.
- [ ] No .txt or .csv.
- [ ] Template has 說明 + (設定 if there's a document-wide setting) + data sheet(s) + hidden 選項, built
      via `saveWorkbook`/`listRef`.
- [ ] File named `"<遊戲名稱>範本.xlsx"`.
- [ ] Every teacher-facing Chinese-text field has a 字型 dropdown backed by `FONTS`, parsed back with
      `fontFromSetting`.
- [ ] Any other field where the teacher picks from a fixed set of values is also a dropdown.
