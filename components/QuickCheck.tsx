"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chalkboard from "./Chalkboard";
import { BoardText, CellImage, textSize, useHanzi } from "./CellContent";
import StorageNotice from "./StorageNotice";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import { playSoundFile, preloadSoundFile } from "@/lib/sounds";
import { keepBroken, readSaved, writeSaved } from "@/lib/storage";
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

// Cards read back from saved data; null if any of them isn't a card. Older saves had no answer, which means Y.
function itemsFrom(v: unknown): QuickItem[] | null {
  if (!Array.isArray(v) || !v.every((item) => isCell(item) && typeof (item as QuickItem).id === "string")) return null;
  return (v as QuickItem[]).map((item) => ({ ...item, correct: item.correct ?? true }));
}

export default function QuickCheck() {
  const [items, setItems] = useState<QuickItem[]>(starterItems);
  const [deck, setDeck] = useState<QuickItem[]>([]);
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
    const saved = value as { items?: unknown; deck?: unknown; marks?: unknown; editing?: unknown; font?: string } | null;
    // An empty saved deck is the teacher's choice; only a first visit gets the starter cards.
    const savedItems = itemsFrom(saved?.items);
    if (savedItems) {
      setItems(savedItems);
      // The shuffled deck holds the same cards; one that doesn't is dealt again from the cards.
      const savedDeck = itemsFrom(saved?.deck);
      const ids = new Set(savedItems.map((item) => item.id));
      setDeck(savedDeck && savedDeck.every((item) => ids.has(item.id)) ? savedDeck : shuffle(savedItems));
      if (saved?.marks && typeof saved.marks === "object")
        setMarks(
          Object.fromEntries(
            Object.entries(saved.marks).filter(([id, mark]) => ids.has(id) && (mark === "right" || mark === "wrong")),
          ),
        );
    } else if (saved !== null) keepBroken(STORAGE_KEY);
    setSavedBroken(broken || (saved !== null && !savedItems));
    if (typeof saved?.editing === "boolean") setEditing(saved.editing);
    if (isFontId(saved?.font ?? null)) setFont(saved!.font as FontId);
    setMuted(readSaved(MUTE_KEY).value === 1);
    setLoaded(true);
    preloadSoundFile(RIGHT_SOUND);
    preloadSoundFile(WRONG_SOUND);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setStorageFull(!writeSaved(STORAGE_KEY, { items, deck, marks, editing, font }));
    writeSaved(MUTE_KEY, muted ? 1 : 0);
  }, [items, deck, marks, editing, muted, font, loaded]);

  const shownDeck = deck.length > 0 ? deck : items;
  const counts = useMemo(() => {
    let right = 0;
    let wrong = 0;
    shownDeck.forEach((item) => {
      if (marks[item.id] === "right") right++;
      if (marks[item.id] === "wrong") wrong++;
    });
    return { right, wrong, pending: shownDeck.length - right - wrong };
  }, [shownDeck, marks]);

  const applyImport = (parsed: ParsedWorkbook, missingImages: string[]) => {
    const imported = parsed.lessons.flatMap((lesson) =>
      lesson.items.map((item) => ({ ...item, id: newId(), correct: item.correct ?? true })),
    );
    setItems(imported);
    setDeck(shuffle(imported));
    setMarks({});
    if (parsed.font) setFont(parsed.font);
    setPendingImport(null);
    const warnings = [...parsed.warnings];
    if (missingImages.length > 0) warnings.push(`找不到這些圖片：${missingImages.join("、")}`);
    setNotice({ lines: [`已匯入 ${imported.length} 張卡片。`], warnings });
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
        setNotice({ lines: [], warnings: ["這個檔案裡找不到素材。請用範本格式，第一列填「文字」「圖片」。"] });
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
    const missing = await attachLocalImages(pendingImport.lessons, files);
    if (run !== importRun.current) return;
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

  const addBlank = () => {
    const next = [...items, { id: newId(), text: "", image: null, correct: true }];
    setItems(next);
    setDeck(next);
  };

  const updateItem = (id: string, patch: Partial<QuickItem>) => {
    const update = (list: QuickItem[]) => list.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setItems(update);
    setDeck(update);
    // A changed answer makes the shown ✓/× wrong, so the card goes back to unrevealed.
    if ("correct" in patch) setMarks(({ [id]: _stale, ...rest }) => rest);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setDeck((prev) => prev.filter((item) => item.id !== id));
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

  return (
    <div className="game quick">
      <header className="page-header">
        <h1 className="page-title">Quick Check 快判卡</h1>
        <div className="page-tools">
          <button className="btn-tag" onClick={() => setDeck(shuffle(items))} disabled={items.length === 0}>
            🔀 打散
          </button>
          <button className="btn-tag" onClick={() => setMarks({})} disabled={Object.keys(marks).length === 0}>
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
              <input type="file" accept="image/*" multiple hidden disabled={importing} onChange={(e) => {
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
          <div className="quick-score" aria-live="polite">
            <span>✅ {counts.right}</span>
            <span>❌ {counts.wrong}</span>
            <span>待判 {counts.pending}</span>
          </div>
          <div
            className={`quick-deck ${cellFont ? "has-cell-font" : ""}`}
            data-font={font}
            style={cellFont ? ({ "--cell-font": `${cellFont}, var(--font-board-text)` } as React.CSSProperties) : undefined}
          >
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
                  {item.text && <p className={`ttt-text ${textSize(item.text, Boolean(item.image))}`}><BoardText text={item.text} font={font} hanzi={hanzi} /></p>}
                  {!item.image && !item.imageName && !item.text && <p className="quick-empty">空白卡</p>}
                </div>
                {marks[item.id] && (
                  <span className={`quick-result is-${marks[item.id]}`} aria-hidden="true">
                    {marks[item.id] === "right" ? "✓" : "×"}
                  </span>
                )}
              </article>
            ))}
          </div>
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
                hidden
                disabled={importing}
                onChange={(e) => {
                  void importExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn-tag" onClick={() => void downloadQuickCheckTemplate()}>📄 下載範本</button>
          </div>

          <div className="quick-list">
            {items.map((item, index) => (
              <div className="quick-edit-row" key={item.id}>
                <span className="quick-row-number">{index + 1}</span>
                <input
                  value={item.text}
                  onChange={(e) => updateItem(item.id, { text: e.target.value })}
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
                    hidden
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
