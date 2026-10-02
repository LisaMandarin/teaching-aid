// 立可拍's photos. They're shown full screen, so they're kept larger than the other games' images,
// and live in IndexedDB (like the materials) instead of localStorage.
// The teacher imports the image files themselves: there's no list of records to fill in, so no Excel template.

import { objectStore } from "./idb";
import { shrinkImage } from "./images";

export type Photo = { id: string; name: string; url: string; width: number; height: number };

type PhotoRecord = { id: string; name: string; blob: Blob; width: number; height: number; addedAt: number };

// Sharp on a classroom screen, small enough that a whole lesson's photos fit in the browser.
const MAX_SIDE = 1600;
const TARGET_BYTES = 400 * 1024;

const run = objectStore("teaching-aid-camera", "photos");

const toPhoto = (r: PhotoRecord): Photo => ({
  id: r.id,
  name: r.name,
  url: URL.createObjectURL(r.blob),
  width: r.width,
  height: r.height,
});

// In the order they were imported. Throws when this browser can't store files (e.g. some private windows).
export async function loadPhotos(): Promise<Photo[]> {
  const records = await run<PhotoRecord[]>("readonly", (s) => s.getAll());
  return records.sort((a, b) => a.addedAt - b.addedAt).map(toPhoto);
}

// Photos picked together are ordered by file name (1.jpg, 2.jpg, … 10.jpg), so 照順序 follows the names.
// Files that aren't images the browser can show are skipped and listed in `skipped`.
export async function addPhotos(files: File[], persistent: boolean): Promise<{ added: Photo[]; skipped: string[] }> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant", { numeric: true }));
  const records: PhotoRecord[] = [];
  const skipped: string[] = [];
  for (const file of sorted) {
    if (!file.type.startsWith("image/")) {
      skipped.push(file.name);
      continue;
    }
    try {
      const shrunk = await shrinkImage(file, MAX_SIDE, TARGET_BYTES);
      records.push({
        // Not crypto.randomUUID(): it's missing on plain-http LAN addresses, which classrooms often use.
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        blob: shrunk.blob,
        width: shrunk.width,
        height: shrunk.height,
        addedAt: Date.now() + records.length,
      });
    } catch {
      skipped.push(file.name);
    }
  }

  if (persistent && records.length > 0) {
    try {
      await run("readwrite", (s) => {
        let req!: IDBRequest;
        for (const r of records) req = s.put(r);
        return req;
      });
    } catch (e) {
      throw new Error(
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "瀏覽器儲存空間不足，請先刪除一些照片或教材。"
          : "照片儲存失敗，請再試一次。",
      );
    }
  }
  return { added: records.map(toPhoto), skipped };
}

export async function removePhoto(id: string) {
  await run("readwrite", (s) => s.delete(id));
}

export async function clearPhotos() {
  await run("readwrite", (s) => s.clear());
}
