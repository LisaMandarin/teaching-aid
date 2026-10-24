"use client";

// Warnings about a game's saved data: this change couldn't be saved, or last time's couldn't be read.
export default function StorageNotice({
  full,
  fullText,
  broken,
  onCloseBroken,
}: {
  full: boolean;
  // What wasn't saved and what to do about it, after "瀏覽器的儲存空間不夠，".
  fullText: string;
  broken: boolean;
  onCloseBroken: () => void;
}) {
  return (
    <>
      {full && (
        <div className="ttt-notice is-warn" role="alert">
          <p>⚠️ 瀏覽器的儲存空間不夠，{fullText}</p>
        </div>
      )}
      {broken && (
        <div className="ttt-notice is-warn">
          <button className="ttt-notice-close" onClick={onCloseBroken} aria-label="關閉">×</button>
          <p>⚠️ 上次存的內容讀不出來，已經換成預設內容。</p>
        </div>
      )}
    </>
  );
}
