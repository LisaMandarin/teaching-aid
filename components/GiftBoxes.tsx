"use client";

import { useEffect, useRef, useState } from "react";
import { BoardText, CellImage, pinyinLine, useHanzi } from "./CellContent";
import Confetti from "./Confetti";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import type { Hanzi } from "@/lib/hanzi";
import { type Cell, type ParsedWorkbook, attachLocalImages } from "@/lib/lessons";
import {
  DEFAULT_SETUP,
  type Gift,
  type GiftSetup,
  KINDS,
  type ParsedGifts,
  SHAKE_SOUND,
  SOUND_FILES,
  customColor,
  downloadGiftTemplate,
  parseGifts,
  randomColors,
  soundOfGift,
  soundUrl,
} from "@/lib/gifts";
import { shuffle } from "@/lib/lessons";
import { playSoundFile, preloadSoundFile } from "@/lib/sounds";

const STORAGE_KEY = "gifts-setup";
const MUTE_KEY = "gifts-muted";
// The box shakes as long as drum.mp3 plays.
const SHAKE_MS = 1500;
// The gift rising out of the box and landing in front of it; matches .gift-item.is-new in globals.css.
const GIFT_MS = 1200;
// The gift is fully out of the box halfway through: that's when it's revealed.
const PEAK_MS = GIFT_MS / 2;
// Matches the gifts-boom animation in globals.css.
const BOOM_MS = 600;

type Round = {
  gifts: Gift[];
  opened: boolean[];
  // Used when the color mode is 隨機; a new set every round.
  colors: string[];
};

type Reveal = { index: number; key: number };

// One box per gift, in a new order every round.
const newRound = (setup: GiftSetup): Round => ({
  gifts: shuffle(setup.gifts),
  opened: Array(setup.gifts.length).fill(false),
  colors: randomColors(setup.gifts.length),
});

const kindOf = (gift: Gift) => KINDS.find((k) => k.id === gift.kind)!;

// A light box (yellow, silver…) gets a red ribbon; the rest a gold one.
function ribbonFor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.62 ? "#dc2626" : "#fde047";
}

// How wide the text is, in ems, so the cover can size it to fill the label on one line.
// 注音 fonts put the 注音 beside each character, which makes it about 1.3× as wide;
// 拼音 above a character is often wider than the character. 只有漢語拼音 is measured as its letters.
function textWidth(text: string, font: FontId, hanzi: Hanzi | null): number {
  if (font === "pinyin-only" && hanzi) text = pinyinLine(hanzi.convert(text));
  const han = font === "plain" || font === "hans" ? 1 : font === "zhuyin-only" ? 0.9 : font === "hans-pinyin" ? 1.5 : 1.3;
  let width = 0;
  for (const ch of text.replace(/[\u{E0100}-\u{E01EF}\uFE00-\uFE0F]/gu, "").trim())
    width += /[\p{Script=Han}\p{Script=Bopomofo}\u3000-\u303F\uFF00-\uFFEF]/u.test(ch) ? han : ch === " " ? 0.3 : 0.6;
  return Math.max(width, 1);
}

// The box, with its cover (picture and/or text) on the front, or else its number.
function BoxArt({ number, cover, font, hanzi }: { number: number; cover?: Cell; font: FontId; hanzi: Hanzi | null }) {
  const hasCover = !!cover && (!!cover.text || !!cover.image || !!cover.imageName);
  return (
    <div className="gift-art">
      <svg className="gift-box" viewBox="0 0 120 120" aria-hidden="true">
      <rect className="gift-paper" x="16" y="52" width="88" height="62" rx="3" />
      <path className="gift-inside" d="M16 52 L104 52 L97 61 L23 61 Z" />
      <rect x="16" y="52" width="88" height="5" fill="rgba(0,0,0,0.15)" />
      <rect className="gift-ribbon" x="53" y="52" width="14" height="62" />
      {!hasCover && (
        <>
          <circle cx="60" cy="88" r="13" fill="#fff" />
          <text x="60" y="88" className="gift-number">
            {number}
          </text>
        </>
      )}
      <g className="gift-lid">
        <path className="gift-ribbon" d="M60 38 C 44 12, 24 26, 58 38 Z" />
        <path className="gift-ribbon" d="M60 38 C 76 12, 96 26, 62 38 Z" />
        <rect className="gift-paper" x="10" y="37" width="100" height="18" rx="3" />
        <rect x="10" y="37" width="100" height="18" rx="3" fill="rgba(255,255,255,0.18)" />
        <rect className="gift-ribbon" x="53" y="37" width="14" height="18" />
        <circle className="gift-ribbon" cx="60" cy="37" r="5" />
      </g>
      </svg>
      {hasCover && (
        <div className="gift-cover">
          <span className="ttt-content">
            {(cover.image || cover.imageName) &&
              (cover.image ? (
                <CellImage key={cover.image} cell={cover} />
              ) : (
                <span className="ttt-img-missing">
                  ⚠️ 找不到圖片
                  <small>{cover.imageName}</small>
                </span>
              ))}
            {cover.text && (
              <span
                className={`ttt-text gift-cover-text ${cover.image || cover.imageName ? "is-caption" : ""}`}
                style={{ "--width": textWidth(cover.text, font, hanzi) } as React.CSSProperties}
              >
                <BoardText text={cover.text} font={font} hanzi={hanzi} />
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function GiftFace({ gift }: { gift: Gift }) {
  const [failed, setFailed] = useState(false);
  let visual: React.ReactNode = null;
  if (gift.image && !failed)
    // Google Drive refuses images requested with another site as the referrer.
    visual = <img src={gift.image} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  // A picture that failed to load, or a local file the teacher skipped.
  else if (gift.image || gift.imageName)
    visual = (
      <span className="gift-missing">
        ⚠️ 找不到圖片
        <small>{gift.imageName}</small>
      </span>
    );
  else if (gift.kind === "bomb") visual = <span className="gift-emoji">💣</span>;
  return (
    <>
      {visual}
      {gift.text && <span className={`gift-name ${visual ? "" : "is-big"}`}>{gift.text}</span>}
    </>
  );
}

export default function GiftBoxes() {
  const [setup, setSetup] = useState<GiftSetup>(DEFAULT_SETUP);
  const [round, setRound] = useState<Round | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The box shaking before it opens.
  const [shaking, setShaking] = useState<number | null>(null);
  // The box whose gift is coming out; its animation only plays once.
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // The last gift revealed, shown in the banner. Bumped key restarts confetti/explosion.
  const [result, setResult] = useState<Reveal | null>(null);
  // The whole stage shakes for a moment when a bomb goes off.
  const [boom, setBoom] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParsedGifts | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let saved: { setup?: GiftSetup; round?: Round } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    const s = saved?.setup?.gifts ? { ...DEFAULT_SETUP, ...saved.setup } : DEFAULT_SETUP;
    setSetup(s);
    setRound(saved?.round?.gifts?.length === s.gifts.length ? saved.round : newRound(s));
    setLoaded(true);
    return () => timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ setup, round }));
      setStorageFull(false);
    } catch {
      // Usually the quota: too many images uploaded from the computer.
      setStorageFull(true);
    }
  }, [setup, round, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [muted, loaded]);

  // Load the sounds ahead of time so they play right away.
  useEffect(() => {
    [SHAKE_SOUND, ...SOUND_FILES].forEach((s) => preloadSoundFile(soundUrl(s)));
  }, []);

  const play = (sound: string) => {
    if (!muted) playSoundFile(soundUrl(sound));
  };
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const busy = shaking !== null || reveal !== null;
  const colorOf = (i: number) =>
    setup.colorMode === "custom" || !round?.colors[i] ? customColor(setup, i) : round.colors[i];

  const open = (i: number) => {
    if (!round || busy || round.opened[i]) return;
    const gift = round.gifts[i];
    const key = (result?.key ?? 0) + 1;
    setShaking(i);
    play(SHAKE_SOUND);
    later(SHAKE_MS, () => {
      setShaking(null);
      setRound((r) => r && { ...r, opened: r.opened.map((o, j) => o || j === i) });
      setReveal({ index: i, key });
    });
    later(SHAKE_MS + PEAK_MS, () => {
      play(soundOfGift(gift));
      setResult({ index: i, key });
      if (gift.kind === "bomb") {
        setBoom(true);
        later(BOOM_MS, () => setBoom(false));
      }
    });
    later(SHAKE_MS + GIFT_MS, () => setReveal(null));
  };

  const restart = () => {
    if (busy) return;
    setRound(newRound(setup));
    setResult(null);
  };

  const openedCount = round?.opened.filter(Boolean).length ?? 0;
  const allOpened = round !== null && openedCount === round.opened.length;

  const confirmRestart = () => {
    if (openedCount > 0 && !allOpened && !confirm("還有禮物盒沒打開，確定要重新開始嗎？")) return;
    restart();
  };

  const openAll = () => {
    if (busy) return;
    setRound((r) => r && { ...r, opened: r.opened.map(() => true) });
    setResult(null);
  };

  const changeSetup = (patch: Partial<GiftSetup>) => setSetup((s) => ({ ...s, ...patch }));

  const setBoxColor = (i: number, hex: string) => {
    const colors = Array.from({ length: Math.max(setup.colors.length, i + 1) }, (_, j) => customColor(setup, j));
    colors[i] = hex;
    changeSetup({ colors });
  };

  const applyImport = ({ setup: imported, warnings: importWarnings }: ParsedGifts, missingImages: string[]) => {
    setSetup(imported);
    setRound(newRound(imported));
    setResult(null);
    setPendingImport(null);
    const warnings = [...importWarnings];
    if (missingImages.length > 0) warnings.push(`找不到這些圖片：${missingImages.join("、")}`);
    const tally = KINDS.map((k) => `${k.name} ${imported.gifts.filter((g) => g.kind === k.id).length}`).join("、");
    setNotice({ lines: [`已匯入 ${imported.gifts.length} 份禮物（${tally}），一份一個禮物盒。`], warnings });
  };

  const importExcel = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const parsed = await parseGifts(file);
      if (parsed.setup.gifts.length === 0)
        setNotice({ lines: [], warnings: ["這個檔案裡找不到禮物。請用範本的格式：「禮物」工作表第一列是「名稱」「圖片」「種類」「數量」「音效」。"] });
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
    const lessons: ParsedWorkbook["lessons"] = [
      { name: "", items: pendingImport.setup.gifts },
      { name: "", items: pendingImport.setup.covers },
    ];
    const missing = await attachLocalImages(lessons, files);
    setImporting(false);
    applyImport(pendingImport, missing);
  };

  const lastGift = result && round ? round.gifts[result.index] : null;
  const coverFont = fontFamilyOf(setup.font);
  const hanzi = useHanzi(setup.font);

  return (
    <div className="gifts">
      {lastGift?.kind === "good" && <Confetti key={result!.key} />}

      <div className="materials-toolbar">
        <h1 className="materials-title">開禮物</h1>
        <button className="mute-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted} title={muted ? "開啟音效" : "靜音"}>
          {muted ? "🔇 靜音中" : "🔊 音效開"}
        </button>
        <button
          className={`mute-btn ${settingsOpen ? "is-on" : ""}`}
          onClick={() => setSettingsOpen((o) => !o)}
          aria-pressed={settingsOpen}
        >
          ⚙️ 設定
        </button>
      </div>

      {settingsOpen && (
        <section className="gifts-settings">
          <div className="gifts-settings-row">
            <label className="ttt-lesson">
              禮物盒顏色：
              <select
                value={setup.colorMode}
                onChange={(e) => changeSetup({ colorMode: e.target.value === "custom" ? "custom" : "random" })}
              >
                <option value="random">隨機</option>
                <option value="custom">自訂</option>
              </select>
            </label>
            <label className="ttt-lesson">
              封面字型：
              <select value={setup.font} onChange={(e) => isFontId(e.target.value) && changeSetup({ font: e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {setup.colorMode === "custom" && (
            <div className="gifts-swatches">
              {Array.from({ length: setup.gifts.length }, (_, i) => (
                <label key={i} className="gifts-swatch" title={`第 ${i + 1} 個禮物盒的顏色`}>
                  {i + 1}
                  <input type="color" value={customColor(setup, i)} onChange={(e) => setBoxColor(i, e.target.value)} />
                </label>
              ))}
            </div>
          )}

          <p className="rewards-hint">
            {setup.fileName ? `禮物來自「${setup.fileName}」：` : "目前是範例禮物："}
            {KINDS.map((k) => `${k.name} ${setup.gifts.filter((g) => g.kind === k.id).length} 份`).join("、")}
          </p>

          <div className="ttt-import">
            <label className={`btn ${importing ? "is-busy" : ""}`}>
              📥 匯入 Excel
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                disabled={importing || busy}
                onChange={(e) => {
                  void importExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn" onClick={() => void downloadGiftTemplate()}>
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
          <p>⚠️ 瀏覽器的儲存空間不夠，禮物沒有存起來，重新整理後會消失。請改用圖片網址（例如 Dropbox 資料夾），或先用「圖片瘦身」工具縮小圖片。</p>
        </div>
      )}

      {round && (
        <section className={`gifts-stage ${boom ? "is-boom" : ""}`}>
          <div className="gifts-result" aria-live="polite">
            {shaking !== null ? (
              <span className="gifts-placeholder">第 {shaking + 1} 個禮物盒…</span>
            ) : lastGift ? (
              <span key={result!.key} className={`gifts-result-text kind-${lastGift.kind}`}>
                {kindOf(lastGift).emoji} {lastGift.text || kindOf(lastGift).name}
              </span>
            ) : (
              <span className="gifts-placeholder">{allOpened ? "禮物都打開了！" : "選一個禮物盒吧！"}</span>
            )}
          </div>

          <ul
            className={`gifts-grid ${coverFont ? "has-cell-font" : ""}`}
            data-font={setup.font}
            style={coverFont ? ({ "--cell-font": `${coverFont}, sans-serif` } as React.CSSProperties) : undefined}
          >
            {round.gifts.map((gift, i) => {
              const opened = round.opened[i];
              const isNew = reveal?.index === i;
              const color = colorOf(i);
              return (
                <li
                  key={i}
                  className={`gift-cell ${opened ? "is-open" : ""} ${shaking === i ? "is-shaking" : ""} ${isNew ? "is-revealing" : ""}`}
                  style={{ "--box": color, "--ribbon": ribbonFor(color) } as React.CSSProperties}
                >
                  <button
                    className="gift-hit"
                    onClick={() => open(i)}
                    disabled={opened || busy}
                    aria-label={opened ? `第 ${i + 1} 個禮物盒：${gift.text || kindOf(gift).name}` : `打開第 ${i + 1} 個禮物盒`}
                  >
                    <BoxArt number={i + 1} cover={setup.covers[i]} font={setup.font} hanzi={hanzi} />
                  </button>
                  {opened && (
                    <div key={isNew ? reveal.key : "done"} className={`gift-item kind-${gift.kind} ${isNew ? "is-new" : ""}`}>
                      <GiftFace gift={gift} />
                    </div>
                  )}
                  {isNew && gift.kind === "bomb" && <div className="gift-boom" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>

          <div className="controls">
            <button className="btn" onClick={openAll} disabled={busy || allOpened}>
              👀 全部打開
            </button>
            <button className="btn btn-primary" onClick={confirmRestart} disabled={busy}>
              🔄 重新開始
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
