"use client";

import { zipSync, type Zippable } from "fflate";
import { useEffect, useState } from "react";
import DropZone from "./DropZone";
import { canShrink, shrinkImage, type Shrunk } from "@/lib/images";

// A game board cell is at most ~180px wide; 600px stays sharp on projectors and Retina screens.
const MAX_SIDE = 600;
const TARGET_BYTES = 200 * 1024;

type Picked = { file: File; path: string };

type Item = Picked & {
  id: number;
  status: "working" | "done" | "error";
  result?: Shrunk;
};

let nextId = 0;

const isImage = (f: File) => f.type.startsWith("image/");
const output = (item: Item) => item.result?.blob ?? item.file;

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Picked files keep their folder path (from the folder picker) so the zip mirrors the folder.
const fromInput = (files: FileList | null): Picked[] =>
  [...(files ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));

// Dropped folders arrive as entries; walk them to collect the files inside.
async function fromDrop(dt: DataTransfer): Promise<Picked[]> {
  // Entries must be taken synchronously, before the drop event ends.
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry()).filter((e) => e !== null);
  const out: Picked[] = [];
  const walk = async (entry: FileSystemEntry, dir: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: dir + file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns a directory's contents in batches until it returns an empty one.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, `${dir}${entry.name}/`);
      }
    }
  };
  for (const entry of entries) await walk(entry, "");
  return out;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Thumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return <span className="resizer-thumb">{url && <img src={url} alt="" />}</span>;
}

function Result({ item }: { item: Item }) {
  const { file, status, result } = item;
  if (status === "working") return <span className="resizer-note">處理中…</span>;
  if (status === "error" || !result) {
    return <span className="resizer-note is-warn">⚠️ 瀏覽器讀不到這張圖片，保留原檔</span>;
  }
  if (!result.changed) {
    return (
      <span className="resizer-note">
        {formatSize(file.size)}・{canShrink(file.type) ? "本來就夠小，保留原檔" : "這種格式無法縮小，保留原檔"}
      </span>
    );
  }
  return (
    <span className="resizer-note">
      {formatSize(file.size)} → <strong>{formatSize(result.blob.size)}</strong>
      <span className="resizer-dims">
        {result.originalWidth}×{result.originalHeight} → {result.width}×{result.height}
      </span>
      {result.blob.size > TARGET_BYTES && <span className="is-warn">⚠️ 還是超過 200 KB</span>}
    </span>
  );
}

export default function ImageResizer() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);

  const update = (id: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const add = async (picked: Picked[]) => {
    const images = picked.filter((p) => isImage(p.file));
    setSkipped(picked.filter((p) => !isImage(p.file) && !p.file.name.startsWith(".")).map((p) => p.path));
    if (images.length === 0) return;
    const added = images.map((p) => ({ ...p, id: nextId++, status: "working" as const }));
    // Adding a file with the same path again replaces the earlier one.
    const paths = new Set(added.map((it) => it.path));
    setItems((list) => [...list.filter((it) => !paths.has(it.path)), ...added]);
    // One at a time, so a folder of large photos doesn't use up the browser's memory.
    for (const it of added) {
      try {
        update(it.id, { status: "done", result: await shrinkImage(it.file, MAX_SIDE, TARGET_BYTES) });
      } catch {
        update(it.id, { status: "error" });
      }
    }
  };

  const save = async () => {
    if (items.length === 1) return download(output(items[0]), items[0].file.name);
    const files: Zippable = {};
    for (const it of items) {
      // Images are already compressed; storing them as-is keeps zipping fast.
      files[it.path] = [new Uint8Array(await output(it).arrayBuffer()), { level: 0 }];
    }
    download(new Blob([zipSync(files)], { type: "application/zip" }), "圖片瘦身.zip");
  };

  const working = items.some((it) => it.status === "working");
  const before = items.reduce((sum, it) => sum + it.file.size, 0);
  const after = items.reduce((sum, it) => sum + output(it).size, 0);

  return (
    <div
      className={`game resizer ${dragging ? "is-dragging" : ""}`}
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
        void fromDrop(e.dataTransfer).then(add);
      }}
    >
      <header className="page-header">
        <h1 className="page-title">圖片瘦身</h1>
        <div className="page-tools">
          <label className="btn-tag">
            🖼️ 選擇圖片
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void add(fromInput(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
          <label className="btn-tag">
            📁 選擇資料夾
            <input
              type="file"
              hidden
              {...{ webkitdirectory: "" }}
              onChange={(e) => {
                void add(fromInput(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </header>

      <ul className="resizer-intro">
        <li>
          <strong>尺寸與大小</strong>：最長邊縮至 {MAX_SIDE} 像素，單張檔案儘量低於 200 KB（適合放進遊戲）。
        </li>
        <li>
          <strong>格式與命名</strong>：檔名及格式保持不變。
        </li>
        <li>
          <strong>使用方式</strong>：下載後可直接放回 Dropbox 資料夾。
        </li>
        <li>
          <strong>隱私安全</strong>：圖片僅在本機電腦處理，絕不外傳。
        </li>
      </ul>

      {skipped.length > 0 && (
        <div className="ttt-notice is-warn">
          <button className="ttt-notice-close" onClick={() => setSkipped([])} aria-label="關閉">
            ×
          </button>
          <p>⚠️ 不是圖片，已略過：</p>
          <p className="ttt-notice-files">{skipped.join("、")}</p>
        </div>
      )}

      {items.length === 0 ? (
        <DropZone icon="🪶">
          <strong>點這裡選擇圖片，或把圖片、資料夾拖進來</strong>
          <span className="materials-drop-hint">可以一次選很多張</span>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void add(fromInput(e.target.files));
              e.target.value = "";
            }}
          />
        </DropZone>
      ) : (
        <>
          <ul className="resizer-list paper">
            {items.map((it) => (
              <li key={it.id} className="resizer-row">
                <Thumb blob={output(it)} />
                <span className="resizer-name" title={it.path}>
                  {it.path}
                </span>
                <Result item={it} />
              </li>
            ))}
          </ul>
          <div className="resizer-footer">
            <span className="resizer-total">
              共 {items.length} 張：{formatSize(before)} → <strong>{formatSize(after)}</strong>
            </span>
            <button className="btn" onClick={() => setItems([])} disabled={working}>
              清除
            </button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={working}>
              {working ? "處理中…" : items.length === 1 ? "⬇️ 下載圖片" : "⬇️ 下載 zip"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
