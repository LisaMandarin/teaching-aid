"use client";

// 填空: the lesson text on the chalkboard with some words taken out, and the words shuffled on cards
// underneath for the students to drag into the blanks. On the right, the paper the teacher types or opens
// the text on (see lib/runEditor.ts): selected words become a blank with 挖空, and any words can be given another font.
//
// Cards are dragged with pointer events, so they also work with a finger on a touch screen or whiteboard.

import { useEffect, useRef, useState } from "react";
import { RunText, useHanzi } from "./CellContent";
import Chalkboard from "./Chalkboard";
import Confetti from "./Confetti";
import { FolderIcon } from "./Icons";
import { type Blank, blanksOf, shuffle, slotWidth, toggleBlank, touchesBlank } from "@/lib/fillBlank";
import { FONTS, type FontId, isFontId, isHans } from "@/lib/fonts";
import { type Run, isRuns, mergeRuns, plainText, readDocxFile, setFont, toLines, withReadings } from "@/lib/readAloud";
import { drawEditor, editorFamily, fontOf, readEditor, readSelection, selectRange } from "@/lib/runEditor";
import { playDing, playSoundFile, playUhOh, preloadSoundFile } from "@/lib/sounds";

const STORAGE_KEY = "fill-blank";
const SIZES = [24, 32, 40, 48, 56, 64, 80, 96, 120];
const DEFAULT_SIZE = 48;
const CHEER = "/sounds/cheer.m4a";

const F: FontId = "bpmf-kai";
const SAMPLE: Run[] = [
  { text: "春天來了\n", font: F },
  { text: "花", font: F, blank: 1 },
  { text: "開了，", font: F },
  { text: "草", font: F, blank: 2 },
  { text: "綠了，\n小鳥在樹上", font: F },
  { text: "唱歌", font: F, blank: 3 },
  { text: "。", font: F },
];

type Hanzi = ReturnType<typeof useHanzi>;

// A card being dragged: where the pointer is, and where on the card it was picked up.
type Drag = { card: number; pointer: number; x: number; y: number; dx: number; dy: number };

function CardText({ blank, hanzi }: { blank: Blank; hanzi: Hanzi }) {
  return blank.runs.map((r, i) => <RunText key={i} run={r} hanzi={hanzi} />);
}

// A small tilt per card so the pile looks laid out by hand, the same each time.
const tilt = (id: number) => (((id * 37) % 7) - 3) * 0.6;

export default function FillBlank() {
  const editor = useRef<HTMLDivElement>(null);
  const [runs, setRuns] = useState<Run[]>(SAMPLE);
  // The font of text typed into an empty editor, and of an opened file.
  const [baseFont, setBaseFont] = useState<FontId>(F);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [editing, setEditing] = useState(true);
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Whether some text is selected in the editor, whether the selection is on a blank, and the font where the cursor is.
  const [selecting, setSelecting] = useState(false);
  const [onBlank, setOnBlank] = useState(false);
  const [caretFont, setCaretFont] = useState<FontId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // The game: the cards in their shuffled order, which card is in which blank, and the card dragged now.
  const [order, setOrder] = useState<number[]>([]);
  const [placed, setPlaced] = useState<Record<number, number>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  // The card that went to the wrong blank, shaken back in the pile; the key restarts the shake.
  const [wrong, setWrong] = useState<{ card: number; key: number } | null>(null);
  const [celebration, setCelebration] = useState<number | null>(null);

  // Pick up where the teacher left off.
  useEffect(() => {
    let start = SAMPLE;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (isRuns(saved?.runs)) start = mergeRuns(saved.runs);
      if (isFontId(saved?.baseFont ?? null)) setBaseFont(saved.baseFont);
      if (SIZES.includes(saved?.size)) setSize(saved.size);
      if (typeof saved?.editing === "boolean") setEditing(saved.editing);
      if (typeof saved?.muted === "boolean") setMuted(saved.muted);
    } catch {}
    setRuns(start);
    if (editor.current) drawEditor(editor.current, start);
    setLoaded(true);
    preloadSoundFile(CHEER);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ runs, baseFont, size, editing, muted }));
    } catch {}
  }, [runs, baseFont, size, editing, muted, loaded]);

  const blanks = blanksOf(runs);
  const byId = new Map(blanks.map((b) => [b.id, b]));

  // A new deal whenever the blanks change (not while the teacher types elsewhere in the text).
  const dealKey = JSON.stringify(blanks.map((b) => [b.id, b.answer]));
  const deal = () => {
    setOrder(shuffle(blanks.map((b) => b.id)));
    setPlaced({});
    setWrong(null);
    setCelebration(null);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(deal, [dealKey]);

  // Keep the buttons in step with the selection in the editor.
  useEffect(() => {
    const update = () => {
      const root = editor.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
        setSelecting(false);
        setOnBlank(false);
        setCaretFont(null);
        return;
      }
      setSelecting(!sel.isCollapsed);
      const { runs: now, start, end } = readSelection(root, baseFont);
      setOnBlank(start !== undefined && touchesBlank(now, start, end));
      const node = sel.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      const span = el?.closest("[data-font]");
      setCaretFont(span && root.contains(span) ? fontOf(span) : baseFont);
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [baseFont]);

  const hanzi = useHanzi(runs.some((r) => isHans(r.font)) ? "hans" : "plain");

  const readBack = () => {
    if (editor.current) setRuns(readEditor(editor.current, baseFont).runs);
  };

  const redraw = (next: Run[]) => {
    setRuns(next);
    if (editor.current) drawEditor(editor.current, next);
  };

  // The selected words get the font; with nothing selected, the whole text does.
  const applyFont = (font: FontId) => {
    const root = editor.current;
    if (!root) return;
    const { runs: now, start, end } = readSelection(root, baseFont);
    if (start !== undefined && start < end) {
      redraw(setFont(now, start, end, font));
      selectRange(root, start, end);
      setCaretFont(font);
      return;
    }
    setBaseFont(font);
    redraw(now.map((r) => ({ ...r, font })));
  };

  // 挖空: the selected words become a blank, or the blank under the cursor is put back.
  const applyBlank = () => {
    const root = editor.current;
    if (!root) return;
    const { runs: now, start, end } = readSelection(root, baseFont);
    if (start === undefined) {
      setNotice("先在課文裡選取要挖空的字詞。");
      return;
    }
    const next = toggleBlank(now, start, end);
    if ("error" in next) {
      setNotice(next.error);
      return;
    }
    setNotice(null);
    redraw(next);
    selectRange(root, start, end);
  };

  // Pasted text comes in as plain text, in the font where it's pasted; 長[ㄓㄤˇ] picks the 破音字 reading.
  const paste = async (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!text) return;
    setNotice(null);
    let out = text;
    if (/[[(（【]/.test(text)) {
      const done = await withReadings([{ text, font: baseFont }]);
      if (done.notice) setNotice(done.notice);
      out = plainText(done.runs);
    }
    editor.current?.focus();
    document.execCommand("insertText", false, out);
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (plainText(runs).trim() && !confirm("要用這個檔案取代目前的課文嗎？")) return;
    setOpening(true);
    setNotice(null);
    try {
      const done = await withReadings(await readDocxFile(file, baseFont, true));
      if (done.notice) setNotice(done.notice);
      const last = done.runs.at(-1);
      if (last) last.text = last.text.replace(/\n+$/, "");
      redraw(mergeRuns(done.runs));
    } catch (e) {
      setNotice((e as Error).message || "無法讀取這個檔案。");
    } finally {
      setOpening(false);
    }
  };

  const clearAll = () => {
    if (!confirm("確定要清空課文嗎？")) return;
    redraw([]);
    editor.current?.focus();
  };

  // ---------- Dragging the cards ----------

  const slotAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]");
    return el ? Number(el.dataset.slot) : null;
  };

  const pickUp = (e: React.PointerEvent<HTMLElement>, card: number) => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setDrag({ card, pointer: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top });
    setWrong(null);
  };

  const drop = (card: number, slot: number | null) => {
    if (slot === null || placed[slot] !== undefined) return;
    if (byId.get(card)?.answer === byId.get(slot)?.answer) {
      const next = { ...placed, [slot]: card };
      setPlaced(next);
      if (Object.keys(next).length === blanks.length) {
        setCelebration(Date.now());
        if (!muted) playSoundFile(CHEER);
      } else if (!muted) playDing();
    } else {
      setWrong({ card, key: Date.now() });
      if (!muted) playUhOh();
    }
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointer) return;
      setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY });
      setHoverSlot(slotAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointer) return;
      drop(drag.card, e.type === "pointerup" ? slotAt(e.clientX, e.clientY) : null);
      setDrag(null);
      setHoverSlot(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  // ---------- Page ----------

  const lines = toLines(runs);
  const sizeIndex = SIZES.indexOf(size);
  const placedCards = new Set(Object.values(placed));
  const pile = order.filter((id) => byId.has(id) && !placedCards.has(id));
  const done = blanks.length > 0 && pile.length === 0;
  const dragged = drag ? byId.get(drag.card) : undefined;

  // Each line of the board, with the runs of a blank together in one slot.
  const drawLine = (line: Run[]) => {
    const parts: (Run | Blank)[] = [];
    for (const r of line) {
      if (r.blank === undefined) {
        parts.push(r);
        continue;
      }
      const last = parts.at(-1);
      if (last && "id" in last && last.id === r.blank) continue;
      const blank = byId.get(r.blank);
      if (blank) parts.push(blank);
    }
    return parts.map((p, j) => {
      if (!("id" in p)) return <RunText key={j} run={p} hanzi={hanzi} />;
      const card = placed[p.id];
      return (
        <span
          key={j}
          data-slot={p.id}
          className={`fill-slot ${card !== undefined ? "is-filled" : ""} ${hoverSlot === p.id ? "is-hover" : ""}`}
        >
          {card !== undefined && <CardText blank={byId.get(card)!} hanzi={hanzi} />}
        </span>
      );
    });
  };

  return (
    <div className="game fill">
      <header className="page-header">
        <h1 className="page-title">Fill in the Blanks 填空</h1>
        <div className="page-tools">
          <div className="read-size" role="group" aria-label="黑板字的大小">
            <button className="btn-tag" onClick={() => setSize(SIZES[sizeIndex - 1])} disabled={sizeIndex <= 0} aria-label="字變小">
              A−
            </button>
            <button
              className="btn-tag"
              onClick={() => setSize(SIZES[sizeIndex + 1])}
              disabled={sizeIndex >= SIZES.length - 1}
              aria-label="字變大"
            >
              A＋
            </button>
          </div>
          <button className="btn-tag" onClick={deal} disabled={blanks.length === 0}>
            🔀 重新洗牌
          </button>
          <button
            className="btn-tag mute-btn"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={muted}
            title={muted ? "開啟音效" : "靜音"}
          >
            {muted ? "🔇 靜音中" : "🔊 音效開"}
          </button>
          <button className={`btn-tag ${editing ? "is-on" : ""}`} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
            {editing ? "✅ 完成編輯" : "✏️ 編輯課文"}
          </button>
        </div>
      </header>

      <div className="read-body">
        <div className="fill-main">
          <Chalkboard className="read-board">
            {plainText(runs).trim() ? (
              <div
                className="read-text fill-text"
                style={{ fontSize: `${size}px`, "--slot-width": `${slotWidth(blanks)}em` } as React.CSSProperties}
              >
                {lines.map((line, i) => (
                  <p key={i} className={`fill-line ${line.length === 0 ? "is-blank" : ""}`}>
                    {drawLine(line)}
                  </p>
                ))}
              </div>
            ) : (
              <p className="read-placeholder">在右邊輸入或上傳課文</p>
            )}
          </Chalkboard>

          <section className="fill-pile cork" aria-label="單字卡" style={{ fontSize: `${Math.max(24, size * 0.8)}px` }}>
            {blanks.length === 0 ? (
              <p className="fill-pile-empty paper">在右邊的課文選取字詞，按「挖空」就會變成單字卡</p>
            ) : done ? (
              <p className="fill-pile-empty paper">🎉 全部答對了！</p>
            ) : (
              pile.map((id) => (
                <button
                  key={wrong?.card === id ? `${id}-${wrong.key}` : id}
                  className={`fill-card paper ${drag?.card === id ? "is-lifted" : ""} ${wrong?.card === id ? "is-wrong" : ""}`}
                  style={{ rotate: `${tilt(id)}deg` }}
                  onPointerDown={(e) => pickUp(e, id)}
                  aria-label={`單字卡：${byId.get(id)!.answer}`}
                >
                  <CardText blank={byId.get(id)!} hanzi={hanzi} />
                </button>
              ))
            )}
          </section>
        </div>

        {/* Hidden rather than removed, so the editor keeps its text. */}
        <aside className="read-panel paper" aria-label="課文" hidden={!editing}>
          <span className="tape" aria-hidden="true" />
          <div className="read-panel-head">
            <h2>課文</h2>
            <label className={`btn-tag btn-tag--sm ${opening ? "is-busy" : ""}`}>
              <FolderIcon />
              上傳檔案
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hidden
                disabled={opening}
                onChange={(e) => {
                  void openFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn-tag btn-tag--sm" onClick={clearAll}>
              清空
            </button>
          </div>

          <button
            className={`fill-blank-btn ${onBlank ? "is-on" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyBlank}
            disabled={!selecting && !onBlank}
          >
            {onBlank ? "↩︎ 取消挖空" : "✂️ 挖空（選取的字詞變成單字卡）"}
          </button>

          <div className="read-fonts" role="group" aria-label="字型">
            <p className="read-fonts-hint">{selecting ? "選取的字改成：" : "整篇改成（先選取文字可以只改一部分）："}</p>
            {FONTS.map((f) => (
              <button
                key={f.id}
                className={`read-font ${caretFont === f.id ? "is-on" : ""}`}
                // Keep the selection in the editor when the button is pressed.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFont(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>

          <div
            ref={editor}
            className="read-editor fill-editor"
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="課文內容"
            data-placeholder="在這裡輸入課文，或上傳 .docx 檔"
            style={{ fontFamily: editorFamily(baseFont) }}
            spellCheck={false}
            onInput={readBack}
            onPaste={(e) => void paste(e)}
          />

          {notice && <p className="read-notice">⚠️ {notice}</p>}
          <p className="read-hint">
            選取字詞按「挖空」，那些字就從黑板上拿掉，變成下面的單字卡；游標放在挖空的字上再按一次可以取消。Word
            檔裡加底線的字會自動挖空，用螢光筆標起來的字會加注音（和唸課文可以用同一份檔案）。破音字可以寫成 長[ㄓㄤˇ] 指定讀音。簡體和拼音的字在黑板上才會轉換。
          </p>
        </aside>
      </div>

      {drag && dragged && (
        <div
          className="fill-card paper is-dragging"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, fontSize: `${Math.max(24, size * 0.8)}px` }}
          aria-hidden="true"
        >
          <CardText blank={dragged} hanzi={hanzi} />
        </div>
      )}
      {done && celebration && <Confetti key={celebration} />}
    </div>
  );
}
