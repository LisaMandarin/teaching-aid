// A chalkboard in its wooden frame, with the chalk tray (a few sticks of chalk and an eraser) underneath.
export default function Chalkboard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="board-wrap">
      <div className={`chalkboard ${className}`}>{children}</div>
      <div className="chalk-tray" aria-hidden="true">
        <span className="stick" />
        <span className="stick" />
        <span className="stick" />
        <span className="eraser" />
      </div>
    </div>
  );
}
