"use client";

import { useEffect, useState } from "react";
import DropZone from "./DropZone";
import { downloadNamesTemplate, parseNames } from "@/lib/draw";
import { playDing, playRattle } from "@/lib/sounds";

const STORAGE_KEY = "draw-list";
const MUTE_KEY = "draw-muted";
const SHAKE_MS = 1200;
// How long the chosen stick takes to come out and land in front of the cup; matches .draw-picked-* in globals.css.
const STICK_MS = 1000;

const isExcel = (f: File) => /\.xlsx$/i.test(f.name);

type List = {
  fileName: string;
  names: string[];
  // Indexes into `names`, in the order they were drawn.
  history: number[];
  // Indexes of students who are away today; they stay out of the cup.
  absent: number[];
  // Put each drawn stick aside so nobody is called twice until 重新開始.
  noRepeat: boolean;
};

// One fortune stick: a wooden body with a pointed red tip, standing on its bottom at y = 230,
// with a student's name written down the body.
function Stick({ x, top, name }: { x: number; top: number; name: string }) {
  const w = 18;
  const tip = 32;
  const body = 230 - top - tip;
  // Shrink long names so they fit on the body.
  const size = Math.min(13, (body - 12) / Math.max(name.length, 1));
  return (
    <>
      <rect x={x - w / 2} y={top + tip - 2} width={w} height={body + 2} rx="2" fill="#ecc98f" stroke="#b7894a" strokeWidth="1" />
      <path
        d={`M${x - w / 2} ${top + tip} L${x - w / 2} ${top + 14} L${x} ${top} L${x + w / 2} ${top + 14} L${x + w / 2} ${top + tip} Z`}
        fill="#dc2626"
        stroke="#991b1b"
        strokeWidth="1"
      />
      <text x={x} y={top + tip + 6} className="draw-stick-name" fontSize={size}>
        {name}
      </text>
    </>
  );
}

function Cup({ names, shaking, picked }: { names: string[]; shaking: boolean; picked: { name: string; key: number } | null }) {
  // Side by side inside the mouth of the cup, never past its rim.
  const shown = names.slice(0, 7);
  return (
    <svg className={`draw-cup ${shaking ? "is-shaking" : ""}`} viewBox="0 -60 200 300" aria-hidden="true">
      {shown.map((name, i) => {
        const spread = shown.length === 1 ? 0 : i / (shown.length - 1) - 0.5;
        const x = 100 + spread * (shown.length - 1) * 19;
        const top = 58 + ((i * 37) % 5) * 4;
        return (
          <g key={i} transform={`rotate(${spread * 3} ${x} 230)`}>
            {/* Each stick rattles on its own beat while the cup shakes. */}
            <g
              className={shaking ? "draw-jiggle" : undefined}
              style={{
                transformOrigin: `${x}px 230px`,
                animationDelay: `${-((i * 53) % 7) * 0.03}s`,
                animationDuration: `${0.14 + ((i * 29) % 4) * 0.02}s`,
              }}
            >
              <Stick x={x} top={top} name={name} />
            </g>
          </g>
        );
      })}
      {/* The chosen stick rises out of the middle, behind the cup's front... */}
      {picked && (
        <g key={`rise-${picked.key}`} className="draw-picked-rise">
          <Stick x={100} top={58} name={picked.name} />
        </g>
      )}
      {/* Cup: red, with a rim and two gold lines under it. */}
      <path d="M24 142 L176 142 L166 232 Q100 237 34 232 Z" fill="#dc2626" />
      <rect x="18" y="126" width="164" height="16" rx="3" fill="#dc2626" stroke="#b91c1c" strokeWidth="1.5" />
      <line x1="25" y1="151" x2="175" y2="151" stroke="#facc15" strokeWidth="3" />
      <line x1="25.5" y1="160" x2="174.5" y2="160" stroke="#facc15" strokeWidth="3" />
      {/* ...then, once clear of the rim, drops down in front of the cup. */}
      {picked && (
        <g key={`front-${picked.key}`} className="draw-picked-front">
          <Stick x={100} top={58} name={picked.name} />
        </g>
      )}
    </svg>
  );
}

export default function NameDraw() {
  const [list, setList] = useState<List | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [shaking, setShaking] = useState(false);
  // Name flashing by while the cup shakes.
  const [flicker, setFlicker] = useState("");
  // Bumped on every draw so the stick animation replays.
  const [drawCount, setDrawCount] = useState(0);

  // Kept in the browser so a reload in the middle of class doesn't put everyone back in the cup.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.names) setList(saved);
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (list) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      else localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [list, muted, loaded]);

  const pool = list
    ? list.names
        .map((_, i) => i)
        .filter((i) => !list.absent.includes(i) && !(list.noRepeat && list.history.includes(i)))
    : [];
  const current = list && list.history.length > 0 ? list.names[list.history[list.history.length - 1]] : null;

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!isExcel(file)) return setError("請選擇 Excel 檔（.xlsx）。");
    try {
      const { names, warnings } = await parseNames(file);
      if (names.length === 0) return setError("檔案裡找不到名字。第一列寫「學生」，從第二列開始每列一位學生。");
      setList({ fileName: file.name, names, history: [], absent: [], noRepeat: list?.noRepeat ?? true });
      setWarnings(warnings);
    } catch {
      setError("這個 Excel 檔讀不出來，請確認檔案沒有損壞。");
    }
  };

  const draw = () => {
    if (!list || shaking || pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setShaking(true);
    if (!muted) playRattle(SHAKE_MS / 1000);

    const names = pool.map((i) => list.names[i]);
    const flip = setInterval(() => setFlicker(names[Math.floor(Math.random() * names.length)]), 80);
    setTimeout(() => {
      clearInterval(flip);
      setShaking(false);
      setFlicker("");
      setList((l) => l && { ...l, history: [...l.history, pick] });
      setDrawCount((n) => n + 1);
      // Chime when the stick lands in front of the cup.
      if (!muted) setTimeout(playDing, STICK_MS);
    }, SHAKE_MS);
  };

  const toggleAbsent = (i: number) =>
    setList(
      (l) => l && { ...l, absent: l.absent.includes(i) ? l.absent.filter((a) => a !== i) : [...l.absent, i] },
    );

  const restart = () => {
    if (list && list.history.length > 0 && !confirm("把所有籤都放回籤筒，重新開始？")) return;
    setList((l) => l && { ...l, history: [] });
  };

  const picker = (
    <label className="btn-tag">
      📂 換一個名單
      <input
        type="file"
        accept=".xlsx"
        hidden
        disabled={shaking}
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div
      className={`game draw ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void open(e.dataTransfer.files[0]);
      }}
    >
      <header className="page-header">
        <h1 className="page-title">抽籤筒</h1>
        {list && (
          <div className="page-tools">
            <button
              className="btn-tag mute-btn"
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
              title={muted ? "開啟音效" : "靜音"}
            >
              {muted ? "🔇 靜音中" : "🔊 音效開"}
            </button>
            {picker}
          </div>
        )}
      </header>

      {error && (
        <div className="ttt-notice is-warn">
          <button className="ttt-notice-close" onClick={() => setError("")} aria-label="關閉">
            ×
          </button>
          <p>⚠️ {error}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="ttt-notice is-warn">
          <button className="ttt-notice-close" onClick={() => setWarnings([])} aria-label="關閉">
            ×
          </button>
          {warnings.map((w) => (
            <p key={w}>⚠️ {w}</p>
          ))}
        </div>
      )}

      {!loaded ? null : !list ? (
        <>
          <DropZone icon="🎋">
            <strong>點這裡選擇學生名單的 Excel 檔，或把檔案拖進來</strong>
            <span className="materials-drop-hint">第一欄「學生」，從第二列開始每列一位學生（「我的獎勵」的檔案也可以用）</span>
            <input
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => {
                void open(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </DropZone>
          <button className="btn-tag rewards-template" onClick={() => void downloadNamesTemplate()}>
            ⬇️ 下載 Excel 範本
          </button>
        </>
      ) : (
        <div className="draw-body">
          <section className="draw-stage paper">
            <div className={`draw-result ${shaking ? "is-flicker" : ""}`} aria-live="polite">
              {shaking ? (
                flicker
              ) : current ? (
                <span key={drawCount} className="draw-name">
                  {current}
                </span>
              ) : (
                <span className="draw-placeholder">準備好了嗎？</span>
              )}
            </div>

            <div className="draw-cup-wrap">
              <Cup
                names={pool.map((i) => list.names[i])}
                shaking={shaking}
                picked={!shaking && current && drawCount > 0 ? { name: current, key: drawCount } : null}
              />
            </div>

            {pool.length > 0 ? (
              <button className="btn btn-primary draw-btn" onClick={draw} disabled={shaking}>
                {shaking ? "抽籤中…" : "🎋 抽一支籤"}
              </button>
            ) : (
              <div className="draw-empty">
                <p>{list.noRepeat && list.history.length > 0 ? "🎉 每個人都抽過了！" : "籤筒裡沒有籤了。"}</p>
                {list.history.length > 0 && (
                  <button className="btn btn-primary" onClick={() => setList((l) => l && { ...l, history: [] })}>
                    🔄 全部放回去
                  </button>
                )}
              </div>
            )}
            <p className="rewards-hint">籤筒裡還有 {pool.length} 支籤</p>
          </section>

          <aside className="draw-list paper">
            <div className="draw-list-head">
              <strong>名單（{list.names.length} 人）</strong>
              <button className="btn draw-restart" onClick={restart} disabled={list.history.length === 0 || shaking}>
                🔄 重新開始
              </button>
            </div>
            <label className="draw-option">
              <input
                type="checkbox"
                checked={list.noRepeat}
                onChange={(e) => setList((l) => l && { ...l, noRepeat: e.target.checked })}
              />
              抽過的不再抽
            </label>
            <p className="draw-list-hint">點名字可以標成缺席，缺席的人不會被抽到。</p>
            <ul>
              {list.names.map((name, i) => {
                const order = list.history.lastIndexOf(i);
                const absent = list.absent.includes(i);
                return (
                  <li key={i}>
                    <button
                      className={`draw-list-item ${absent ? "is-absent" : ""} ${order !== -1 ? "is-drawn" : ""}`}
                      onClick={() => toggleAbsent(i)}
                      disabled={shaking}
                      title={absent ? "點一下取消缺席" : "點一下標成缺席"}
                    >
                      <span className="draw-list-name">{name}</span>
                      {absent ? (
                        <span className="draw-badge is-absent">缺席</span>
                      ) : (
                        order !== -1 && <span className="draw-badge">第 {order + 1} 位</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
