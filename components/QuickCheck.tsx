"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chalkboard from "./Chalkboard";
import { CellImage, pinyinLine, useHanzi } from "./CellContent";
import StorageNotice from "./StorageNotice";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import type { Hanzi, Piece } from "@/lib/hanzi";
import { playSoundFile, preloadSoundFile } from "@/lib/sounds";
import { keepBroken, readSaved, writeSaved } from "@/lib/storage";
import { isReadingMark, typedReadings } from "@/lib/zhuyin";
import {
  attachLocalImages,
  downloadQuickCheckTemplate,
  isCell,
  parseWorkbook,
  readImage,
  shuffle,
  type ParsedWorkbook,
} from "@/lib/lessons";

type QuickItem = {
  id: string;
  text: string;
  image: string | null;
  imageName?: string;
  correct: boolean;
};

// One slide of the slideshow. `order` is the shuffled order on the board; the editor lists `items` as entered.
type QuickGroup = { id: string; name: string; items: QuickItem[]; order: string[] };

type Mark = "right" | "wrong";

const STORAGE_KEY = "quick-check";
const MUTE_KEY = "quick-check-muted";
const RIGHT_SOUND = "/sounds/correct_answer.mp3";
const WRONG_SOUND = "/sounds/oh%20oh.mp3";
const starterItems = (): QuickItem[] => [
  { id: "starter-1", text: "早餐", image: null, correct: true },
  { id: "starter-2", text: "午餐", image: null, correct: true },
  { id: "starter-3", text: "晚餐", image: null, correct: false },
  { id: "starter-4", text: "點心", image: null, correct: false },
];
// Not crypto.randomUUID(): it's missing on plain-http LAN addresses, which classrooms often use.
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const groupName = (index: number) => `第 ${index + 1} 組`;
const makeGroup = (name: string, items: QuickItem[]): QuickGroup => ({
  id: newId(),
  name,
  items,
  order: shuffle(items).map((item) => item.id),
});
// Not shuffled: the server renders the starter cards too, and its order has to match.
const starterGroups = (): QuickGroup[] => {
  const items = starterItems();
  return [{ id: "starter", name: groupName(0), items, order: items.map((item) => item.id) }];
};

// The cards in board order: each card once, and a card added since the last shuffle at the end.
function deckOf(group: QuickGroup): QuickItem[] {
  const byId = new Map(group.items.map((item) => [item.id, item]));
  const placed = new Set<string>();
  const deck: QuickItem[] = [];
  for (const id of group.order) {
    const item = byId.get(id);
    if (item && !placed.has(id)) {
      placed.add(id);
      deck.push(item);
    }
  }
  return [...deck, ...group.items.filter((item) => !placed.has(item.id))];
}

// Cards read back from saved data; null if any of them isn't a card. Older saves had no answer, which means Y.
function itemsFrom(v: unknown): QuickItem[] | null {
  if (!Array.isArray(v) || !v.every((item) => isCell(item) && typeof (item as QuickItem).id === "string")) return null;
  return (v as QuickItem[]).map((item) => ({ ...item, correct: item.correct ?? true }));
}

// Groups read back from saved data. Saves from before groups had one deck: `items`, shuffled into `deck`.
function groupsFrom(saved: { groups?: unknown; items?: unknown; deck?: unknown } | null): QuickGroup[] | null {
  let groups: Partial<QuickGroup>[];
  if (Array.isArray(saved?.groups)) groups = saved.groups;
  else {
    const items = itemsFrom(saved?.items);
    if (!items) return null;
    const deck = itemsFrom(saved?.deck);
    groups = [{ id: newId(), name: groupName(0), items, order: (deck ?? shuffle(items)).map((item) => item.id) }];
  }

  const valid: QuickGroup[] = [];
  // Marks are kept by card id, so two cards (or groups) sharing an id would be revealed and counted together.
  const groupIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const g of groups) {
    const items = itemsFrom(g?.items);
    if (!items || typeof g?.id !== "string" || typeof g.name !== "string" || groupIds.has(g.id)) return null;
    groupIds.add(g.id);
    for (const item of items) {
      if (itemIds.has(item.id)) return null;
      itemIds.add(item.id);
    }
    const group = { id: g.id, name: g.name, items, order: Array.isArray(g.order) ? g.order : [] };
    valid.push({ ...group, order: deckOf(group).map((item) => item.id) });
  }
  return valid.length > 0 ? valid : null;
}

// ---------- Card text: at most three characters to a line ----------

const LINE_LENGTH = 3;
// A Chinese character, 注音 or full-width mark takes a place of its own; other letters join into a word that stays whole.
const isWide = (ch: string) => /[\p{Script=Han}\p{Script=Bopomofo}\u3000-\u303f\uff00-\uffef]/u.test(ch);

type Token = { pieces: Piece[]; spaced: boolean };

function cardLines(pieces: Piece[]): Token[][] {
  const tokens: Token[] = [];
  let word: Token | null = null;
  let spaced = false;
  for (const piece of pieces) {
    if (/^\s+$/.test(piece.text)) {
      word = null;
      spaced = tokens.length > 0;
    } else if (isWide(piece.text) || piece.pinyin !== undefined) {
      word = null;
      tokens.push({ pieces: [piece], spaced });
      spaced = false;
    } else if (word) word.pieces.push(piece);
    else {
      word = { pieces: [piece], spaced };
      tokens.push(word);
      spaced = false;
    }
  }
  const lines: Token[][] = [];
  for (let i = 0; i < tokens.length; i += LINE_LENGTH) lines.push(tokens.slice(i, i + LINE_LENGTH));
  return lines;
}

// The typed text one character at a time, each with its 破音字 reading mark (read by the 注音 fonts) kept on it.
function typedPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  for (const ch of text.trim()) {
    const last = pieces.at(-1);
    if (isReadingMark(ch) && last) last.text += ch;
    else pieces.push({ text: ch });
  }
  return pieces;
}

const lineText = (line: Token[]) => line.map((t) => (t.spaced ? " " : "") + t.pieces.map((p) => p.text).join("")).join("");

// The card text in the chosen font, broken into lines of at most three characters so 注音 and 拼音 stay big enough to read.
function CardText({ text, font, hanzi, withImage }: { text: string; font: FontId; hanzi: Hanzi | null; withImage: boolean }) {
  const lines = cardLines(hanzi ? hanzi.convert(text.trim()) : typedPieces(text));
  const longest = Math.max(...lines.map((line) => [...lineText(line).replace(/\s/g, "")].filter((ch) => !isReadingMark(ch)).length));
  const size = withImage ? "is-caption" : `is-${Math.min(longest, LINE_LENGTH)}`;
  const line = (tokens: Token[]) => {
    if (!hanzi) return lineText(tokens);
    const pieces = tokens.flatMap((t) => (t.spaced ? [{ text: " " }, ...t.pieces] : t.pieces));
    // One syllable or word per place, with a space between each, so a word doesn't run into the next syllable.
    if (font === "pinyin-only") return tokens.map((t) => pinyinLine(t.pieces)).join(" ");
    if (font === "hans") return <span lang="zh-Hans">{lineText(tokens)}</span>;
    return (
      <span lang="zh-Hans">
        {pieces.map((p, i) =>
          p.pinyin === undefined ? (
            p.text
          ) : (
            <ruby key={i}>
              {p.text}
              <rt>{p.pinyin}</rt>
            </ruby>
          ),
        )}
      </span>
    );
  };
  return (
    <p className={`ttt-text quick-text ${size}`}>
      {lines.map((tokens, i) => (
        <span className="quick-line" key={i}>{line(tokens)}</span>
      ))}
    </p>
  );
}

export default function QuickCheck() {
  const [groups, setGroups] = useState<QuickGroup[]>(starterGroups);
  const [current, setCurrent] = useState(0);
  // Which way the last slide change went, so the new slide comes in from that side.
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [loaded, setLoaded] = useState(false);
  const [storageFull, setStorageFull] = useState(false);
  const [savedBroken, setSavedBroken] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParsedWorkbook | null>(null);
  // Bumped by each import and by 取消匯入, so an import that finishes after it was cancelled or replaced is dropped.
  const importRun = useRef(0);
  const [notice, setNotice] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [font, setFont] = useState<FontId>("plain");

  useEffect(() => {
    const { value, broken } = readSaved(STORAGE_KEY);
    const saved = value as
      | { groups?: unknown; items?: unknown; deck?: unknown; current?: unknown; marks?: unknown; editing?: unknown; font?: string }
      | null;
    // An empty saved deck is the teacher's choice; only a first visit gets the starter cards.
    const savedGroups = groupsFrom(saved);
    if (savedGroups) {
      setGroups(savedGroups);
      if (typeof saved?.current === "number") setCurrent(Math.min(Math.max(0, Math.floor(saved.current)), savedGroups.length - 1));
      const ids = new Set(savedGroups.flatMap((group) => group.items.map((item) => item.id)));
      if (saved?.marks && typeof saved.marks === "object")
        setMarks(
          Object.fromEntries(
            Object.entries(saved.marks).filter(([id, mark]) => ids.has(id) && (mark === "right" || mark === "wrong")),
          ),
        );
    } else if (saved !== null) keepBroken(STORAGE_KEY);
    setSavedBroken(broken || (saved !== null && !savedGroups));
    if (typeof saved?.editing === "boolean") setEditing(saved.editing);
    if (isFontId(saved?.font ?? null)) setFont(saved!.font as FontId);
    setMuted(readSaved(MUTE_KEY).value === 1);
    setLoaded(true);
    preloadSoundFile(RIGHT_SOUND);
    preloadSoundFile(WRONG_SOUND);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setStorageFull(!writeSaved(STORAGE_KEY, { groups, current, marks, editing, font }));
    writeSaved(MUTE_KEY, muted ? 1 : 0);
  }, [groups, current, marks, editing, muted, font, loaded]);

  const group = groups[Math.min(current, groups.length - 1)];
  const shownDeck = useMemo(() => deckOf(group), [group]);
  const counts = useMemo(() => {
    let right = 0;
    let wrong = 0;
    shownDeck.forEach((item) => {
      if (marks[item.id] === "right") right++;
      if (marks[item.id] === "wrong") wrong++;
    });
    return { right, wrong, pending: shownDeck.length - right - wrong };
  }, [shownDeck, marks]);

  // False when there's no such slide, so the key that asked for it keeps doing what it normally does.
  const goTo = (index: number) => {
    if (index < 0 || index >= groups.length || index === current) return false;
    setDirection(index > current ? "next" : "prev");
    setCurrent(index);
    return true;
  };

  // ← → change slides, except while the teacher is typing in the editor, or while another view is shown
  // (Workspace keeps this one mounted, just hidden).
  const rootRef = useRef<HTMLDivElement>(null);
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!rootRef.current || rootRef.current.closest("[hidden]")) return;
      if (target?.closest("input, select, textarea, [contenteditable='true']")) return;
      const step = event.key === "ArrowRight" || event.key === "PageDown" ? 1 : event.key === "ArrowLeft" || event.key === "PageUp" ? -1 : 0;
      if (step !== 0 && goToRef.current(currentRef.current + step)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updateGroup = (id: string, change: (group: QuickGroup) => QuickGroup) =>
    setGroups((prev) => prev.map((g) => (g.id === id ? change(g) : g)));
  const updateItems = (change: (items: QuickItem[]) => QuickItem[]) =>
    updateGroup(group.id, (g) => ({ ...g, items: change(g.items) }));

  const applyImport = (parsed: ParsedWorkbook, missingImages: string[]) => {
    const imported = parsed.lessons.map((lesson) =>
      makeGroup(
        lesson.name,
        lesson.items.map((item) => ({ ...item, id: newId(), correct: item.correct ?? true })),
      ),
    );
    setGroups(imported);
    setCurrent(0);
    setDirection("next");
    setMarks({});
    if (parsed.font) setFont(parsed.font);
    setPendingImport(null);
    const warnings = [...parsed.warnings];
    if (missingImages.length > 0) warnings.push(`找不到這些圖片：${missingImages.join("、")}`);
    const cards = imported.reduce((sum, g) => sum + g.items.length, 0);
    setNotice({ lines: [`已匯入 ${imported.length} 組、共 ${cards} 張卡片。`], warnings });
  };

  const importExcel = async (file: File | undefined) => {
    if (!file) return;
    const run = ++importRun.current;
    setImporting(true);
    setNotice(null);
    setPendingImport(null);
    try {
      const parsed = await parseWorkbook(file);
      if (run !== importRun.current) return;
      if (parsed.lessons.length === 0) {
        setNotice({ lines: [], warnings: ["這個檔案裡找不到素材。請用範本格式，第一列填「文字」「圖片」「Y/N」。"] });
      } else if (parsed.localNames.length > 0) {
        setPendingImport(parsed);
      } else {
        applyImport(parsed, []);
      }
    } catch {
      if (run === importRun.current) setNotice({ lines: [], warnings: ["無法讀取這個檔案，請確認是 Excel（.xlsx）檔。"] });
    } finally {
      if (run === importRun.current) setImporting(false);
    }
  };

  const pickLocalImages = async (files: File[]) => {
    if (!pendingImport || files.length === 0) return;
    const run = ++importRun.current;
    setImporting(true);
    const missing = await attachLocalImages(pendingImport.lessons, files, () => run === importRun.current);
    if (missing === null) return;
    setImporting(false);
    applyImport(pendingImport, missing);
  };

  const cancelImport = () => {
    importRun.current++;
    setImporting(false);
    setPendingImport(null);
  };

  const skipImages = (parsed: ParsedWorkbook) => {
    // Pictures still loading from an earlier pick are no longer wanted.
    importRun.current++;
    setImporting(false);
    applyImport(parsed, parsed.localNames);
  };

  const addGroup = () => {
    setGroups((prev) => [...prev, makeGroup(groupName(prev.length), [])]);
    setDirection("next");
    setCurrent(groups.length);
  };

  const removeGroup = () => {
    if (!confirm(`要刪除「${group.name}」和裡面的 ${group.items.length} 張卡片嗎？`)) return;
    const gone = new Set(group.items.map((item) => item.id));
    setMarks((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !gone.has(id))));
    // The last group is never removed, only emptied, so there's always a slide to show.
    if (groups.length === 1) setGroups([makeGroup(groupName(0), [])]);
    else {
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setDirection("prev");
      setCurrent(Math.max(0, current - 1));
    }
  };

  const shuffleGroup = () => updateGroup(group.id, (g) => ({ ...g, order: shuffle(g.items).map((item) => item.id) }));

  const clearMarks = () => {
    const ids = new Set(group.items.map((item) => item.id));
    setMarks((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))));
  };

  const addBlank = () => updateItems((items) => [...items, { id: newId(), text: "", image: null, correct: true }]);

  const updateItem = (id: string, patch: Partial<QuickItem>) => {
    updateItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    // A changed answer makes the shown ✓/× wrong, so the card goes back to unrevealed.
    if ("correct" in patch) setMarks(({ [id]: _stale, ...rest }) => rest);
  };

  // 長[ㄓㄤˇ] typed into a card becomes 長 with its reading picked, once the teacher leaves the field.
  const finishText = async (id: string, text: string) => {
    const done = await typedReadings(text);
    if (!done) return;
    // Left alone if it was changed again while the readings were loading.
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((item) => (item.id === id && item.text === text ? { ...item, text: done.text } : item)),
      })),
    );
    if (done.notice) setNotice({ lines: [], warnings: [done.notice] });
  };

  const removeItem = (id: string) => {
    updateItems((items) => items.filter((item) => item.id !== id));
    setMarks(({ [id]: _removed, ...rest }) => rest);
  };

  const setImage = async (id: string, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      updateItem(id, { image: await readImage(file), imageName: file.name });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const reveal = (item: QuickItem) => {
    if (marks[item.id]) return;
    const value: Mark = item.correct ? "right" : "wrong";
    setMarks((prev) => ({ ...prev, [item.id]: value }));
    if (!muted) playSoundFile(item.correct ? RIGHT_SOUND : WRONG_SOUND);
  };

  const cellFont = fontFamilyOf(font);
  const hanzi = useHanzi(font);
  const groupHasMarks = group.items.some((item) => marks[item.id]);

  return (
    <div className="game quick" ref={rootRef}>
      <header className="page-header">
        <h1 className="page-title">Quick Check 快判卡</h1>
        <div className="page-tools">
          <button className="btn-tag" onClick={shuffleGroup} disabled={group.items.length === 0}>
            🔀 打散
          </button>
          <button className="btn-tag" onClick={clearMarks} disabled={!groupHasMarks}>
            清除勾叉
          </button>
          <button className="btn-tag mute-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted} title={muted ? "開啟音效" : "靜音"}>
            {muted ? "🔇 靜音中" : "🔊 音效開"}
          </button>
          <button className={`btn-tag ${editing ? "is-on" : ""}`} onClick={() => setEditing((value) => !value)} aria-pressed={editing}>
            ⚙️ 設定
          </button>
        </div>
      </header>

      <StorageNotice
        full={storageFull}
        fullText="這次的素材沒有完整存起來。圖片可以先用「圖片瘦身」縮小再匯入。"
        broken={savedBroken}
        onCloseBroken={() => setSavedBroken(false)}
      />

      {pendingImport && (
        <div className="ttt-notice is-pending">
          <p>這份 Excel 有 {pendingImport.localNames.length} 張圖片要從電腦選取（可以一次選多張）：</p>
          <p className="ttt-notice-files">{pendingImport.localNames.join("、")}</p>
          <div className="ttt-notice-actions">
            <label className="btn btn-primary">
              {importing ? "讀取中…" : "選擇圖片"}
              <input type="file" accept="image/*" multiple className="file-input" disabled={importing} onChange={(e) => {
                void pickLocalImages([...(e.target.files ?? [])]);
                e.target.value = "";
              }} />
            </label>
            <button className="btn" onClick={() => skipImages(pendingImport)}>略過圖片</button>
            <button className="btn" onClick={cancelImport}>取消匯入</button>
          </div>
        </div>
      )}

      {notice && (
        <div className={`ttt-notice ${notice.warnings.length > 0 ? "is-warn" : ""}`}>
          <button className="ttt-notice-close" onClick={() => setNotice(null)} aria-label="關閉">×</button>
          {notice.lines.map((line) => <p key={line}>✅ {line}</p>)}
          {notice.warnings.map((warning) => <p key={warning}>⚠️ {warning}</p>)}
        </div>
      )}

      <div className={`quick-layout ${editing ? "is-editing" : ""}`}>
        <Chalkboard className="quick-board">
          <div className="quick-topbar">
            <nav className="quick-slides" aria-label="切換組別">
              <button className="quick-slide-btn" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="上一組">
                ◀
              </button>
              <span className="quick-slide-name" aria-live="polite">
                {group.name}
                <small>{current + 1} / {groups.length}</small>
              </span>
              <button
                className="quick-slide-btn"
                onClick={() => goTo(current + 1)}
                disabled={current >= groups.length - 1}
                aria-label="下一組"
              >
                ▶
              </button>
            </nav>
            <div className="quick-score" aria-live="polite">
              <span>✅ {counts.right}</span>
              <span>❌ {counts.wrong}</span>
              <span>待判 {counts.pending}</span>
            </div>
          </div>
          <div
            key={group.id}
            className={`quick-deck is-from-${direction} ${cellFont ? "has-cell-font" : ""}`}
            data-font={font}
            style={cellFont ? ({ "--cell-font": `${cellFont}, var(--font-board-text)` } as React.CSSProperties) : undefined}
          >
            {shownDeck.length === 0 && <p className="quick-empty-group">這一組還沒有卡片，按「⚙️ 設定」新增。</p>}
            {shownDeck.map((item) => (
              <article
                className={`quick-card ${marks[item.id] ? `is-${marks[item.id]}` : ""}`}
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`${item.text || "圖片卡"}，點擊揭曉`}
                onClick={() => reveal(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    reveal(item);
                  }
                }}
              >
                <div className="quick-card-content">
                  {item.image ? (
                    <CellImage key={item.image} cell={item} />
                  ) : (
                    item.imageName && (
                      <span className="ttt-img-missing">
                        ⚠️ 找不到圖片
                        <small>{item.imageName}</small>
                      </span>
                    )
                  )}
                  {item.text.trim() && (
                    <CardText text={item.text} font={font} hanzi={hanzi} withImage={Boolean(item.image || item.imageName)} />
                  )}
                  {!item.image && !item.imageName && !item.text.trim() && <p className="quick-empty">空白卡</p>}
                </div>
                {marks[item.id] && (
                  <span className={`quick-result is-${marks[item.id]}`} aria-hidden="true">
                    {marks[item.id] === "right" ? "✓" : "×"}
                  </span>
                )}
              </article>
            ))}
          </div>
          {groups.length > 1 && (
            <div className="quick-dots">
              {groups.map((g, index) => (
                <button
                  key={g.id}
                  className={`quick-dot ${index === current ? "is-current" : ""}`}
                  onClick={() => goTo(index)}
                  aria-label={g.name}
                  aria-current={index === current}
                  title={g.name}
                />
              ))}
            </div>
          )}
        </Chalkboard>

        {editing && (
          <section className="paper quick-editor" aria-label="素材設定">
          <h2 className="quick-heading">素材</h2>
          <label className="tag-field">
            卡片字型
            <select className="select-tag" value={font} onChange={(e) => isFontId(e.target.value) && setFont(e.target.value)}>
              {FONTS.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <div className="quick-imports">
            <label className="btn-tag">
              📥 匯入 Excel
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="file-input"
                disabled={importing}
                onChange={(e) => {
                  void importExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn-tag" onClick={() => void downloadQuickCheckTemplate()}>📄 下載範本</button>
          </div>

          <div className="quick-group-bar">
            <label className="quick-group-name">
              <span>組名（{current + 1} / {groups.length}）</span>
              <input
                value={group.name}
                onChange={(e) => updateGroup(group.id, (g) => ({ ...g, name: e.target.value }))}
                onBlur={(e) => !e.target.value.trim() && updateGroup(group.id, (g) => ({ ...g, name: groupName(current) }))}
                aria-label="這一組的名稱"
              />
            </label>
            <div className="quick-imports">
              <button className="btn-tag" onClick={addGroup}>＋ 新增一組</button>
              <button className="btn-tag" onClick={removeGroup}>🗑 刪除這組</button>
            </div>
          </div>

          <div className="quick-list">
            {group.items.map((item, index) => (
              <div className="quick-edit-row" key={item.id}>
                <span className="quick-row-number">{index + 1}</span>
                <input
                  value={item.text}
                  onChange={(e) => updateItem(item.id, { text: e.target.value })}
                  onBlur={(e) => void finishText(item.id, e.target.value)}
                  placeholder="文字"
                  aria-label={`第 ${index + 1} 個素材文字`}
                />
                <select
                  value={item.correct ? "Y" : "N"}
                  onChange={(e) => updateItem(item.id, { correct: e.target.value === "Y" })}
                  aria-label={`第 ${index + 1} 個素材答案`}
                  title="答案"
                >
                  <option value="Y">Y</option>
                  <option value="N">N</option>
                </select>
                <label className="quick-icon-btn" title="更換圖片">
                  🖼
                  <input
                    type="file"
                    accept="image/*"
                    className="file-input"
                    onChange={(e) => {
                      void setImage(item.id, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button className="quick-icon-btn" onClick={() => removeItem(item.id)} aria-label="刪除">
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="btn-tag" onClick={addBlank}>
            ＋ 新增一張
          </button>
          </section>
        )}
      </div>
    </div>
  );
}
