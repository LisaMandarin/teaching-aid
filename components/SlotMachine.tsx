"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BoardText, CellImage, textSize, useHanzi } from "./CellContent";
import Chalkboard from "./Chalkboard";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import type { Hanzi } from "@/lib/hanzi";
import { type Cell, type ParsedWorkbook, attachLocalImages } from "@/lib/lessons";
import { DEFAULT_SETUP, type ParsedSlots, type Reel, type SlotSetup, downloadSlotTemplate, parseSlots } from "@/lib/slots";
import { playDing, playReelStop, playSlotSpin } from "@/lib/sounds";

const STORAGE_KEY = "slot-machine";
const MUTE_KEY = "slot-machine-muted";
// The first reel spins this long; each reel after it stops a little later.
const SPIN_MS = 1400;
const STAGGER_MS = 550;
// About how long one cell takes to go past at full speed.
const CELL_MS = 55;
// Matches the slot-lights animation in globals.css.
const FLASH_MS = 1500;

// One reel's spin: the cells on its strip from top to bottom. The strip slides down
// from showing the last one (where the reel was) to the first (where it stops).
type Spin = { strip: number[]; duration: number; key: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;

function ReelCell({ cell, hanzi, font }: { cell: Cell | undefined; hanzi: Hanzi | null; font: FontId }) {
  if (!cell) return <div className="slot-cell" />;
  return (
    <div className="slot-cell">
      <span className="ttt-content">
        {cell.image ? (
          <CellImage key={cell.image} cell={cell} />
        ) : (
          cell.imageName && (
            <span className="ttt-img-missing">
              ⚠️ 找不到圖片
              <small>{cell.imageName}</small>
            </span>
          )
        )}
        {cell.text && (
          <span className={`ttt-text ${textSize(cell.text, !!(cell.image || cell.imageName))}`}>
            <BoardText text={cell.text} font={font} hanzi={hanzi} />
          </span>
        )}
      </span>
    </div>
  );
}

function ReelWindow({
  reel,
  stop,
  spin,
  font,
  hanzi,
  onStopped,
}: {
  reel: Reel;
  stop: number;
  spin: Spin | null;
  font: FontId;
  hanzi: Hanzi | null;
  onStopped: () => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const stopped = useRef(onStopped);
  stopped.current = onStopped;

  useLayoutEffect(() => {
    if (!spin || !strip.current) return;
    const animation = strip.current.animate(
      [{ transform: `translateY(-${(spin.strip.length - 1) * 100}%)` }, { transform: "translateY(0)" }],
      // Fast at first, then slowing down and settling with a small bounce.
      { duration: spin.duration, easing: "cubic-bezier(0.25, 0.1, 0.3, 1.04)" },
    );
    animation.onfinish = () => stopped.current();
    return () => animation.cancel();
  }, [spin]);

  const cells = spin ? spin.strip : [stop];
  return (
    <div className={`slot-window ${spin ? "is-spinning" : ""}`}>
      <div ref={strip} className="slot-strip">
        {cells.map((c, k) => (
          <ReelCell key={k} cell={reel.cells[c]} font={font} hanzi={hanzi} />
        ))}
      </div>
    </div>
  );
}

export default function SlotMachine() {
  const [setup, setSetup] = useState<SlotSetup>(DEFAULT_SETUP);
  // The cell each reel shows.
  const [stops, setStops] = useState<number[]>(DEFAULT_SETUP.reels.map(() => 0));
  // Reels the teacher has locked so they don't spin.
  const [held, setHeld] = useState<boolean[]>(DEFAULT_SETUP.reels.map(() => false));
  const [spins, setSpins] = useState<(Spin | null)[]>([]);
  // Bumped on each pull to replay the lever animation.
  const [pulls, setPulls] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParsedSlots | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let saved: { setup?: SlotSetup; stops?: number[]; held?: boolean[] } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    const s = saved?.setup?.reels?.length ? { ...DEFAULT_SETUP, ...saved.setup } : DEFAULT_SETUP;
    const fits = (list: unknown[] | undefined) => list?.length === s.reels.length;
    setSetup(s);
    setStops(fits(saved?.stops) ? saved!.stops!.map((n, i) => mod(n, s.reels[i].cells.length)) : s.reels.map(() => 0));
    setHeld(fits(saved?.held) ? saved!.held! : s.reels.map(() => false));
    setLoaded(true);
    return () => clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ setup, stops, held }));
      setStorageFull(false);
    } catch {
      // Usually the quota: too many images uploaded from the computer.
      setStorageFull(true);
    }
  }, [setup, stops, held, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [muted, loaded]);

  const spinning = spins.some(Boolean);
  const allHeld = held.every(Boolean);

  const pull = () => {
    if (spinning || allHeld) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const key = pulls + 1;
    let order = 0;
    const next = setup.reels.map((reel, i): Spin | null => {
      if (held[i]) return null;
      const n = reel.cells.length;
      const from = stops[i];
      const to = Math.floor(Math.random() * n);
      const duration = reduced ? 300 + order * 150 : SPIN_MS + order * STAGGER_MS;
      order++;
      // About duration / CELL_MS cells go past, plus however many more it takes to land on `to`.
      const base = Math.round(duration / CELL_MS);
      const length = base + mod(to - from - base, n);
      return { strip: Array.from({ length: length + 1 }, (_, k) => (from + length - k) % n), duration, key };
    });
    setPulls(key);
    setSpins(next);
    setFlashing(false);
    if (!muted) playSlotSpin(Math.max(...next.map((s) => s?.duration ?? 0)) / 1000);
  };

  const reelStopped = (i: number) => {
    const spin = spins[i];
    if (!spin) return;
    const rest = spins.map((s, j) => (j === i ? null : s));
    setStops((list) => list.map((n, j) => (j === i ? spin.strip[0] : n)));
    setSpins(rest);
    if (!muted) playReelStop();
    if (!rest.some(Boolean)) {
      if (!muted) playDing();
      setFlashing(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashing(false), FLASH_MS);
    }
  };

  const toggleHeld = (i: number) => {
    if (spinning) return;
    setHeld((list) => list.map((h, j) => (j === i ? !h : h)));
  };

  const applyImport = ({ setup: imported, warnings: importWarnings }: ParsedSlots, missingImages: string[]) => {
    setSetup(imported);
    setStops(imported.reels.map(() => 0));
    setHeld(imported.reels.map(() => false));
    setSpins([]);
    setPendingImport(null);
    const warnings = [...importWarnings];
    if (missingImages.length > 0) warnings.push(`找不到這些圖片：${missingImages.join("、")}`);
    const sizes = imported.reels.map((r) => r.cells.length).join("、");
    setNotice({ lines: [`已匯入 ${imported.reels.length} 欄，每欄的格數：${sizes}。`], warnings });
  };

  const importExcel = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const parsed = await parseSlots(file);
      if (parsed.error) setNotice({ lines: [], warnings: [parsed.error, ...parsed.warnings] });
      else if (parsed.localNames.length > 0) setPendingImport(parsed);
      else applyImport(parsed, []);
    } catch {
      setNotice({ lines: [], warnings: ["無法讀取這個檔案，請確認是 Excel（.xlsx）檔。"] });
    } finally {
      setImporting(false);
    }
  };

  const pickLocalImages = async (files: File[]) => {
    if (!pendingImport || files.length === 0) return;
    setImporting(true);
    const lessons: ParsedWorkbook["lessons"] = pendingImport.setup.reels.map((r) => ({ name: r.title, items: r.cells }));
    const missing = await attachLocalImages(lessons, files);
    setImporting(false);
    applyImport(pendingImport, missing);
  };

  const cellFont = fontFamilyOf(setup.font);
  const hanzi = useHanzi(setup.font);
  const hasTitles = setup.reels.some((r) => r.title);

  return (
    <div className="game slots">
      <header className="page-header">
        <h1 className="page-title">Slot Machine 拉霸機</h1>
        <div className="page-tools">
          <button className="btn-tag mute-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted} title={muted ? "開啟音效" : "靜音"}>
            {muted ? "🔇 靜音中" : "🔊 音效開"}
          </button>
          <button
            className={`btn-tag ${settingsOpen ? "is-on" : ""}`}
            onClick={() => setSettingsOpen((o) => !o)}
            aria-pressed={settingsOpen}
          >
            ⚙️ 設定
          </button>
        </div>
      </header>

      {settingsOpen && (
        <section className="gifts-settings">
          <div className="gifts-settings-row">
            <label className="tag-field">
              字型
              <select className="select-tag" value={setup.font} onChange={(e) => {
                  const font = e.target.value;
                  if (isFontId(font)) setSetup((s) => ({ ...s, font }));
                }}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="rewards-hint">
            {setup.fileName ? `內容來自「${setup.fileName}」：` : "目前是範例內容："}
            {setup.reels.length} 欄，每欄的格數：{setup.reels.map((r) => r.cells.length).join("、")}
          </p>

          <div className="ttt-import">
            <label className={`btn-tag ${importing ? "is-busy" : ""}`}>
              📥 匯入 Excel
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                disabled={importing || spinning}
                onChange={(e) => {
                  void importExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn-tag" onClick={() => void downloadSlotTemplate()}>
              📄 下載範本
            </button>
          </div>
        </section>
      )}

      {pendingImport && (
        <div className="ttt-notice is-pending">
          <p>這份 Excel 有 {pendingImport.localNames.length} 張圖片要從電腦選取（可以一次選多張）：</p>
          <p className="ttt-notice-files">{pendingImport.localNames.join("、")}</p>
          <div className="ttt-notice-actions">
            <label className="btn btn-primary">
              {importing ? "讀取中…" : "選擇圖片"}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={importing}
                onChange={(e) => {
                  void pickLocalImages([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn" onClick={() => applyImport(pendingImport, pendingImport.localNames)}>
              略過圖片
            </button>
            <button className="btn" onClick={() => setPendingImport(null)}>
              取消匯入
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className={`ttt-notice ${notice.warnings.length > 0 ? "is-warn" : ""}`}>
          <button className="ttt-notice-close" onClick={() => setNotice(null)} aria-label="關閉">
            ×
          </button>
          {notice.lines.map((l) => (
            <p key={l}>✅ {l}</p>
          ))}
          {notice.warnings.map((w) => (
            <p key={w}>⚠️ {w}</p>
          ))}
        </div>
      )}

      {storageFull && (
        <div className="ttt-notice is-warn">
          <p>⚠️ 瀏覽器的儲存空間不夠，拉霸機的內容沒有存起來，重新整理後會消失。請改用圖片網址（例如 Dropbox 資料夾），或先用「圖片瘦身」工具縮小圖片。</p>
        </div>
      )}

      <Chalkboard className="slots-stage">
        <div className="slot-machine" style={{ "--reels": setup.reels.length } as React.CSSProperties}>
          <div className={`slot-cabinet ${spinning ? "is-spinning" : ""} ${flashing ? "is-flashing" : ""}`}>
            <div className="slot-marquee">
              <span className="slot-lights" aria-hidden="true" />
              <span className="slot-name">拉霸機</span>
              <span className="slot-lights" aria-hidden="true" />
            </div>

            <div
              className={`slot-reels ${cellFont ? "has-cell-font" : ""}`}
              data-font={setup.font}
              style={cellFont ? ({ "--cell-font": `${cellFont}, sans-serif` } as React.CSSProperties) : undefined}
            >
              {setup.reels.map((reel, i) => (
                <div key={i} className="slot-reel">
                  {hasTitles && (
                    <span className="slot-title ttt-text">
                      {reel.title && <BoardText text={reel.title} font={setup.font} hanzi={hanzi} />}
                    </span>
                  )}
                  <ReelWindow
                    reel={reel}
                    stop={stops[i] ?? 0}
                    spin={spins[i] ?? null}
                    font={setup.font}
                    hanzi={hanzi}
                    onStopped={() => reelStopped(i)}
                  />
                  <button
                    className={`slot-hold ${held[i] ? "is-held" : ""}`}
                    onClick={() => toggleHeld(i)}
                    disabled={spinning}
                    aria-pressed={!!held[i]}
                    title={held[i] ? "這一欄不轉，按一下解除" : "固定這一欄，拉的時候不轉"}
                  >
                    {held[i] ? "🔒 固定" : "🔓 固定"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            className="slot-lever"
            onClick={pull}
            disabled={spinning || allHeld}
            aria-label="拉一下"
            title="拉一下"
          >
            <span key={pulls} className={`slot-lever-arm ${pulls > 0 ? "is-pulled" : ""}`}>
              <span className="slot-lever-knob" />
            </span>
            <span className="slot-lever-base" />
          </button>
        </div>

        <div className="controls">
          <button className="btn-chalk" onClick={pull} disabled={spinning || allHeld}>
            🎰 拉一下
          </button>
        </div>
      </Chalkboard>
    </div>
  );
}
