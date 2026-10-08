"use client";

// 抽牌: one or two decks on the board, each a deck of playing cards or the teacher's own cards imported
// from Excel. Shuffle a deck and draw its top card, either face up straight away or face down for the
// teacher to turn over (and peek at first, if they like).

import { useEffect, useRef, useState } from "react";
import { BoardText, CellImage, textSize, useHanzi } from "./CellContent";
import Chalkboard from "./Chalkboard";
import { type CardSetup, DEFAULT_SETUP, MAX_DECKS, type ParsedCards, downloadCardTemplate, parseCards } from "@/lib/cards";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import type { Hanzi } from "@/lib/hanzi";
import { type Cell, type ParsedWorkbook, attachLocalImages, shuffle } from "@/lib/lessons";
import { playCardFlick, playCardShuffle } from "@/lib/sounds";

// A card's place in its deck: 0–51 for playing cards (suit is card / 13, rank is card % 13),
// or the index of an imported card.
type Card = number;
// `open`: the last card drawn is face up.
type Deck = { pile: Card[]; drawn: Card[]; open: boolean };

const SUITS = [
  { symbol: "♠", name: "黑桃", red: false },
  { symbol: "♥", name: "紅心", red: true },
  { symbol: "♦", name: "方塊", red: true },
  { symbol: "♣", name: "梅花", red: false },
] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const POKER_SIZE = 52;
const DECK_NAMES = ["第一副", "第二副"];

const STORAGE_KEY = "card-draw";
const MUTE_KEY = "card-draw-muted";
// Long enough for the riffle animation.
const SHUFFLE_MS = 700;

const suitOf = (c: Card) => SUITS[Math.floor(c / 13)];
const rankOf = (c: Card) => RANKS[c % 13];

const cardsOf = (setup: CardSetup, i: number) => setup.decks[i] ?? null;
const sizeOf = (setup: CardSetup, i: number) => cardsOf(setup, i)?.length ?? POKER_SIZE;

const nameOf = (cards: Cell[] | null, c: Card) =>
  cards ? cards[c].text || cards[c].imageName || "圖片" : `${suitOf(c).name} ${rankOf(c)}`;

const ordered = (size: number) => Array.from({ length: size }, (_, i) => i);
const newDeck = (size: number): Deck => ({ pile: shuffle(ordered(size)), drawn: [], open: false });

// A saved deck still has every card exactly once.
function isDeck(d: unknown, size: number): d is Deck {
  const deck = d as Deck;
  if (!Array.isArray(deck?.pile) || !Array.isArray(deck?.drawn) || typeof deck.open !== "boolean") return false;
  const cards = [...deck.pile, ...deck.drawn];
  return cards.length === size && new Set(cards).size === size && cards.every((c) => Number.isInteger(c) && c >= 0 && c < size);
}

function PokerFace({ card }: { card: Card }) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  return (
    <span className={`pcard-face ${suit.red ? "is-red" : ""}`}>
      <span className="pcard-corner">
        {rank}
        <br />
        {suit.symbol}
      </span>
      <span className="pcard-pip">{suit.symbol}</span>
      <span className="pcard-corner is-bottom">
        {rank}
        <br />
        {suit.symbol}
      </span>
    </span>
  );
}

// An imported card: its picture and/or words, like a 圈圈叉叉 cell.
function CustomFace({ cell, font, hanzi }: { cell: Cell; font: FontId; hanzi: Hanzi | null }) {
  return (
    <span className="pcard-face is-custom">
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
    </span>
  );
}

function PlayingCard({
  face,
  name,
  open,
  peeking,
  onReveal,
}: {
  face: React.ReactNode;
  name: string;
  open: boolean;
  peeking: boolean;
  onReveal?: () => void;
}) {
  return (
    <button
      className={`pcard is-dealt ${open || peeking ? "is-open" : ""} ${peeking ? "is-peeking" : ""}`}
      onClick={onReveal}
      disabled={open || !onReveal}
      aria-label={open ? name : "蓋著的牌，點一下開牌"}
      title={open ? undefined : "點一下開牌"}
    >
      <span className="pcard-inner">
        {face}
        <span className="pcard-back" />
      </span>
    </button>
  );
}

export default function CardDraw() {
  const [setup, setSetup] = useState<CardSetup>(DEFAULT_SETUP);
  // Unshuffled until mounted, so the server and the browser render the same thing.
  const [decks, setDecks] = useState<Deck[]>([{ pile: ordered(POKER_SIZE), drawn: [], open: false }]);
  const [faceDown, setFaceDown] = useState(false);
  const [shuffling, setShuffling] = useState<number[]>([]);
  const [peeking, setPeeking] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParsedCards | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let saved: { setup?: CardSetup; decks?: unknown; faceDown?: unknown } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    const s = Array.isArray(saved?.setup?.decks) ? { ...DEFAULT_SETUP, ...saved.setup } : DEFAULT_SETUP;
    const savedDecks = saved?.decks;
    const fits =
      Array.isArray(savedDecks) &&
      savedDecks.length >= 1 &&
      savedDecks.length <= MAX_DECKS &&
      savedDecks.every((d, i) => isDeck(d, sizeOf(s, i)));
    setSetup(s);
    setDecks(fits ? (savedDecks as Deck[]) : [newDeck(sizeOf(s, 0))]);
    if (typeof saved?.faceDown === "boolean") setFaceDown(saved.faceDown);
    setLoaded(true);
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ setup, decks, faceDown }));
      setStorageFull(false);
    } catch {
      // Usually the quota: too many images uploaded from the computer.
      setStorageFull(true);
    }
  }, [setup, decks, faceDown, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [muted, loaded]);

  const updateDeck = (i: number, change: (d: Deck) => Deck) => setDecks((ds) => ds.map((d, j) => (j === i ? change(d) : d)));

  const setDeckCount = (n: number) => {
    setPeeking(null);
    setDecks((ds) => (n === 1 ? ds.slice(0, 1) : ds.length === 1 ? [...ds, newDeck(sizeOf(setup, 1))] : ds));
  };

  // Putting the drawn cards back and shuffling the whole deck.
  const shuffleDecks = (which: number[]) => {
    if (which.some((i) => shuffling.includes(i))) return;
    setPeeking(null);
    setShuffling((s) => [...s, ...which]);
    if (!muted) playCardShuffle(SHUFFLE_MS / 1000);
    timers.current.push(
      window.setTimeout(() => {
        setDecks((ds) => ds.map((d, j) => (which.includes(j) ? newDeck(sizeOf(setup, j)) : d)));
        setShuffling((s) => s.filter((i) => !which.includes(i)));
      }, SHUFFLE_MS),
    );
  };

  const drawFrom = (which: number[]) => {
    const ready = which.filter((i) => !shuffling.includes(i) && decks[i]?.pile.length);
    if (ready.length === 0) return;
    setPeeking(null);
    setDecks((ds) =>
      ds.map((d, j) => (ready.includes(j) && d.pile.length ? { pile: d.pile.slice(1), drawn: [...d.drawn, d.pile[0]], open: !faceDown } : d)),
    );
    if (!muted) playCardFlick();
  };

  const reveal = (i: number) => {
    setPeeking(null);
    updateDeck(i, (d) => ({ ...d, open: true }));
    if (!muted) playCardFlick();
  };

  // Turning off 先蓋牌 turns over the cards still lying face down.
  const changeFaceDown = (down: boolean) => {
    setFaceDown(down);
    if (!down) setDecks((ds) => ds.map((d) => (d.drawn.length && !d.open ? { ...d, open: true } : d)));
  };

  // New cards mean new decks: every deck starts over, shuffled.
  const startWith = (next: CardSetup, deckCount: number) => {
    setSetup(next);
    setPeeking(null);
    setDecks(Array.from({ length: deckCount }, (_, i) => newDeck(sizeOf(next, i))));
  };

  const applyImport = ({ setup: imported, warnings: importWarnings }: ParsedCards, missingImages: string[]) => {
    // Two decks when the file has cards for 第二副; otherwise just the imported one.
    startWith(imported, imported.decks[1] ? 2 : 1);
    setPendingImport(null);
    const warnings = [...importWarnings];
    if (missingImages.length > 0) warnings.push(`找不到這些圖片：${missingImages.join("、")}`);
    const counts = imported.decks.flatMap((d, i) => (d ? [`${DECK_NAMES[i]} ${d.length} 張`] : []));
    setNotice({ lines: [`已匯入：${counts.join("、")}。`], warnings });
  };

  const importExcel = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const parsed = await parseCards(file);
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
    const lessons: ParsedWorkbook["lessons"] = pendingImport.setup.decks.flatMap((d, i) =>
      d ? [{ name: DECK_NAMES[i], items: d }] : [],
    );
    const missing = await attachLocalImages(lessons, files);
    setImporting(false);
    applyImport(pendingImport, missing);
  };

  const backToPoker = () => {
    if (!confirm("確定要把兩副都改回撲克牌嗎？匯入的卡片會被刪除。")) return;
    startWith({ ...DEFAULT_SETUP, font: setup.font }, decks.length);
    setNotice(null);
  };

  const cellFont = fontFamilyOf(setup.font);
  const hanzi = useHanzi(setup.font);
  const fontStyle = cellFont ? { fontFamily: `${cellFont}, var(--font-board-text)` } : undefined;
  const imported = setup.decks.some(Boolean);

  const faceOf = (cards: Cell[] | null, c: Card) =>
    cards ? <CustomFace cell={cards[c]} font={setup.font} hanzi={hanzi} /> : <PokerFace card={c} />;

  // A drawn card, written small under the deck.
  const chip = (cards: Cell[] | null, c: Card) => {
    if (!cards)
      return (
        <li key={c} className={suitOf(c).red ? "is-red" : ""} aria-label={nameOf(cards, c)}>
          {suitOf(c).symbol}
          {rankOf(c)}
        </li>
      );
    const cell = cards[c];
    return (
      <li key={c} className="is-custom" style={fontStyle} aria-label={nameOf(cards, c)}>
        {cell.text ? (
          <BoardText text={cell.text} font={setup.font} hanzi={hanzi} />
        ) : cell.image ? (
          <img src={cell.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          "🖼️"
        )}
      </li>
    );
  };

  const deckView = (deck: Deck, i: number) => {
    const cards = cardsOf(setup, i);
    const current = deck.drawn.at(-1);
    const isShuffling = shuffling.includes(i);
    const hidden = current !== undefined && !deck.open;
    // The card lying face down isn't listed, or it would give it away.
    const history = hidden ? deck.drawn.slice(0, -1) : deck.drawn;
    const size = deck.pile.length + deck.drawn.length;
    const stack = Math.min(6, Math.ceil((deck.pile.length / size) * 6));

    return (
      <section key={i} className={`card-deck deck-${i}`} aria-label={decks.length > 1 ? DECK_NAMES[i] : "牌"}>
        {decks.length > 1 && <h2 className="card-deck-name">{DECK_NAMES[i]}</h2>}

        <div className="card-table">
          <div className="card-pile-wrap">
            <button
              className={`card-pile ${isShuffling ? "is-shuffling" : ""}`}
              style={{ "--stack": stack } as React.CSSProperties}
              onClick={() => drawFrom([i])}
              disabled={isShuffling || deck.pile.length === 0}
              aria-label={`抽一張，剩 ${deck.pile.length} 張`}
              title="點一下抽一張"
            >
              {deck.pile.length > 0 ? <span className="pcard-back" /> : <span className="card-empty">沒牌了</span>}
              {isShuffling && <span className="pcard-back is-riffle" />}
            </button>
            <p className="card-count">剩 {deck.pile.length} 張</p>
          </div>

          <div className="card-slot">
            {current === undefined ? (
              <span className="card-slot-empty">{isShuffling ? "洗牌中…" : "抽一張牌"}</span>
            ) : (
              <PlayingCard
                key={deck.drawn.length}
                face={faceOf(cards, current)}
                name={nameOf(cards, current)}
                open={deck.open}
                peeking={peeking === i}
                onReveal={hidden ? () => reveal(i) : undefined}
              />
            )}
            <p className="card-count">{hidden ? (peeking === i ? "偷看中…" : "點牌開牌") : " "}</p>
          </div>
        </div>

        <div className="controls card-controls">
          <button className="btn-chalk" onClick={() => drawFrom([i])} disabled={isShuffling || deck.pile.length === 0}>
            🃏 抽一張
          </button>
          {hidden && (
            <button
              className="btn-chalk-outline card-peek"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setPeeking(i);
              }}
              onPointerUp={() => setPeeking(null)}
              onPointerCancel={() => setPeeking(null)}
              onLostPointerCapture={() => setPeeking(null)}
              onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && setPeeking(i)}
              onKeyUp={() => setPeeking(null)}
              onBlur={() => setPeeking(null)}
              onContextMenu={(e) => e.preventDefault()}
              title="按住偷看，放開就蓋回去"
            >
              👀 偷看
            </button>
          )}
          <button className="btn-chalk-ghost" onClick={() => shuffleDecks([i])} disabled={isShuffling}>
            🔀 洗牌
          </button>
        </div>

        {history.length > 0 && (
          <ol className="card-history" aria-label="抽過的牌">
            {history.map((c) => chip(cards, c))}
          </ol>
        )}
      </section>
    );
  };

  const all = decks.map((_, i) => i);
  const describe = (i: number) => `${DECK_NAMES[i]}：${setup.decks[i] ? `匯入的卡片 ${setup.decks[i]!.length} 張` : "撲克牌 52 張"}`;

  return (
    <div className="game card-game">
      <header className="page-header">
        <h1 className="page-title">Draw a Card 抽牌</h1>
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
              卡片字型
              <select
                className="select-tag"
                value={setup.font}
                onChange={(e) => {
                  const font = e.target.value;
                  if (isFontId(font)) setSetup((s) => ({ ...s, font }));
                }}
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="rewards-hint">
            {setup.fileName ? `內容來自「${setup.fileName}」：` : "目前是撲克牌，可以匯入自己的卡片（文字或圖片）："}
            {[0, 1].map(describe).join("；")}
          </p>

          <div className="ttt-import">
            <label className={`btn-tag ${importing ? "is-busy" : ""}`}>
              📥 匯入 Excel
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                disabled={importing || shuffling.length > 0}
                onChange={(e) => {
                  void importExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn-tag" onClick={() => void downloadCardTemplate()}>
              📄 下載範本
            </button>
            {imported && (
              <button className="btn-tag" onClick={backToPoker}>
                🃏 改回撲克牌
              </button>
            )}
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
          <p>⚠️ 瀏覽器的儲存空間不夠，抽牌的卡片沒有存起來，重新整理後會消失。請改用圖片網址（例如 Dropbox 資料夾），或先用「圖片瘦身」工具縮小圖片。</p>
        </div>
      )}

      <Chalkboard className="card-board">
        <div className="board-toolbar">
          <div className="chalk-segment" role="group" aria-label="幾副牌">
            <button aria-pressed={decks.length === 1} onClick={() => setDeckCount(1)}>
              一副牌
            </button>
            <button aria-pressed={decks.length === 2} onClick={() => setDeckCount(2)}>
              兩副牌
            </button>
          </div>
          <div className="chalk-segment" role="group" aria-label="抽出來的牌">
            <button aria-pressed={!faceDown} onClick={() => changeFaceDown(false)}>
              馬上開牌
            </button>
            <button aria-pressed={faceDown} onClick={() => changeFaceDown(true)}>
              先蓋牌
            </button>
          </div>
        </div>

        <div
          className={`card-decks is-${decks.length} ${cellFont ? "has-cell-font" : ""}`}
          data-font={setup.font}
          style={cellFont ? ({ "--cell-font": `${cellFont}, sans-serif` } as React.CSSProperties) : undefined}
        >
          {decks.map(deckView)}
        </div>

        {decks.length > 1 && (
          <div className="controls">
            <button className="btn-chalk" onClick={() => drawFrom(all)} disabled={decks.every((d, i) => shuffling.includes(i) || d.pile.length === 0)}>
              🃏 兩副一起抽
            </button>
            <button className="btn-chalk-ghost" onClick={() => shuffleDecks(all)} disabled={shuffling.length > 0}>
              🔀 兩副一起洗
            </button>
          </div>
        )}
      </Chalkboard>
    </div>
  );
}
