"use client";

import { useState } from "react";
import DropZone from "./DropZone";
import { addMaterials, kindOf, removeMaterial, useMaterials } from "@/lib/materials";

export default function Materials() {
  const { items, selectedId, loaded, persistent } = useMaterials();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The file name and 刪除 are rarely needed, so they stay tucked away to leave room for the material.
  const [infoOpen, setInfoOpen] = useState(false);

  const selected = items.find((m) => m.id === selectedId) ?? null;

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    const skipped = files.filter((f) => !kindOf(f)).map((f) => f.name);
    setError(skipped.length > 0 ? `只能上傳 PDF 或圖片，已略過：${skipped.join("、")}` : null);
    setBusy(true);
    try {
      await addMaterials(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || !confirm(`確定要刪除「${selected.name}」嗎？`)) return;
    try {
      await removeMaterial(selected.id);
    } catch {
      setError("刪除失敗，請再試一次。");
    }
  };

  return (
    <div
      className={`game materials ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      {error && (
        <div className="ttt-notice is-warn">
          <button className="ttt-notice-close" onClick={() => setError(null)} aria-label="關閉">
            ×
          </button>
          <p>{error}</p>
        </div>
      )}

      {selected ? (
        <>
          <header className={`page-header materials-header ${infoOpen ? "" : "is-collapsed"}`}>
            <button
              type="button"
              className="materials-info-toggle"
              onClick={() => setInfoOpen((o) => !o)}
              aria-expanded={infoOpen}
              aria-label={infoOpen ? "收起檔案資訊" : "展開檔案資訊"}
              title={infoOpen ? "收起檔案資訊" : "展開檔案資訊"}
            >
              <span className={`sidebar-title-arrow ${infoOpen ? "is-open" : ""}`} aria-hidden="true">
                ▾
              </span>
              {!infoOpen && <span className="materials-info-label">檔案資訊</span>}
            </button>
            {infoOpen && (
              <>
                <h1 className="page-title materials-title" title={selected.name}>
                  {selected.name}
                </h1>
                <div className="page-tools">
                  <button className="btn-tag" onClick={() => void remove()}>
                    🗑️ 刪除
                  </button>
                </div>
              </>
            )}
          </header>
          <div className="materials-viewer">
            {selected.kind === "pdf" ? (
              <iframe key={selected.id} className="materials-pdf" src={selected.url} title={selected.name} />
            ) : (
              <img className="materials-image" src={selected.url} alt={selected.name} />
            )}
          </div>
        </>
      ) : (
        <>
          <header className="page-header">
            <h1 className="page-title">上傳教材</h1>
          </header>
          <DropZone icon="📂" busy={busy}>
            <strong>{busy ? "上傳中…" : "點這裡選擇檔案，或把檔案拖進來"}</strong>
            <span className="materials-drop-hint">支援 PDF 與圖片，可以一次選多個</span>
            {loaded && !persistent && (
              <span className="materials-drop-warn">這個瀏覽器無法保存教材，重新整理後會消失。</span>
            )}
            <input
              type="file"
              accept="application/pdf,.pdf,image/*"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                void upload([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </DropZone>
        </>
      )}
    </div>
  );
}
