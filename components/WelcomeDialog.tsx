"use client";

import { useEffect, useRef, useState } from "react";
import { LINE_QR, LINE_URL } from "@/lib/line";

const HIDE_KEY = "teaching-aid:hide-welcome";

// Greets teachers on arrival: the site is free but still in testing, so ask them to follow
// the LINE account in case the address changes.
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
    <dialog ref={ref} className="welcome" onCancel={close}>
      <h2>歡迎使用 Teaching Aid 👋</h2>
      <p>
        本網站目前<strong>完全免費</strong>，歡迎老師們盡情使用！
      </p>
      <p>不過網站仍在測試階段，網址隨時可能變更或暫停服務。</p>
      <p>
        想持續使用的話，建議先加入我們的 LINE 官方帳號。網址若有異動，我們會第一時間通知您；平時不會打擾大家。
      </p>

      <div className="welcome-line">
        <img src={LINE_QR} alt="LINE 官方帳號 QR code" width={120} height={120} />
        <a className="line-button" href={LINE_URL} target="_blank" rel="noopener noreferrer">
          加入 LINE 官方帳號
        </a>
      </div>

      <div className="welcome-footer">
        <label>
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          以後不再顯示
        </label>
        <button onClick={close}>知道了</button>
      </div>
    </dialog>
  );
}
