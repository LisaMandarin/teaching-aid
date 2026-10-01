"use client";

// 唸課文: the lesson text on the chalkboard for the class to read aloud, and on the right the paper
// the teacher types or opens the text on (see lib/runEditor.ts). Selected words can be given another font (注音, 簡體, 拼音…).

import { useEffect, useRef, useState } from "react";
import { RunText, useHanzi } from "./CellContent";
import Chalkboard from "./Chalkboard";
import { FolderIcon } from "./Icons";
import { FONTS, type FontId, isFontId, isHans } from "@/lib/fonts";
import { type Run, isRuns, mergeRuns, plainText, readDocxFile, setFont, toLines, withReadings } from "@/lib/readAloud";
import { drawEditor, editorFamily, fontOf, readEditor, readSelection, selectRange } from "@/lib/runEditor";

const STORAGE_KEY = "read-aloud";
const SIZES = [24, 32, 40, 48, 56, 64, 80, 96, 120];
const DEFAULT_SIZE = 48;

const SAMPLE: Run[] = [{ text: "春天來了\n花開了，草綠了，\n小鳥在樹上唱歌。", font: "bpmf-kai" }];

// ---------- Page ----------

export default function ReadAloud() {
  const editor = useRef<HTMLDivElement>(null);
  const [runs, setRuns] = useState<Run[]>(SAMPLE);
  // The font of text typed into an empty editor, and of an opened file.
  const [baseFont, setBaseFont] = useState<FontId>("bpmf-kai");
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [loaded, setLoaded] = useState(false);
  // The line the class is reading, marked on the board.
  const [current, setCurrent] = useState<number | null>(null);
  // Whether some text is selected in the editor, and the font where the cursor is.
  const [selecting, setSelecting] = useState(false);
  const [caretFont, setCaretFont] = useState<FontId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Pick up where the teacher left off.
  useEffect(() => {
    let start = SAMPLE;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (isRuns(saved?.runs)) start = mergeRuns(saved.runs);
      if (isFontId(saved?.baseFont ?? null)) setBaseFont(saved.baseFont);
      if (SIZES.includes(saved?.size)) setSize(saved.size);
    } catch {}
    setRuns(start);
    if (editor.current) drawEditor(editor.current, start);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ runs, baseFont, size }));
    } catch {}
  }, [runs, baseFont, size, loaded]);

  // Keep the font buttons in step with the selection in the editor.
  useEffect(() => {
    const update = () => {
      const root = editor.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
        setSelecting(false);
        setCaretFont(null);
        return;
      }
      setSelecting(!sel.isCollapsed);
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

  // 長[ㄓㄤˇ] becomes 長 with its reading picked; readings that don't exist are listed in the notice.
  const pickReadings = async (from: Run[]): Promise<Run[]> => {
    const done = await withReadings(from);
    if (done.notice) setNotice(done.notice);
    return done.runs;
  };

  // Pasted text comes in as plain text, in the font where it's pasted; 長[ㄓㄤˇ] picks the 破音字 reading.
  const paste = async (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!text) return;
    setNotice(null);
    const out = /[[(（【]/.test(text) ? plainText(await pickReadings([{ text, font: baseFont }])) : text;
    editor.current?.focus();
    document.execCommand("insertText", false, out);
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (plainText(runs).trim() && !confirm("要用這個檔案取代目前的課文嗎？")) return;
    setOpening(true);
    setNotice(null);
    try {
      const opened = await pickReadings(await readDocxFile(file, baseFont));
      const last = opened.at(-1);
      if (last) last.text = last.text.replace(/\n+$/, "");
      redraw(mergeRuns(opened));
      setCurrent(null);
    } catch (e) {
      setNotice((e as Error).message || "無法讀取這個檔案。");
    } finally {
      setOpening(false);
    }
  };

  const clearAll = () => {
    if (!confirm("確定要清空課文嗎？")) return;
    redraw([]);
    setCurrent(null);
    editor.current?.focus();
  };

  const lines = toLines(runs);
  const sizeIndex = SIZES.indexOf(size);

  return (
    <div className="game read">
      <header className="page-header">
        <h1 className="page-title">Read Aloud 唸課文</h1>
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
        </div>
      </header>

      <div className="read-body">
        <Chalkboard className="read-board">
          {plainText(runs).trim() ? (
            <div className="read-text" style={{ fontSize: `${size}px` }}>
              {lines.map((line, i) => (
                <p
                  key={i}
                  className={`read-line ${current === i ? "is-current" : ""} ${line.length === 0 ? "is-blank" : ""}`}
                  onClick={() => line.length > 0 && setCurrent(current === i ? null : i)}
                >
                  {line.map((run, j) => (
                    <RunText key={j} run={run} hanzi={hanzi} />
                  ))}
                </p>
              ))}
            </div>
          ) : (
            <p className="read-placeholder">在右邊輸入或上傳課文</p>
          )}
        </Chalkboard>

        <aside className="read-panel paper" aria-label="課文">
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
            className="read-editor"
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
            Word 檔裡用螢光筆標起來的字會加注音。破音字可以寫成 長[ㄓㄤˇ] 指定讀音。簡體和拼音的字在黑板上才會轉換。點黑板上的一行可以標出正在唸的地方。
          </p>
        </aside>
      </div>
    </div>
  );
}
