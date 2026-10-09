"use client";

import { useEffect, useRef, useState } from "react";
import { LINE_QR, LINE_URL } from "@/lib/line";

// Bumped to v2 for the trial-shutdown notice, so teachers who hid the old welcome still see it.
const HIDE_KEY = "teaching-aid:hide-welcome-v2";

// Greets teachers on arrival: this trial site closes on 2026-12-31, so ask them to join the LINE
// account and leave feedback to get the official site and an activation code.
export default function WelcomeDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    let hidden = false;
    try {
      hidden = localStorage.getItem(HIDE_KEY) === "1";
    } catch {}
    if (!hidden) ref.current?.showModal();
  }, []);

  const close = () => {
    try {
      if (hide) localStorage.setItem(HIDE_KEY, "1");
    } catch {}
    ref.current?.close();
  };

  return (
    <dialog ref={ref} className="welcome lined-paper" onCancel={close} aria-labelledby="welcome-title">
      <span className="tape welcome-tape-l" aria-hidden="true" />
      <span className="tape welcome-tape-r" aria-hidden="true" />
      <h2 id="welcome-title">歡迎使用教學便利通</h2>
      <p>
        本網站為<strong>試用版</strong>，將於 <strong>2026 年 12 月 31 日</strong>關閉。
      </p>
      <p>
        請先加入我們的 LINE 官方帳號，試用幾次後再填寫使用心得，即可獲得<strong>正式網站</strong>與<strong>開通碼</strong>。
      </p>

      <div className="welcome-line">
        <img src={LINE_QR} alt="LINE 官方帳號 QR code" width={120} height={120} />
        <a className="btn-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
          加入 LINE 官方帳號
        </a>
      </div>

      <div className="welcome-footer">
        <label>
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          以後不再顯示
        </label>
        <button className="btn-board" onClick={close}>
          知道了
        </button>
      </div>
    </dialog>
  );
}
