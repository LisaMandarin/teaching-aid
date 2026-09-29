"use client";

import { playStrokeSound } from "@/lib/sounds";

// Each entry is one stroke, drawn in order. The last one completes the man.
const strokes: React.ReactNode[] = [
  <line pathLength="1" key="base" x1="20" y1="230" x2="180" y2="230" />,
  <line pathLength="1" key="pole" x1="60" y1="230" x2="60" y2="20" />,
  <line pathLength="1" key="beam" x1="60" y1="20" x2="150" y2="20" />,
  <line pathLength="1" key="rope" x1="150" y1="20" x2="150" y2="50" />,
  <circle pathLength="1" key="head" cx="150" cy="70" r="20" />,
  <line pathLength="1" key="body" x1="150" y1="90" x2="150" y2="150" />,
  <line pathLength="1" key="larm" x1="150" y1="105" x2="120" y2="130" />,
  <line pathLength="1" key="rarm" x1="150" y1="105" x2="180" y2="130" />,
  <line pathLength="1" key="lleg" x1="150" y1="150" x2="125" y2="195" />,
  <line pathLength="1" key="rleg" x1="150" y1="150" x2="175" y2="195" />,
];

export const MAX_STROKES = strokes.length;

type Props = {
  count: number;
  onChange: (count: number) => void;
  label?: string;
  onLabelChange?: (label: string) => void;
  // In PK mode, the board whose opponent died has won and is frozen.
  won?: boolean;
};

export default function HangmanBoard({ count, onChange, label, onLabelChange, won = false }: Props) {
  const dead = count >= MAX_STROKES;

  return (
    <div className={`board ${won ? "is-won" : ""}`}>
      {label !== undefined && (
        <input
          className="board-label"
          value={label}
          onChange={(e) => onLabelChange?.(e.target.value)}
          placeholder="輸入隊名"
          aria-label="隊名"
          maxLength={20}
        />
      )}

      <svg className={`gallows ${dead ? "is-dead" : ""}`} viewBox="0 0 200 250" role="img"
        aria-label={`已畫 ${count} / ${MAX_STROKES} 筆`}>
        {strokes.slice(0, count).map((s) => (
          <g key={(s as React.ReactElement).key} className="stroke">
            {s}
          </g>
        ))}
        {dead && (
          <g className="stroke dead-eyes">
            <line pathLength="1" x1="141" y1="63" x2="147" y2="69" />
            <line pathLength="1" x1="147" y1="63" x2="141" y2="69" />
            <line pathLength="1" x1="153" y1="63" x2="159" y2="69" />
            <line pathLength="1" x1="159" y1="63" x2="153" y2="69" />
          </g>
        )}
      </svg>

      <p className={`status ${dead ? "is-dead" : ""} ${won ? "is-won" : ""}`}>
        {dead ? (
          "💀 死亡！"
        ) : won ? (
          "🏆 獲勝！"
        ) : (
          <>
            剩下 <span className="chalk-yellow">{MAX_STROKES - count}</span> 筆
          </>
        )}
      </p>

      <div className="controls">
        <button className="btn-chalk" onClick={() => {
          playStrokeSound(count + 1, MAX_STROKES);
          onChange(count + 1);
        }} disabled={dead || won}>
          多一筆
        </button>
        <button className="btn-chalk-outline" onClick={() => onChange(Math.max(0, count - 1))} disabled={count === 0}>
          退一筆
        </button>
      </div>
    </div>
  );
}
