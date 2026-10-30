"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chalkboard from "./Chalkboard";
import { BoardText, CellImage, textSize, useHanzi } from "./CellContent";
import StorageNotice from "./StorageNotice";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import { attachLocalImages, parseWorkbook, readImage, type ParsedWorkbook } from "@/lib/lessons";
import {
  cardSize,
  downloadMissingTemplate,
  freeSpot,
  groupsFrom,
  keepOnBoard,
  newId,
  scatter,
  type MissingGroup,
  type MissingItem,
} from "@/lib/missing";
import { playSoundFile, playVanish, preloadSoundFile } from "@/lib/sounds";
import { keepBroken, readSaved, writeSaved } from "@/lib/storage";
import { typedReadings } from "@/lib/zhuyin";

// show: every card is on the board. hidden: the marked cards are gone. revealed: they're back, highlighted.
type Phase = "show" | "hidden" | "revealed";

const STORAGE_KEY = "whats-missing";
const MUTE_KEY = "whats-missing-muted";
const REVEAL_SOUND = "/sounds/correct_answer.mp3";
const groupName = (index: number) => `第 ${index + 1} 組`;

// Fixed spots: the server renders the starter cards too, and its layout has to match.
const starterGroups = (): MissingGroup[] => [
  {
    id: "starter",
    name: groupName(0),
    items: [
      { id: "starter-1", text: "蘋果", image: null, x: 16, y: 24, missing: true },
      { id: "starter-2", text: "香蕉", image: null, x: 44, y: 30, missing: false },
      { id: "starter-3", text: "西瓜", image: null, x: 82, y: 22, missing: false },
      { id: "starter-4", text: "葡萄", image: null, x: 24, y: 74, missing: false },
      { id: "starter-5", text: "草莓", image: null, x: 57, y: 78, missing: false },
      { id: "starter-6", text: "橘子", image: null, x: 84, y: 70, missing: false },
    ],
  },
];

export default function WhatIsMissing() {
  const [groups, setGroups] = useState<MissingGroup[]>(starterGroups);
  const [current, setCurrent] = useState(0);
  const [phase, setPhase] = useState<Phase>("show");
  const [loaded, setLoaded] = useState(false);
  const [storageFull, setStorageFull] = useState(false);
  const [savedBroken, setSavedBroken] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParsedWorkbook | null>(null);
  // Bumped by each import and by 取消匯入, so an import that finishes after it was cancelled or replaced is dropped.
  const importRun = useRef(0);
  const [notice, setNotice] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  // The marks only show while this is open, so students can't see which cards will disappear.
  const [editing, setEditing] = useState(false);
  const [font, setFont] = useState<FontId>("plain");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const { value, broken } = readSaved(STORAGE_KEY);
    const saved = value as { groups?: unknown; current?: unknown; phase?: unknown; editing?: unknown; font?: string } | null;
    const savedGroups = groupsFrom(saved?.groups);
    if (savedGroups) {
      setGroups(savedGroups);
      if (typeof saved?.current === "number") setCurrent(Math.min(Math.max(0, Math.floor(saved.current)), savedGroups.length - 1));
      const savedPhase = saved?.phase === "hidden" || saved?.phase === "revealed" ? saved.phase : "show";
      setPhase(savedPhase);
      if (saved?.editing === true && savedPhase === "show") setEditing(true);
    } else if (saved !== null) keepBroken(STORAGE_KEY);
    setSavedBroken(broken || (saved !== null && !savedGroups));
    if (isFontId(saved?.font ?? null)) setFont(saved!.font as FontId);
    setMuted(readSaved(MUTE_KEY).value === 1);
    setLoaded(true);
    preloadSoundFile(REVEAL_SOUND);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setStorageFull(!writeSaved(STORAGE_KEY, { groups, current, phase, editing, font }));
    writeSaved(MUTE_KEY, muted ? 1 : 0);
  }, [groups, current, phase, editing, font, muted, loaded]);

  const group = groups[Math.min(current, groups.length - 1)];
  const missingCount = useMemo(() => group.items.filter((item) => item.missing).length, [group]);

  const goTo = (index: number) => {
    if (index < 0 || index >= groups.length || index === current) return false;
    setPhase("show");
    setCurrent(index);
    return true;
  };

  // ← → change groups, except while the teacher is typing in the editor, or while another view is shown
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

  const updateGroup = (id: string, change: (group: MissingGroup) => MissingGroup) =>
    setGroups((prev) => prev.map((g) => (g.id === id ? change(g) : g)));
  const updateItems = (change: (items: MissingItem[]) => MissingItem[]) =>
    updateGroup(group.id, (g) => ({ ...g, items: change(g.items) }));
  const updateItem = (id: string, patch: Partial<MissingItem>) =>
    updateItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const applyImport = (parsed: ParsedWorkbook, missingImages: string[]) => {
    const imported = parsed.lessons.map((lesson) => {
      const spots = scatter(lesson.items.length);
      return {
        id: newId(),
        name: lesson.name,
        items: lesson.items.map(({ text, image, imageName, correct }, i) => ({
          id: newId(),
          text,
          image,
          imageName,
          ...spots[i],
          // The template's 消失 column is read as the sheet's Y/N answer.
          missing: correct === true,
        })),
      };
    });
    setGroups(imported);
    setCurrent(0);
    setPhase("show");
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
      const parsed = await parseWorkbook(file, "這張卡先不消失");
      if (run !== importRun.current) return;
      if (parsed.lessons.length === 0) {
        setNotice({ lines: [], warnings: ["這個檔案裡找不到素材。請用範本格式，第一列填「文字」「圖片」「消失」。"] });
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
    setGroups((prev) => [...prev, { id: newId(), name: groupName(prev.length), items: [] }]);
    setCurrent(groups.length);
  };

  const removeGroup = () => {
    if (!confirm(`要刪除「${group.name}」和裡面的 ${group.items.length} 張卡片嗎？`)) return;
    // The last group is never removed, only emptied, so there's always a board to show.
    if (groups.length === 1) setGroups([{ id: newId(), name: groupName(0), items: [] }]);
    else {
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setCurrent(Math.max(0, current - 1));
    }
  };

  const shuffleCards = () => {
    const spots = scatter(group.items.length);
    updateItems((items) => items.map((item, i) => ({ ...item, ...spots[i] })));
  };

  const addBlank = () =>
    updateItems((items) => [...items, { id: newId(), text: "", image: null, ...freeSpot(items), missing: false }]);

  const removeItem = (id: string) => updateItems((items) => items.filter((item) => item.id !== id));

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

  const setImage = async (id: string, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      updateItem(id, { image: await readImage(file), imageName: file.name });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // In 設定 a card is dragged to move it; pressing it without moving marks it to disappear.
  const fieldRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const spotAt = (event: React.PointerEvent) => {
    const box = fieldRef.current!.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 };
  };

  const startDrag = (event: React.PointerEvent, item: MissingItem) => {
    if (!editing || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = spotAt(event);
    drag.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: item.x - at.x,
      offsetY: item.y - at.y,
      moved: false,
    };
  };

  const moveDrag = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 6) return;
    d.moved = true;
    setDraggingId(d.id);
    const at = spotAt(event);
    updateItem(d.id, keepOnBoard({ x: at.x + d.offsetX, y: at.y + d.offsetY }, group.items.length));
  };

  const endDrag = (item: MissingItem) => {
    const d = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (d && !d.moved) updateItem(item.id, { missing: !item.missing });
  };

  const hideCards = () => {
    setEditing(false);
    setPhase("hidden");
    if (!muted) playVanish();
  };

  const revealCards = () => {
    setPhase("revealed");
    if (!muted) playSoundFile(REVEAL_SOUND);
  };

  const toggleEditing = () => {
    setPhase("show");
    setEditing((value) => !value);
  };

  const cellFont = fontFamilyOf(font);
  const hanzi = useHanzi(font);
  const size = cardSize(group.items.length);

  return (
    <div className="game quick" ref={rootRef}>
      <header className="page-header">
        <h1 className="page-title">What is Missing? 少了什麼</h1>
        <div className="page-tools">
          <button className="btn-tag" onClick={shuffleCards} disabled={group.items.length === 0}>
            🔀 打散
          </button>
          <button className="btn-tag mute-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted} title={muted ? "開啟音效" : "靜音"}>
            {muted ? "🔇 靜音中" : "🔊 音效開"}
          </button>
          <button
            className={`btn-tag ${editing ? "is-on" : ""}`}
            onClick={toggleEditing}
            aria-pressed={editing}
            disabled={phase === "hidden"}
            title={phase === "hidden" ? "公佈答案後才能打開設定" : undefined}
          >
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
            <div className="missing-actions" aria-live="polite">
              {phase === "show" && (
                <>
                  {missingCount === 0 && <span className="missing-hint">先到「⚙️ 設定」指定要消失的卡片</span>}
                  <button className="btn btn-primary" onClick={hideCards} disabled={missingCount === 0}>
                    🫥 消失！
                  </button>
                </>
              )}
              {phase === "hidden" && (
                <>
                  <span className="missing-hint">少了 {missingCount} 張，是什麼？</span>
                  <button className="btn btn-primary" onClick={revealCards}>
                    🎉 Reveal 公佈答案
                  </button>
                </>
              )}
              {phase === "revealed" && (
                <button className="btn" onClick={() => setPhase("show")}>
                  ↺ 再玩一次
                </button>
              )}
            </div>
          </div>
          <div
            ref={fieldRef}
            key={group.id}
            className={`missing-field ${editing ? "is-editing" : ""} ${cellFont ? "has-cell-font" : ""}`}
            data-font={font}
            style={cellFont ? ({ "--cell-font": `${cellFont}, var(--font-board-text)` } as React.CSSProperties) : undefined}
          >
            {group.items.length === 0 && <p className="quick-empty-group">這一組還沒有卡片，按「⚙️ 設定」新增。</p>}
            {group.items.map((item) => {
              const spot = keepOnBoard(item, group.items.length);
              const withImage = Boolean(item.image || item.imageName);
              const state = !item.missing ? "" : phase === "hidden" ? "is-gone" : phase === "revealed" ? "is-found" : editing ? "is-marked" : "";
              return (
                <article
                  className={`missing-card ${state} ${draggingId === item.id ? "is-dragging" : ""}`}
                  key={item.id}
                  style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${size.width}%`, height: `${size.height}%` }}
                  {...(editing && {
                    role: "button",
                    tabIndex: 0,
                    "aria-pressed": item.missing,
                    "aria-label": `${item.text || "圖片卡"}，指定為要消失的卡片`,
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        updateItem(item.id, { missing: !item.missing });
                      }
                    },
                  })}
                  onPointerDown={(event) => startDrag(event, item)}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(item)}
                  onPointerCancel={() => {
                    drag.current = null;
                    setDraggingId(null);
                  }}
                >
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
                    <p className={`ttt-text ${textSize(item.text, withImage)}`}>
                      <BoardText text={item.text.trim()} font={font} hanzi={hanzi} />
                    </p>
                  )}
                  {!withImage && !item.text.trim() && <p className="missing-blank">空白卡</p>}
                </article>
              );
            })}
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
            <p className="missing-tip">在黑板上拖曳卡片擺位置；點一下卡片，或按右邊的「消失」，指定要消失的卡片。</p>
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
              <button className="btn-tag" onClick={() => void downloadMissingTemplate()}>📄 下載範本</button>
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
                  <button
                    className={`missing-mark ${item.missing ? "is-on" : ""}`}
                    onClick={() => updateItem(item.id, { missing: !item.missing })}
                    aria-pressed={item.missing}
                    aria-label={`第 ${index + 1} 個素材要消失`}
                  >
                    消失
                  </button>
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
