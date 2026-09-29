"use client";

import { useEffect, useState } from "react";
import { BoardText, CellImage, textSize, useHanzi } from "./CellContent";
import Chalkboard from "./Chalkboard";
import Confetti from "./Confetti";
import { playCheer, playWriting, preloadMarkSounds, setMuted } from "@/lib/sounds";
import {
  type Cell,
  type Lesson,
  type ParsedWorkbook,
  attachLocalImages,
  downloadTemplate,
  drawBoard,
  emptyCell,
  parseWorkbook,
  readImage,
  shuffle,
} from "@/lib/lessons";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";

type Team = 0 | 1;
type Move = { cell: number; team: Team };

const SYMBOLS = ["O", "X"] as const;
const STORAGE_KEY = "tictactoe-setup";
const MUTE_KEY = "tictactoe-muted";
const FONT_KEY = "tictactoe-font";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const defaultCells = (): Cell[] =>
  ["ㄅ", "ㄆ", "ㄇ", "ㄈ", "ㄉ", "ㄊ", "ㄋ", "ㄌ", "ㄍ"].map((text) => ({ text, image: null }));

function marksOf(moves: Move[]): (Team | null)[] {
  const marks: (Team | null)[] = Array(9).fill(null);
  for (const m of moves) marks[m.cell] = m.team;
  return marks;
}

function findWinner(marks: (Team | null)[]): { team: Team; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const t = marks[a];
    if (t !== null && t === marks[b] && t === marks[c]) return { team: t, line };
  }
  return null;
}

type Notice = { lines: string[]; warnings: string[] };

function MarkIcon({ team }: { team: Team }) {
  return (
    <svg className={`ttt-mark team-${team}`} viewBox="0 0 100 100" aria-hidden>
      {team === 0 ? (
        <circle pathLength="1" cx="50" cy="50" r="34" />
      ) : (
        <>
          <line pathLength="1" x1="20" y1="20" x2="80" y2="80" />
          <line pathLength="1" x1="80" y1="20" x2="20" y2="80" style={{ animationDelay: "0.2s" }} />
        </>
      )}
    </svg>
  );
}

export default function TicTacToe() {
  const [cells, setCells] = useState<Cell[]>(defaultCells);
  const [names, setNames] = useState<[string, string]>(["O 隊", "X 隊"]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [turn, setTurn] = useState<Team>(0);
  const [starter, setStarter] = useState<Team>(0);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMutedState] = useState(false);
  // Bumped on every win so the confetti remounts and fires again.
  const [celebration, setCelebration] = useState<{ id: number; color: string } | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  // null = the board was set up by hand rather than drawn from a lesson.
  const [lessonIndex, setLessonIndex] = useState<number | null>(null);
  // An imported workbook still waiting for the teacher to pick its local image files.
  const [pendingImport, setPendingImport] = useState<ParsedWorkbook | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const [font, setFont] = useState<FontId>("plain");

  // Remember the teacher's board and team names in this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.cells?.length === 9) setCells(saved.cells);
      if (saved?.names?.length === 2) setNames(saved.names);
      if (Array.isArray(saved?.lessons)) setLessons(saved.lessons);
      if (typeof saved?.lessonIndex === "number") setLessonIndex(saved.lessonIndex);
    } catch {}
    try {
      setMutedState(localStorage.getItem(MUTE_KEY) === "1");
      const savedFont = localStorage.getItem(FONT_KEY);
      if (isFontId(savedFont)) setFont(savedFont);
    } catch {}
    setLoaded(true);
    preloadMarkSounds();
  }, []);

  useEffect(() => {
    setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [muted]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(FONT_KEY, font);
    } catch {}
  }, [font, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cells, names, lessons, lessonIndex }));
      setStorageFull(false);
    } catch {
      // Usually the quota: too many images uploaded from the computer.
      setStorageFull(true);
    }
  }, [cells, names, lessons, lessonIndex, loaded]);

  const lesson = lessonIndex !== null ? lessons[lessonIndex] : undefined;

  const marks = marksOf(moves);
  const winner = findWinner(marks);
  const full = moves.length === 9;
  const over = winner !== null || full;

  const place = (i: number) => {
    if (over || marks[i] !== null) return;
    playWriting();
    const next = [...moves, { cell: i, team: turn }];
    setMoves(next);
    setTurn(turn === 0 ? 1 : 0);
    if (findWinner(marksOf(next))) {
      playCheer();
      const color = getComputedStyle(document.documentElement).getPropertyValue(`--team-${turn}`).trim();
      setCelebration((c) => ({ id: (c?.id ?? 0) + 1, color }));
    }
  };

  const undo = () => {
    const last = moves.at(-1);
    if (!last) return;
    setMoves(moves.slice(0, -1));
    setTurn(last.team);
  };

  // New round: the other team gets to start, with 9 new questions if playing a lesson.
  const restart = () => {
    const next: Team = starter === 0 ? 1 : 0;
    if (lesson) setCells(drawBoard(lesson));
    setMoves([]);
    setStarter(next);
    setTurn(next);
  };

  const updateCell = (i: number, patch: Partial<Cell>) =>
    setCells((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const setImage = async (i: number, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      updateCell(i, { image: await readImage(file), imageName: file.name });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const setName = (t: Team, name: string) =>
    setNames((prev) => (t === 0 ? [name, prev[1]] : [prev[0], name]));

  const clearAll = () => {
    if (confirm("確定要清空九格的內容嗎？")) {
      setCells(Array.from({ length: 9 }, emptyCell));
      setLessonIndex(null);
      setMoves([]);
    }
  };

  const chooseLesson = (index: number | null, from = lessons) => {
    setLessonIndex(index);
    if (index !== null) setCells(drawBoard(from[index]));
    setMoves([]);
  };

  const applyImport = ({ lessons: imported, warnings: importWarnings, font: importFont }: ParsedWorkbook, missingImages: string[]) => {
    setLessons(imported);
    if (importFont) setFont(importFont);
    chooseLesson(0, imported);
    setPendingImport(null);
    const warnings = [...importWarnings];
    imported
      .filter((l) => l.items.length < 9)
      .forEach((l) => warnings.push(`「${l.name}」只有 ${l.items.length} 題，不足 9 題的格子會留白。`));
    if (missingImages.length > 0) warnings.push(`找不到這些圖片：${missingImages.join("、")}`);
    setNotice({
      lines: [`已匯入 ${imported.length} 課：${imported.map((l) => `${l.name}（${l.items.length} 題）`).join("、")}`],
      warnings,
    });
  };

  const importExcel = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const parsed = await parseWorkbook(file);
      if (parsed.lessons.length === 0)
        setNotice({ lines: [], warnings: ["這個檔案裡找不到題目。請用範本的格式：每個工作表一課，第一列是「文字」「圖片」。"] });
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
    const missing = await attachLocalImages(pendingImport.lessons, files);
    setImporting(false);
    applyImport(pendingImport, missing);
  };


  const cellFont = fontFamilyOf(font);
  const hanzi = useHanzi(font);

  let status: React.ReactNode;
  if (winner) status = <span className={`team-text-${winner.team}`}>🏆 {names[winner.team] || SYMBOLS[winner.team]} 獲勝！</span>;
  else if (full) status = "平手！";
  else status = <>輪到 <span className={`team-text-${turn}`}>{names[turn] || SYMBOLS[turn]}（{SYMBOLS[turn]}）</span></>;

  // A team's side of the board, next to the grid: its mark and its name.
  const team = (t: Team) => (
    <div className={`ttt-team team-${t} ${!over && turn === t ? "is-turn" : ""}`}>
      <button
        className="ttt-team-symbol"
        onClick={() => !over && setTurn(t)}
        disabled={over}
        title="換成這一隊"
      >
        {SYMBOLS[t]}
      </button>
      <input
        className="board-label ttt-team-name"
        value={names[t]}
        onChange={(e) => setName(t, e.target.value)}
        placeholder="輸入隊名"
        aria-label={`${SYMBOLS[t]} 隊隊名`}
        maxLength={20}
      />
    </div>
  );

  return (
    <div className="game ttt">
      {winner && celebration && <Confetti key={celebration.id} accent={celebration.color} />}
      <header className="page-header">
        <h1 className="page-title">Tic-Tac-Toe 圈圈叉叉</h1>
        <div className="page-tools">
          {lessons.length > 0 && (
            <label className="tag-field">
              題目
              <select
                className="select-tag"
                value={lessonIndex ?? ""}
                onChange={(e) => chooseLesson(e.target.value === "" ? null : Number(e.target.value))}
              >
                {lessons.map((l, i) => (
                  <option key={i} value={i}>
                    {l.name}（{l.items.length} 題）
                  </option>
                ))}
                <option value="">自訂（手動編輯）</option>
              </select>
            </label>
          )}
          <label className="tag-field">
            字型
            <select className="select-tag" value={font} onChange={(e) => isFontId(e.target.value) && setFont(e.target.value)}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-tag mute-btn"
            onClick={() => setMutedState((m) => !m)}
            aria-pressed={muted}
            title={muted ? "開啟音效" : "靜音"}
          >
            {muted ? "🔇 靜音中" : "🔊 音效開"}
          </button>
          <button className={`btn-tag ${editing ? "is-on" : ""}`} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
            {editing ? "✅ 完成編輯" : "✏️ 編輯題目"}
          </button>
        </div>
      </header>

      {editing && (
        <div className="ttt-import">
          <label className={`btn-tag ${importing ? "is-busy" : ""}`}>
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
          <button className="btn-tag" onClick={() => void downloadTemplate()}>
            📄 下載範本
          </button>
        </div>
      )}

      {pendingImport && (
        <div className="ttt-notice is-pending">
          <p>
            這份 Excel 有 {pendingImport.localNames.length} 張圖片要從電腦選取（可以一次選多張）：
          </p>
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
            <button
              className="btn"
              onClick={() => applyImport(pendingImport, pendingImport.localNames)}
            >
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
          <p>⚠️ 瀏覽器的儲存空間不夠，題目沒有存起來，重新整理後會消失。請改用圖片網址（例如 Dropbox 資料夾），或先用「圖片瘦身」工具縮小圖片。</p>
        </div>
      )}

      <Chalkboard className="ttt-board">
        <p className={`status ttt-status ${winner ? "is-won" : ""}`}>{status}</p>

        <div className="ttt-arena">
          {team(0)}
          <div
            className={`ttt-grid ${cellFont ? "has-cell-font" : ""}`}
            data-font={font}
            style={cellFont ? ({ "--cell-font": `${cellFont}, sans-serif` } as React.CSSProperties) : undefined}
          >
            {cells.map((cell, i) =>
              editing ? (
                <div key={i} className={`ttt-cell is-editing ${cell.image ? "has-image" : ""}`}>
                  {cell.image && (
                    <div className="ttt-thumb">
                      <CellImage key={cell.image} cell={cell} />
                      <button className="ttt-thumb-remove" onClick={() => updateCell(i, { image: null, imageName: undefined })} aria-label="移除圖片">
                        ×
                      </button>
                    </div>
                  )}
                  <input
                    className={`ttt-input ${textSize(cell.text, !!cell.image)}`}
                    value={cell.text}
                    onChange={(e) => updateCell(i, { text: e.target.value })}
                    onPaste={(e) => {
                      const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
                      if (file) {
                        e.preventDefault();
                        void setImage(i, file);
                      }
                    }}
                    placeholder="注音／國字"
                    aria-label={`第 ${i + 1} 格內容`}
                  />
                  <label className="ttt-upload">
                    🖼 {cell.image ? "換圖片" : "加圖片"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        void setImage(i, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              ) : (
                <button
                  key={i}
                  className={`ttt-cell ${marks[i] !== null ? "is-marked" : ""} ${winner?.line.includes(i) ? `is-win team-${winner.team}` : ""}`}
                  onClick={() => place(i)}
                  disabled={over || marks[i] !== null}
                  aria-label={`${cell.text || `第 ${i + 1} 格`}${marks[i] !== null ? `（${SYMBOLS[marks[i]]}）` : ""}`}
                >
                  <span className="ttt-content">
                    {cell.image && <CellImage key={cell.image} cell={cell} />}
                    {cell.text && (
                      <span className={`ttt-text ${textSize(cell.text, !!cell.image)}`}>
                        <BoardText text={cell.text} font={font} hanzi={hanzi} />
                      </span>
                    )}
                  </span>
                  {marks[i] !== null && <MarkIcon team={marks[i]} />}
                </button>
              ),
            )}
          </div>
          {team(1)}
        </div>

        <div className="controls">
          {editing ? (
            <>
              <button className="btn-chalk-outline" onClick={() => setCells(shuffle(cells))} disabled={moves.length > 0}>
                🔀 打亂位置
              </button>
              <button className="btn-chalk-ghost" onClick={clearAll}>
                清空全部
              </button>
            </>
          ) : (
            <>
              <button className="btn-chalk-outline" onClick={() => setTurn(turn === 0 ? 1 : 0)} disabled={over} title="答錯了，換另一隊">
                答錯・換隊
              </button>
              <button className="btn-chalk-outline" onClick={undo} disabled={moves.length === 0}>
                復原
              </button>
              <button className="btn-chalk" onClick={restart} disabled={moves.length === 0 && !lesson}>
                {lesson && moves.length === 0 ? "換一組題目" : "再玩一局"}
              </button>
            </>
          )}
        </div>
      </Chalkboard>
    </div>
  );
}
