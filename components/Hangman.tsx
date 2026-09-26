"use client";

import { useEffect, useState } from "react";
import HangmanBoard, { MAX_STROKES } from "./HangmanBoard";
import { setMuted } from "@/lib/sounds";

const MUTE_KEY = "hangman-muted";

type Mode = "solo" | "pk";

export default function Hangman() {
  const [mode, setMode] = useState<Mode>("solo");
  const [counts, setCounts] = useState<[number, number]>([0, 0]);
  const [names, setNames] = useState<[string, string]>(["A 隊", "B 隊"]);
  const [muted, setMutedState] = useState(false);

  // Remember the mute choice in this browser.
  useEffect(() => {
    try {
      setMutedState(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [muted]);

  const setCount = (i: 0 | 1) => (n: number) =>
    setCounts((prev) => (i === 0 ? [n, prev[1]] : [prev[0], n]));

  const setName = (i: 0 | 1) => (name: string) =>
    setNames((prev) => (i === 0 ? [name, prev[1]] : [prev[0], name]));

  const switchMode = (m: Mode) => {
    setMode(m);
    setCounts([0, 0]);
  };

  const aDead = counts[0] >= MAX_STROKES;
  const bDead = counts[1] >= MAX_STROKES;

  return (
    <div className="hangman">
      <div className="hangman-header">
        <h1 className="hangman-title">Hangman</h1>
        <button
          className="mute-btn"
          onClick={() => setMutedState((m) => !m)}
          aria-pressed={muted}
          title={muted ? "開啟音效" : "靜音"}
        >
          {muted ? "🔇 靜音中" : "🔊 音效開"}
        </button>
      </div>

      <div className="mode-switch" role="tablist">
        <button role="tab" aria-selected={mode === "solo"}
          className={`mode-btn ${mode === "solo" ? "is-active" : ""}`} onClick={() => switchMode("solo")}>
          個人賽
        </button>
        <button role="tab" aria-selected={mode === "pk"}
          className={`mode-btn ${mode === "pk" ? "is-active" : ""}`} onClick={() => switchMode("pk")}>
          PK 賽
        </button>
      </div>

      {mode === "solo" ? (
        <HangmanBoard count={counts[0]} onChange={setCount(0)} />
      ) : (
        <div className="pk">
          <HangmanBoard label={names[0]} onLabelChange={setName(0)} count={counts[0]} onChange={setCount(0)} won={bDead && !aDead} />
          <div className="pk-vs">VS</div>
          <HangmanBoard label={names[1]} onLabelChange={setName(1)} count={counts[1]} onChange={setCount(1)} won={aDead && !bDead} />
        </div>
      )}

      <button className="btn" onClick={() => setCounts([0, 0])} disabled={counts[0] === 0 && counts[1] === 0}>
        重新開始
      </button>
    </div>
  );
}
