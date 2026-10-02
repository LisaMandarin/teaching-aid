"use client";

// 立可拍: press the camera's button and a photo comes out of the slot, fills the screen while it develops,
// and goes on the board beside the camera when clicked. The photos are image files the teacher imports
// (see lib/camera.ts), handed out in order or at random. Under the board is a paper for the teacher's words.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BoardText, useHanzi } from "./CellContent";
import Chalkboard from "./Chalkboard";
import DropZone from "./DropZone";
import { FolderIcon, RefreshIcon, SoundOffIcon, SoundOnIcon } from "./Icons";
import { type Photo, addPhotos, clearPhotos, loadPhotos, removePhoto } from "@/lib/camera";
import { FONTS, type FontId, fontFamilyOf, isFontId } from "@/lib/fonts";
import { plainText, withReadings } from "@/lib/readAloud";
import { playCamera } from "@/lib/sounds";

const STORAGE_KEY = "instant-camera";
const MUTE_KEY = "instant-camera-muted";
// From the shutter until the photo is all the way out of the slot; matches .instant-eject in globals.css.
const EJECT_MS = 1400;
const ZOOM_MS = 600;
const LAND_MS = 500;
const SIZES = [24, 32, 40, 48, 56, 64, 80, 96];
const DEFAULT_SIZE = 40;

type Order = "sequence" | "random";
// eject: coming out of the camera; big: filling the screen; land: on its way to the board.
type Phase = "idle" | "eject" | "big" | "land";

// Where a photo is on screen: its center, its width before any tilt, and its tilt.
type Spot = { x: number; y: number; width: number; angle: number };

const spotOf = (el: HTMLElement, angle = 0): Spot => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: el.offsetWidth, angle };
};

// The big photo's place in the full-screen overlay (which starts at the window's top left), ignoring any animation.
const restingSpot = (el: HTMLElement): Spot => ({
  x: el.offsetLeft + el.offsetWidth / 2,
  y: el.offsetTop + el.offsetHeight / 2,
  width: el.offsetWidth,
  angle: 0,
});

// The transform that moves a photo resting at `at` onto `spot`.
const onto = (spot: Spot, at: Spot) =>
  `translate(${spot.x - at.x}px, ${spot.y - at.y}px) scale(${spot.width / at.width}) rotate(${spot.angle}deg)`;

// Each photo on the board leans a little, always the same way.
const tiltOf = (i: number) => ((i * 37) % 7) - 3;

const filesIn = (files: FileList | null | undefined) => [...(files ?? [])];

// The photo's shape (and so its size) comes from --ar; see .instant-photo.
const shapeOf = (photo: Photo) => ({ "--ar": photo.width / photo.height }) as React.CSSProperties;

// The picture inside the white frame, with the dark film over it that fades as the photo develops.
function Picture({ photo }: { photo: Photo }) {
  return (
    <span className="instant-photo-picture">
      <img src={photo.url} alt="" draggable={false} />
      <span className="instant-photo-film" aria-hidden="true" />
    </span>
  );
}

// Rainbow stripes across the front of the camera.
const STRIPES = ["var(--pin-red)", "var(--chalk-orange)", "var(--chalk-yellow)", "var(--pin-teal)", "var(--pin-blue)"];

function Camera({
  shooting,
  canShoot,
  onShoot,
  ejecting,
  ejectRef,
}: {
  shooting: boolean;
  canShoot: boolean;
  onShoot: () => void;
  ejecting: Photo | null;
  ejectRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className={`instant-camera ${shooting ? "is-shooting" : ""}`}>
      <svg className="instant-camera-svg" viewBox="0 0 260 230" aria-hidden="true">
        <defs>
          <radialGradient id="instant-glass" cx="38%" cy="34%" r="70%">
            <stop offset="0" className="instant-glass-light" />
            <stop offset="1" className="instant-glass-dark" />
          </radialGradient>
        </defs>
        {/* Viewfinder housing on top. */}
        <rect className="instant-body" x="160" y="8" width="72" height="34" rx="8" />
        {/* The body is dark all round, with the cream top over it; the slot is in the dark bottom. */}
        <rect className="instant-dark" x="8" y="28" width="244" height="182" rx="24" />
        <path className="instant-body" d="M8 52a24 24 0 0 1 24-24h196a24 24 0 0 1 24 24v126H8z" />
        {STRIPES.map((color, i) => (
          <rect key={color} x="8" y={146 + i * 4.4} width="244" height="4.4" style={{ fill: color }} />
        ))}
        {/* Flash and viewfinder. */}
        <rect className="instant-flash-window" x="24" y="44" width="62" height="32" rx="6" />
        <path className="instant-flash-lines" d="M33 52h44M33 60h44M33 68h44" />
        <rect className="instant-dark" x="180" y="46" width="48" height="30" rx="7" />
        <rect className="instant-shine" x="186" y="51" width="14" height="6" rx="3" />
        {/* Lens. */}
        <circle className="instant-dark" cx="130" cy="110" r="56" />
        <circle className="instant-lens-ring" cx="130" cy="110" r="44" />
        <circle cx="130" cy="110" r="32" fill="url(#instant-glass)" />
        <circle className="instant-dark" cx="130" cy="110" r="12" />
        <circle className="instant-shine" cx="116" cy="96" r="7" />
        <rect className="instant-slot" x="45" y="190" width="170" height="7" rx="3.5" />
      </svg>
      {/* The red shutter button on the front of the camera. */}
      <button className="instant-shutter" onClick={onShoot} disabled={!canShoot} aria-label="按快門，拍一張" title="拍一張" />
      {/* The photo slides down out of the slot; the window hides whatever is still inside the camera. */}
      {ejecting && (
        <div className="instant-eject-window" aria-hidden="true">
          <div ref={ejectRef} className="instant-photo instant-eject" style={shapeOf(ejecting)}>
            <Picture photo={ejecting} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function InstantCamera() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  // false when this browser can't store files (e.g. some private windows); photos then last until reload.
  const [persistent, setPersistent] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [order, setOrder] = useState<Order>("sequence");
  // The photos already taken, in order; they're on the board beside the camera.
  const [taken, setTaken] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [font, setFont] = useState<FontId>("plain");
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [muted, setMuted] = useState(false);
  const [managing, setManaging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<{ lines: string[]; warnings: string[] } | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [textNotice, setTextNotice] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  // The photo coming out of the camera, shown big, or on its way to the board.
  const [shownId, setShownId] = useState<string | null>(null);
  // Just taken: it comes out dark and develops while it's shown big.
  const [fresh, setFresh] = useState(false);
  // Bumped on every shot so the flash replays.
  const [shots, setShots] = useState(0);

  const ejectRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const onBoardRefs = useRef(new Map<string, HTMLElement>());
  // Where the photo was when it started growing to full screen.
  const zoomFrom = useRef<Spot | null>(null);
  const ejectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.order === "sequence" || saved?.order === "random") setOrder(saved.order);
      if (Array.isArray(saved?.taken)) setTaken(saved.taken);
      if (typeof saved?.text === "string") setText(saved.text);
      if (isFontId(saved?.font ?? null)) setFont(saved.font);
      if (SIZES.includes(saved?.size)) setSize(saved.size);
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {}
    loadPhotos()
      .then(setPhotos)
      .catch(() => setPersistent(false))
      .finally(() => setLoaded(true));
    return () => clearTimeout(ejectTimer.current);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, taken, text, font, size }));
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }, [order, taken, text, font, size, muted, loaded]);

  const byId = new Map(photos.map((p) => [p.id, p]));
  const onBoard = taken.flatMap((id) => byId.get(id) ?? []);
  const left = photos.filter((p) => !taken.includes(p.id));
  const shown = shownId ? (byId.get(shownId) ?? null) : null;
  const busy = phase !== "idle";

  // Grow the photo from where it was (the slot, or its place on the board) to full screen.
  useLayoutEffect(() => {
    const el = bigRef.current;
    const from = zoomFrom.current;
    if (phase !== "big" || !el || !from) return;
    zoomFrom.current = null;
    overlayRef.current?.focus();
    // The teacher switched to another page while the photo was coming out: nothing to grow from.
    if (from.width === 0 || el.offsetWidth === 0) return;
    el.animate([{ transform: onto(from, restingSpot(el)) }, { transform: "none" }], {
      duration: ZOOM_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }, [phase]);

  const take = () => {
    if (busy || left.length === 0) return;
    const pick = order === "random" ? left[Math.floor(Math.random() * left.length)] : left[0];
    setTaken((prev) => [...prev, pick.id]);
    setShownId(pick.id);
    setFresh(true);
    setPhase("eject");
    setShots((n) => n + 1);
    if (!muted) playCamera(EJECT_MS / 1000);
    ejectTimer.current = setTimeout(() => {
      if (ejectRef.current) zoomFrom.current = spotOf(ejectRef.current);
      setPhase("big");
    }, EJECT_MS);
  };

  // A photo on the board, shown big again.
  const view = (photo: Photo, el: HTMLElement, angle: number) => {
    if (busy) return;
    zoomFrom.current = spotOf(el, angle);
    setShownId(photo.id);
    setFresh(false);
    setPhase("big");
  };

  // The big photo shrinks back onto its place on the board.
  const putDown = () => {
    const el = bigRef.current;
    if (phase !== "big" || !el || !shownId) return;
    const index = onBoard.findIndex((p) => p.id === shownId);
    const target = onBoardRefs.current.get(shownId);
    const done = () => {
      setPhase("idle");
      setShownId(null);
    };
    if (!target || index === -1) return done();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Clicked while still growing: carry on from where it is now.
    const now = getComputedStyle(el).transform;
    el.getAnimations().forEach((a) => a.cancel());
    setPhase("land");
    el.animate([{ transform: now }, { transform: onto(spotOf(target, tiltOf(index)), restingSpot(el)) }], {
      duration: LAND_MS,
      easing: "cubic-bezier(0.4, 0, 0.6, 1)",
      fill: "forwards",
    }).onfinish = done;
  };

  const putBack = () => {
    if (!confirm("把照片都收回立可拍，重新開始？")) return;
    setTaken([]);
  };

  const importPhotos = async (files: File[]) => {
    if (files.length === 0 || importing) return;
    setImporting(true);
    setNotice(null);
    try {
      const { added, skipped } = await addPhotos(files, persistent);
      setPhotos((prev) => [...prev, ...added]);
      setNotice({
        lines: added.length > 0 ? [`已加入 ${added.length} 張照片。`] : [],
        warnings: skipped.length > 0 ? [`這些檔案讀不出來，沒有加入：${skipped.join("、")}`] : [],
      });
    } catch (e) {
      setNotice({ lines: [], warnings: [(e as Error).message] });
    } finally {
      setImporting(false);
    }
  };

  const deletePhoto = async (photo: Photo) => {
    try {
      if (persistent) await removePhoto(photo.id);
    } catch {
      return setNotice({ lines: [], warnings: ["照片刪除失敗，請再試一次。"] });
    }
    URL.revokeObjectURL(photo.url);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    setTaken((prev) => prev.filter((id) => id !== photo.id));
  };

  const deleteAll = async () => {
    if (!confirm(`確定要刪除全部 ${photos.length} 張照片嗎？`)) return;
    try {
      if (persistent) await clearPhotos();
    } catch {
      return setNotice({ lines: [], warnings: ["照片刪除失敗，請再試一次。"] });
    }
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setTaken([]);
    setManaging(false);
  };

  // 長[ㄓㄤˇ] becomes 長 with its reading picked, once the teacher is done typing.
  const finishText = async () => {
    setEditingText(false);
    setTextNotice(null);
    if (!/[[(（【]/.test(text)) return;
    const done = await withReadings([{ text, font }]);
    setText(plainText(done.runs));
    if (done.notice) setTextNotice(done.notice);
  };

  const hanzi = useHanzi(font);
  const family = fontFamilyOf(font);
  const textStyle = { fontSize: `${size}px`, fontFamily: family ? `${family}, var(--font-board-text)` : undefined };
  const sizeIndex = SIZES.indexOf(size);

  const photoPicker = (label: React.ReactNode, className: string) => (
    <label className={`${className} ${importing ? "is-busy" : ""}`}>
      {label}
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        disabled={importing}
        onChange={(e) => {
          void importPhotos(filesIn(e.target.files));
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div
      className={`game instant ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        void importPhotos(filesIn(e.dataTransfer.files));
      }}
    >
      <header className="page-header">
        <h1 className="page-title">Instant Camera 立可拍</h1>
        {photos.length > 0 && (
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
            {photoPicker(
              <>
                <FolderIcon />
                {importing ? "讀取中…" : "加入照片"}
              </>,
              "btn-tag",
            )}
            <button
              className={`btn-tag ${managing ? "is-on" : ""}`}
              onClick={() => setManaging((m) => !m)}
              aria-pressed={managing}
            >
              ⚙️ 照片（{photos.length}）
            </button>
          </div>
        )}
      </header>

      {!persistent && (
        <div className="ttt-notice is-warn">
          <p>⚠️ 這個瀏覽器不能儲存照片（可能是無痕視窗），重新整理頁面後要再加入一次。</p>
        </div>
      )}

      {notice && (
        <div className={`ttt-notice ${notice.warnings.length > 0 ? "is-warn" : ""}`}>
          <button className="ttt-notice-close" onClick={() => setNotice(null)} aria-label="關閉">
            ×
          </button>
          {notice.lines.map((line) => (
            <p key={line}>✅ {line}</p>
          ))}
          {notice.warnings.map((warning) => (
            <p key={warning}>⚠️ {warning}</p>
          ))}
        </div>
      )}

      {!loaded ? null : photos.length === 0 ? (
        <DropZone icon="📷" busy={importing}>
          <strong>{importing ? "照片讀取中…" : "點這裡選擇照片，或把照片拖進來"}</strong>
          <span className="materials-drop-hint">可以一次選很多張，也可以一張一張加。照順序拍的時候，同一次選的照片依檔名排列。</span>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={importing}
            onChange={(e) => {
              void importPhotos(filesIn(e.target.files));
              e.target.value = "";
            }}
          />
        </DropZone>
      ) : (
        <div className={`instant-layout ${managing ? "is-managing" : ""}`}>
          <Chalkboard className="instant-board">
            <div className="board-toolbar">
              <div className="chalk-segment" role="group" aria-label="出照片的順序">
                <button aria-pressed={order === "sequence"} onClick={() => setOrder("sequence")}>
                  照順序
                </button>
                <button aria-pressed={order === "random"} onClick={() => setOrder("random")}>
                  隨機
                </button>
              </div>
              <button className="btn-chalk-ghost" onClick={putBack} disabled={busy || taken.length === 0}>
                <RefreshIcon />
                收回照片
              </button>
            </div>

            <div className="instant-scene">
              <div className="instant-side">
                <Camera
                  shooting={phase === "eject"}
                  canShoot={!busy && left.length > 0}
                  onShoot={take}
                  ejecting={phase === "eject" ? shown : null}
                  ejectRef={ejectRef}
                />
                {left.length > 0 ? (
                  <button className="btn-chalk instant-take" onClick={take} disabled={busy}>
                    📸 拍一張
                  </button>
                ) : (
                  <p className="instant-done">🎉 照片都拍完了！</p>
                )}
                <p className="instant-left">
                  還有 <strong>{left.length}</strong> 張
                </p>
              </div>

              <ul className="instant-pile" aria-label="拍好的照片">
                {onBoard.map((photo, i) => (
                  <li key={photo.id}>
                    <button
                      ref={(el) => {
                        if (el) onBoardRefs.current.set(photo.id, el);
                        else onBoardRefs.current.delete(photo.id);
                      }}
                      className={`instant-photo instant-pile-photo ${photo.id === shownId ? "is-away" : ""}`}
                      style={{ ...shapeOf(photo), rotate: `${tiltOf(i)}deg` }}
                      onClick={(e) => view(photo, e.currentTarget, tiltOf(i))}
                      aria-label={`第 ${i + 1} 張照片，點一下放大`}
                    >
                      <Picture photo={photo} />
                    </button>
                  </li>
                ))}
                {onBoard.length === 0 && <li className="instant-pile-empty">拍好的照片會放在這裡</li>}
              </ul>
            </div>
          </Chalkboard>

          {managing && (
            <section className="paper instant-manage" aria-label="照片">
              <h2 className="instant-manage-heading">照片</h2>
              <p className="instant-manage-hint">照順序拍的時候依這裡的順序；同一次選的照片依檔名排列（1、2、3…）。</p>
              <ol className="instant-manage-list">
                {photos.map((photo, i) => (
                  <li key={photo.id} title={photo.name}>
                    <img src={photo.url} alt="" />
                    <span className="instant-manage-number">{i + 1}</span>
                    {taken.includes(photo.id) && <span className="stamp instant-manage-stamp">已拍</span>}
                    <button
                      className="quick-icon-btn instant-manage-remove"
                      onClick={() => void deletePhoto(photo)}
                      disabled={busy}
                      aria-label={`刪除 ${photo.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
              <div className="instant-manage-actions">
                {photoPicker("＋ 加入照片", "btn-tag btn-tag--sm")}
                <button className="btn-tag btn-tag--sm" onClick={() => void deleteAll()} disabled={busy}>
                  全部刪除
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {loaded && (
        <section className="paper instant-text" aria-label="文字">
          <span className="tape" aria-hidden="true" />
          <div className="instant-text-head">
            <h2>文字</h2>
            <label className="tag-field">
              字型
              <select className="select-tag" value={font} onChange={(e) => isFontId(e.target.value) && setFont(e.target.value)}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="read-size" role="group" aria-label="字的大小">
              <button className="btn-tag" onClick={() => setSize(SIZES[sizeIndex - 1])} disabled={sizeIndex <= 0} aria-label="字變小">
                A−
              </button>
              <button
                className="btn-tag"
                onClick={() => setSize(SIZES[sizeIndex + 1])}
                disabled={sizeIndex >= SIZES.length - 1}
                aria-label="字變大"
              >
                A＋
              </button>
            </div>
            <button
              className="btn-tag btn-tag--sm"
              onClick={() => {
                setText("");
                setTextNotice(null);
              }}
              disabled={!text}
            >
              清空
            </button>
          </div>
          {editingText ? (
            <textarea
              className="instant-text-body instant-text-input"
              data-font={font}
              style={textStyle}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => void finishText()}
              // Opened by a click on the text: carry on typing at the end.
              onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
              placeholder="在這裡輸入文字"
              aria-label="文字"
              spellCheck={false}
              autoFocus
            />
          ) : (
            <div
              className="instant-text-body instant-text-show"
              data-font={font}
              style={textStyle}
              role="button"
              tabIndex={0}
              aria-label="文字，點一下編輯"
              onClick={() => setEditingText(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditingText(true);
                }
              }}
            >
              {text ? <BoardText text={text} font={font} hanzi={hanzi} /> : <span className="instant-text-placeholder">點這裡輸入文字</span>}
            </div>
          )}
          {textNotice && <p className="read-notice">⚠️ {textNotice}</p>}
          <p className="read-hint">破音字可以寫成 長[ㄓㄤˇ] 指定讀音。選簡體或拼音時，打完字點旁邊就會轉換。</p>
        </section>
      )}

      {shots > 0 && <div key={shots} className="instant-flash" aria-hidden="true" />}

      {shown && (phase === "big" || phase === "land") && (
        <div
          ref={overlayRef}
          className={`instant-overlay ${phase === "land" ? "is-landing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="放大的照片，點一下放到旁邊"
          tabIndex={-1}
          onClick={putDown}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              putDown();
            }
          }}
        >
          <div ref={bigRef} className={`instant-photo instant-big ${fresh ? "is-developing" : ""}`} style={shapeOf(shown)}>
            <Picture photo={shown} />
          </div>
          <p className="instant-overlay-hint">點一下放到旁邊</p>
        </div>
      )}
    </div>
  );
}
