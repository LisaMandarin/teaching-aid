"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#f43f5e", "#f59e0b", "#facc15", "#10b981", "#3b82f6", "#a855f7", "#ec4899"];
const GRAVITY = 0.3;
const DRAG = 0.985;
const DURATION = 5000;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  w: number;
  h: number;
  color: string;
};

type Props = {
  // Extra colors mixed in more often, e.g. the winning team's color.
  accent?: string;
};

// Full-screen party-popper confetti. Fires once on mount; remount (change `key`) to fire again.
export default function Confetti({ accent }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const dpr = devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener("resize", resize);

    const palette = accent ? [...COLORS, accent, accent, accent] : COLORS;
    // Launch speed scales with screen height so the burst reaches about 3/4 of the way up.
    const power = Math.sqrt(innerHeight / 800) * 22;
    const pieces: Piece[] = [];

    const fire = (x: number, direction: 1 | -1, count: number) => {
      for (let i = 0; i < count; i++) {
        const angle = ((55 + Math.random() * 30) * Math.PI) / 180;
        const speed = power * (0.55 + Math.random() * 0.55);
        const ribbon = Math.random() < 0.3;
        pieces.push({
          x,
          y: innerHeight + 10,
          vx: Math.cos(angle) * speed * direction,
          vy: -Math.sin(angle) * speed,
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.3,
          flip: Math.random() * Math.PI * 2,
          flipSpeed: 0.08 + Math.random() * 0.12,
          w: ribbon ? 4 : 8 + Math.random() * 6,
          h: ribbon ? 18 + Math.random() * 12 : 6 + Math.random() * 6,
          color: palette[Math.floor(Math.random() * palette.length)],
        });
      }
    };

    fire(0, 1, 110);
    fire(innerWidth, -1, 110);
    // A smaller second pop so the celebration doesn't end too quickly.
    const second = setTimeout(() => {
      fire(0, 1, 60);
      fire(innerWidth, -1, 60);
    }, 450);

    const startedAt = performance.now();
    let last = startedAt;
    let frame = 0;

    const tick = (now: number) => {
      // Physics is tuned per 60fps frame; scale by real elapsed time.
      const dt = Math.min((now - last) / (1000 / 60), 3);
      last = now;
      const elapsed = now - startedAt;

      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.min(1, (DURATION - elapsed) / 1000);

      for (const p of pieces) {
        p.vx *= DRAG ** dt;
        p.vy = p.vy * DRAG ** dt + GRAVITY * dt;
        // Paper flutters: cap the falling speed and sway side to side.
        if (p.vy > 3.5) p.vy = 3.5;
        p.flip += p.flipSpeed * dt;
        p.x += (p.vx + (p.vy > 0 ? Math.sin(p.flip) * 1.2 : 0)) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (elapsed < DURATION) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(second);
      removeEventListener("resize", resize);
    };
  }, [accent]);

  return <canvas ref={ref} className="confetti" aria-hidden />;
}
