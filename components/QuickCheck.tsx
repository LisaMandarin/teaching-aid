"use client";

import { useEffect, useMemo, useState } from "react";
import Chalkboard from "./Chalkboard";
import { BoardText, useHanzi } from "./CellContent";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import { playSoundFile, preloadSoundFile } from "@/lib/sounds";
import {
  attachLocalImages,
  downloadQuickCheckTemplate,
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
const RIGHT_SOUND = "/sounds/wow.mp3";
const WRONG_SOUND = "/sounds/oh%20oh.mp3";
const starterItems = (): QuickItem[] => [
  { id: "starter-1", text: "早餐", image: null, correct: true },
  { id: "starter-2", text: "午餐", image: null, correct: true },
  { id: "starter-3", text: "晚餐", image: null, correct: false },
  { id: "starter-4", text: "點心", image: null, correct: false },
];

export default function QuickCheck() {
  const [items, setItems] = useState<QuickItem[]>(starterItems);
  const [deck, setDeck] = useState<QuickItem[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [loaded, setLoaded] = useState(false);
  const [storageFull, setStorageFull] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParsedWorkbook | null>(null);
  const [notice, setNotice] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [font, setFont] = useState<FontId>("plain");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (Array.isArray(saved?.items) && saved.items.length > 0)
        setItems(saved.items.map((item: QuickItem) => ({ ...item, correct: item.correct ?? true })));
      if (Array.isArray(saved?.deck))
        setDeck(saved.deck.map((item: QuickItem) => ({ ...item, correct: item.correct ?? true })));
      if (saved?.marks && typeof saved.marks === "object") setMarks(saved.marks);
      if (typeof saved?.editing === "boolean") setEditing(saved.editing);
      if (isFontId(saved?.font ?? null)) setFont(saved.font);
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    setLoaded(true);
    preloadSoundFile(RIGHT_SOUND);
    preloadSoundFile(WRONG_SOUND);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, deck, marks, editing, font }));
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      setStorageFull(false);
    } catch {
      setStorageFull(true);
    }
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
      lesson.items.map((item) => ({ ...item, id: crypto.randomUUID(), correct: item.correct ?? true })),
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
    setImporting(true);
    setNotice(null);
    try {
      const parsed = await parseWorkbook(file);
      if (parsed.lessons.length === 0) {
        setNotice({ lines: [], warnings: ["這個檔案裡找不到素材。請用範本格式，第一列填「文字」「圖片」。"] });
      } else if (parsed.localNames.length > 0) {
        setPendingImport(parsed);
      } else {
        applyImport(parsed, []);
      }
    } catch {
      setNotice({ lines: [], warnings: ["無法讀取這個檔案，請確認是 Excel（.xlsx）檔。"] });
    } finally {
      setImporting(false);
    }
  };

  const pickLocalImages = async (files: File[]) => {
    if (!pendingImport || files.length === 0) return;
    setImporting(true);
    const missing = await attachLocalImages(pendingImport.lessons, files);
    setImporting(false);
    applyImport(pendingImport, missing);
  };

  const addBlank = () => {
    const next = [...items, { id: crypto.randomUUID(), text: "", image: null, correct: true }];
    setItems(next);
    setDeck(next);
  };

  const updateItem = (id: string, patch: Partial<QuickItem>) => {
    const update = (list: QuickItem[]) => list.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setItems(update);
    setDeck(update);
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

      {storageFull && (
        <div className="ttt-notice is-warn">
          <p>⚠️ 瀏覽器的儲存空間不夠，這次的素材沒有完整存起來。圖片可以先用「圖片瘦身」縮小再匯入。</p>
        </div>
      )}

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
            <button className="btn" onClick={() => applyImport(pendingImport, pendingImport.localNames)}>略過圖片</button>
            <button className="btn" onClick={() => setPendingImport(null)}>取消匯入</button>
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
                  {item.image && <img src={item.image} alt="" referrerPolicy="no-referrer" />}
                  {item.text && <p className="ttt-text"><BoardText text={item.text} font={font} hanzi={hanzi} /></p>}
                  {!item.image && !item.text && <p className="quick-empty">空白卡</p>}
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
