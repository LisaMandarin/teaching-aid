"use client";

import { useState } from "react";
import { addMaterials, kindOf, removeMaterial, useMaterials } from "@/lib/materials";

export default function Materials() {
  const { items, selectedId, loaded, persistent } = useMaterials();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      className={`materials ${dragging ? "is-dragging" : ""}`}
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
          <div className="materials-toolbar">
            <h1 className="materials-title" title={selected.name}>
              {selected.name}
            </h1>
            <button className="btn" onClick={() => void remove()}>
              🗑️ 刪除
            </button>
          </div>
          <div className="materials-viewer">
            {selected.kind === "pdf" ? (
              <iframe key={selected.id} className="materials-pdf" src={selected.url} title={selected.name} />
            ) : (
              <img className="materials-image" src={selected.url} alt={selected.name} />
            )}
          </div>
        </>
      ) : (
        <label className={`materials-drop ${busy ? "is-busy" : ""}`}>
          <span className="materials-drop-icon">📂</span>
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
        </label>
      )}
    </div>
  );
}
