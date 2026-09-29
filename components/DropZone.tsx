// A sheet of paper pinned to a framed cork board, with the area to click or drop files on marked in dashes.
// The children are the text and the hidden file <input>; clicking anywhere on the paper opens the picker.
export default function DropZone({ icon, busy = false, children }: { icon: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className="drop-board cork cork--framed">
      <label className={`materials-drop paper ${busy ? "is-busy" : ""}`}>
        <span className="pin pin--lg" aria-hidden="true" />
        <span className="materials-drop-zone">
          <span className="materials-drop-icon">{icon}</span>
          {children}
        </span>
      </label>
    </div>
  );
}
