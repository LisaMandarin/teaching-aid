"use client";

import { useEffect, useState } from "react";
import DropZone from "./DropZone";
import { DownloadIcon, FolderIcon, SoundOffIcon, SoundOnIcon } from "./Icons";
import { downloadRoster, downloadRosterTemplate, parseRoster, type Roster } from "@/lib/rewards";
import { playCoin, preloadCoinSound } from "@/lib/sounds";

const STORAGE_KEY = "rewards-roster";
const MUTE_KEY = "rewards-muted";

const isExcel = (f: File) => /\.xlsx$/i.test(f.name);

let nextCoinId = 0;

function Chest({ full }: { full: boolean }) {
  return (
    <svg className="chest-svg" viewBox="0 0 120 100" aria-hidden="true">
      {/* Open lid, tipped back */}
      <rect className="chest-lid" x="12" y="6" width="96" height="32" rx="12" />
      <rect className="chest-gold" x="12" y="26" width="96" height="6" />
      {/* Inside */}
      <rect className="chest-inside" x="10" y="36" width="100" height="14" rx="3" />
      {full && (
        <g className="chest-coins" strokeWidth="1.5">
          <ellipse cx="60" cy="44" rx="40" ry="7" />
          <ellipse cx="42" cy="40" rx="9" ry="4" />
          <ellipse cx="66" cy="38" rx="9" ry="4" />
          <ellipse cx="80" cy="42" rx="9" ry="4" />
        </g>
      )}
      {/* Body */}
      <rect className="chest-body-wood" x="8" y="46" width="104" height="48" rx="6" />
      <rect className="chest-lid" x="8" y="46" width="104" height="6" />
      <rect className="chest-gold" x="20" y="46" width="8" height="48" />
      <rect className="chest-gold" x="92" y="46" width="8" height="48" />
      {/* Lock */}
      <rect className="chest-coins" x="50" y="54" width="20" height="22" rx="4" strokeWidth="1.5" />
      <circle className="chest-inside" cx="60" cy="63" r="3" />
      <rect className="chest-inside" x="59" y="64" width="2" height="7" />
    </svg>
  );
}

export default function Rewards() {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  // Coins still falling, per student row.
  const [falling, setFalling] = useState<{ id: number; row: number }[]>([]);
  // Rows whose chest just caught a coin, to bounce it.
  const [bumped, setBumped] = useState<Record<number, number>>({});

  // Kept in the browser so a reload in the middle of class doesn't lose the coins.
  useEffect(() => {
    preloadCoinSound();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.students) setRoster(saved);
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (roster) localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
      else localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [roster, muted, loaded]);

  const earnedToday = roster?.students.some((s) => s.coins !== s.start) ?? false;

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!isExcel(file)) return setError("請選擇 Excel 檔（.xlsx）。");
    if (earnedToday && !confirm("今天的金幣還沒下載，換成新的檔案會蓋掉。確定要換嗎？")) return;
    try {
      const { roster: next, warnings } = await parseRoster(file);
      if (next.students.length === 0) return setError("檔案裡找不到學生。第一列寫「學生」「金幣」，從第二列開始每列一位學生。");
      setRoster(next);
      setWarnings(warnings);
      setFalling([]);
    } catch {
      setError("這個 Excel 檔讀不出來，請確認檔案沒有損壞。");
    }
  };

  const change = (row: number, delta: number) =>
    setRoster((r) =>
      r && {
        ...r,
        students: r.students.map((s, i) => (i === row ? { ...s, coins: Math.max(0, s.coins + delta) } : s)),
      },
    );

  const drop = (row: number) => {
    change(row, 1);
    setFalling((f) => [...f, { id: nextCoinId++, row }]);
  };

  const landed = (id: number, row: number) => {
    setFalling((f) => f.filter((c) => c.id !== id));
    setBumped((b) => ({ ...b, [row]: (b[row] ?? 0) + 1 }));
    if (!muted) playCoin();
  };

  const picker = (label: React.ReactNode, className = "btn-tag") => (
    <label className={className}>
      {label}
      <input
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div
      className={`game rewards ${dragging ? "is-dragging" : ""}`}
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
        <div className="rewards-heading">
          <h1 className="page-title">我的獎勵</h1>
          {roster && (
            <p className="rewards-hint">
              點寶箱送一枚金幣。下課後按「下載紀錄」存到電腦，下次上課再上傳這個檔案就能接著累積。
            </p>
          )}
        </div>
        {roster && (
          <div className="page-tools">
            <button
              className="btn-tag mute-btn"
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
              title={muted ? "開啟音效" : "靜音"}
            >
              {muted ? <SoundOffIcon /> : <SoundOnIcon />}
              {muted ? "靜音中" : "音效開"}
            </button>
            {picker(
              <>
                <FolderIcon />
                換一個檔案
              </>,
            )}
            <button className="btn-board btn-board--sm" onClick={() => void downloadRoster(roster)}>
              <DownloadIcon />
              下載紀錄
            </button>
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

      {!loaded ? null : !roster ? (
        <>
          <DropZone icon="🪙">
            <strong>點這裡選擇學生名單的 Excel 檔，或把檔案拖進來</strong>
            <span className="materials-drop-hint">第一欄「學生」，第二欄「金幣」（目前累積的金幣數）</span>
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
          <button className="btn-tag rewards-template" onClick={() => void downloadRosterTemplate()}>
            <DownloadIcon />
            下載 Excel 範本
          </button>
        </>
      ) : (
        <section className="rewards-board cork cork--framed" aria-label="獎勵布告欄">
          <div className="board-sign">
            <span className="pin pin--md" aria-hidden="true" />
            <span className="pin pin--md" aria-hidden="true" />
            金幣榜
          </div>
          <ul className="rewards-grid">
            {roster.students.map((s, row) => (
              <li key={row}>
                <button
                  className="rewards-card paper"
                  onClick={() => drop(row)}
                  aria-label={`${s.name}，${s.coins} 枚金幣，點一下加一枚`}
                >
                  <span className="pin pin--md" aria-hidden="true" />
                  <span className="rewards-name" title={s.name}>
                    {s.name}
                  </span>
                  <span className="chest">
                    {falling
                      .filter((c) => c.row === row)
                      .map((c) => (
                        <span key={c.id} className="coin" onAnimationEnd={() => landed(c.id, row)} />
                      ))}
                    <span key={bumped[row] ?? 0} className={`chest-body ${bumped[row] ? "is-bumped" : ""}`}>
                      <Chest full={s.coins > 0} />
                    </span>
                  </span>
                  <span className="rewards-count">
                    <span className="coin-icon" aria-hidden="true" />
                    {s.coins}
                    {s.coins !== s.start && (
                      <span className={`badge-green rewards-today ${s.coins < s.start ? "is-down" : ""}`}>
                        {s.coins > s.start ? "+" : ""}
                        {s.coins - s.start}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  className="rewards-undo"
                  onClick={() => change(row, -1)}
                  disabled={s.coins === 0}
                  title="按錯了？收回一枚金幣"
                  aria-label={`收回${s.name}一枚金幣`}
                >
                  −1
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
