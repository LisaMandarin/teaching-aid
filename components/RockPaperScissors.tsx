"use client";

// 剪刀石頭布: two teams' hands flick between 剪刀, 石頭 and 布 until the teacher presses 停, then each
// lands on one at random. The teacher clicks the winning team to cheer it on and give it a point.

import { useEffect, useRef, useState } from "react";
import { BoardText, useHanzi } from "./CellContent";
import Chalkboard from "./Chalkboard";
import Confetti from "./Confetti";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import { plainText, withReadings } from "@/lib/readAloud";
import { playDing, playHandTick, playSoundFile, preloadSoundFile } from "@/lib/sounds";

type Team = 0 | 1;
// 0 石頭, 1 布, 2 剪刀: each one beats the one before it.
type Hand = 0 | 1 | 2;

const HANDS = [
  { emoji: "✊", name: "石頭" },
  { emoji: "✋", name: "布" },
  { emoji: "✌️", name: "剪刀" },
] as const;

const STORAGE_KEY = "rock-paper-scissors";
const MUTE_KEY = "rock-paper-scissors-muted";
const CHEER = "/sounds/cheer.m4a";
// How often the hands change while shuffling.
const SHUFFLE_MS = 90;

const randomHand = (not?: Hand): Hand => {
  const h = Math.floor(Math.random() * 3) as Hand;
  return h === not ? (((h + 1 + Math.floor(Math.random() * 2)) % 3) as Hand) : h;
};

function winnerOf([a, b]: [Hand, Hand]): Team | null {
  if (a === b) return null;
  return (a - b + 3) % 3 === 1 ? 0 : 1;
}

export default function RockPaperScissors() {
  const [names, setNames] = useState<[string, string]>(["藍隊", "橘隊"]);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [font, setFont] = useState<FontId>("plain");
  const [hands, setHands] = useState<[Hand, Hand] | null>(null);
  const [shuffling, setShuffling] = useState(false);
  // Bumped when the hands land, to replay their pop.
  const [round, setRound] = useState(0);
  // The winner of this round has had its point.
  const [scored, setScored] = useState(false);
  // Bumped on every cheer so the confetti remounts and fires again.
  const [celebration, setCelebration] = useState<{ id: number; color: string } | null>(null);
  const [editingName, setEditingName] = useState<Team | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.names?.length === 2) setNames(saved.names);
      if (saved?.scores?.length === 2) setScores(saved.scores);
      if (isFontId(saved?.font ?? null)) setFont(saved.font);
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    setLoaded(true);
    preloadSoundFile(CHEER);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ names, scores, font }));
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [names, scores, font, muted, loaded]);

  // Each team's hand changes on its own, never showing the same one twice in a row.
  useEffect(() => {
    if (!shuffling) return;
    const timer = setInterval(() => {
      setHands((h) => [randomHand(h?.[0]), randomHand(h?.[1])]);
      // Quiet while the teacher is on another page (the game stays mounted there).
      if (!muted && rootRef.current?.checkVisibility()) playHandTick();
    }, SHUFFLE_MS);
    return () => clearInterval(timer);
  }, [shuffling, muted]);

  const start = () => {
    setEditingName(null);
    setScored(false);
    // Otherwise the last round's confetti fires again as soon as this round has a winner.
    setCelebration(null);
    setShuffling(true);
  };

  const stop = () => {
    setShuffling(false);
    setHands([randomHand(), randomHand()]);
    setRound((r) => r + 1);
    if (!muted) playDing();
  };

  const winner = !shuffling && hands ? winnerOf(hands) : null;

  const cheer = (t: Team) => {
    if (winner !== t) return;
    if (!muted) playSoundFile(CHEER);
    const color = getComputedStyle(document.documentElement).getPropertyValue(`--team-${t}`).trim();
    setCelebration((c) => ({ id: (c?.id ?? 0) + 1, color }));
    if (!scored) {
      setScores((s) => (t === 0 ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]));
      setScored(true);
    }
  };

  const resetScores = () => {
    if (confirm("確定要把兩隊的分數歸零嗎？")) setScores([0, 0]);
  };

  const setName = (t: Team, name: string) =>
    setNames((prev) => (t === 0 ? [name, prev[1]] : [prev[0], name]));

  // 長[ㄓㄤˇ] becomes 長 with its reading picked, once the teacher is done typing.
  const finishName = async (t: Team) => {
    setEditingName(null);
    setNameNotice(null);
    if (!/[[(（【]/.test(names[t])) return;
    const done = await withReadings([{ text: names[t], font }]);
    setName(t, plainText(done.runs));
    if (done.notice) setNameNotice(done.notice);
  };

  const hanzi = useHanzi(font);
  const family = fontFamilyOf(font);
  const nameStyle = family ? { fontFamily: `${family}, var(--font-board-text)` } : undefined;
  const nameOf = (t: Team) => names[t].trim() || `第 ${t + 1} 隊`;

  let status: React.ReactNode;
  if (shuffling) status = "剪刀…石頭…布…";
  else if (!hands) status = "按「開始猜拳」";
  else if (winner === null) status = "平手！再猜一次";
  else
    status = (
      <>
        🏆 <span className={`team-text-${winner}`}>{nameOf(winner)}</span> 贏了！
      </>
    );

  const team = (t: Team) => {
    const hand = hands?.[t];
    const won = winner === t;
    return (
      <div className={`rps-team team-${t} ${won ? "is-winner" : ""} ${winner !== null && !won ? "is-loser" : ""}`}>
        {editingName === t ? (
          <input
            className="board-label rps-name"
            data-font={font}
            style={nameStyle}
            value={names[t]}
            onChange={(e) => setName(t, e.target.value)}
            onBlur={() => void finishName(t)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="輸入隊名"
            aria-label={`第 ${t + 1} 隊隊名`}
            maxLength={20}
            autoFocus
          />
        ) : (
          <button
            className="board-label rps-name"
            data-font={font}
            style={nameStyle}
            onClick={() => setEditingName(t)}
            title="點一下改隊名"
          >
            <BoardText text={nameOf(t)} font={font} hanzi={hanzi} />
          </button>
        )}

        <button
          className="rps-hand"
          onClick={() => cheer(t)}
          disabled={!won}
          title={won ? "按一下歡呼！" : undefined}
          aria-label={hand === undefined ? "還沒出拳" : `${nameOf(t)}出${HANDS[hand].name}${won ? "，按一下歡呼" : ""}`}
        >
          <span key={shuffling ? "shuffle" : round} className={`rps-emoji ${shuffling ? "is-shuffling" : hands ? "is-landed" : ""}`}>
            {hand === undefined ? "❔" : HANDS[hand].emoji}
          </span>
        </button>

        <p className="rps-hand-name">{hand === undefined ? " " : HANDS[hand].name}</p>
        <p className="rps-score" aria-label={`${scores[t]} 分`}>
          ⭐ {scores[t]}
        </p>
        {won && <p className="rps-cheer-hint">👆 按一下歡呼！</p>}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="game rps">
      {celebration && <Confetti key={celebration.id} accent={celebration.color} />}
      <header className="page-header">
        <h1 className="page-title">Rock Paper Scissors 剪刀石頭布</h1>
        <div className="page-tools">
          <label className="tag-field">
            隊名字型
            <select className="select-tag" value={font} onChange={(e) => isFontId(e.target.value) && setFont(e.target.value)}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-tag mute-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted} title={muted ? "開啟音效" : "靜音"}>
            {muted ? "🔇 靜音中" : "🔊 音效開"}
          </button>
        </div>
      </header>

      {nameNotice && (
        <div className="ttt-notice is-warn">
          <button className="ttt-notice-close" onClick={() => setNameNotice(null)} aria-label="關閉">
            ×
          </button>
          <p>⚠️ {nameNotice}</p>
        </div>
      )}

      <Chalkboard className="rps-board">
        <p className={`status ttt-status ${winner !== null ? "is-won" : ""}`}>{status}</p>

        <div className="rps-arena">
          {team(0)}
          <span className="rps-vs" aria-hidden="true">
            VS
          </span>
          {team(1)}
        </div>

        <div className="controls">
          {shuffling ? (
            <button className="btn-chalk rps-go" onClick={stop}>
              ✋ 停！
            </button>
          ) : (
            <button className="btn-chalk rps-go" onClick={start}>
              ✊ {hands ? "再猜一次" : "開始猜拳"}
            </button>
          )}
          <button className="btn-chalk-ghost" onClick={resetScores} disabled={shuffling || (scores[0] === 0 && scores[1] === 0)}>
            分數歸零
          </button>
        </div>
        <p className="rps-hint">點隊名可以改名；破音字可以寫成 長[ㄓㄤˇ]。</p>
      </Chalkboard>
    </div>
  );
}
