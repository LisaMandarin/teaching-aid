// Teaching materials (PDFs and images) uploaded by the teacher.
// Files can be several MB, so they live in IndexedDB instead of localStorage.

import { useEffect, useSyncExternalStore } from "react";
import { objectStore } from "./idb";

export type MaterialKind = "pdf" | "image";

type MaterialRecord = { id: string; name: string; kind: MaterialKind; blob: Blob; addedAt: number };

export type Material = { id: string; name: string; kind: MaterialKind; url: string };

type State = {
  items: Material[];
  // null shows the upload screen.
  selectedId: string | null;
  loaded: boolean;
  // false when this browser can't store files (e.g. some private windows); uploads then last until reload.
  persistent: boolean;
};

const DB_NAME = "teaching-aid";
const STORE = "materials";

const INITIAL: State = { items: [], selectedId: null, loaded: false, persistent: true };

let state = INITIAL;
const listeners = new Set<() => void>();

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const run = objectStore(DB_NAME, STORE);

const toMaterial = (r: MaterialRecord): Material => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  url: URL.createObjectURL(r.blob),
});

let initStarted = false;

async function init() {
  if (initStarted) return;
  initStarted = true;
  try {
    const records = await run<MaterialRecord[]>("readonly", (s) => s.getAll());
    records.sort((a, b) => a.addedAt - b.addedAt);
    setState({ items: records.map(toMaterial) });
  } catch {
    setState({ persistent: false });
  } finally {
    setState({ loaded: true });
  }
}

// ---------- Public API ----------

export function useMaterials(): State {
  useEffect(() => {
    void init();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

export function kindOf(file: File): MaterialKind | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export function selectMaterial(id: string | null) {
  setState({ selectedId: id });
}

// Adds the files and shows the first one. Unsupported files are skipped.
export async function addMaterials(files: File[]) {
  const records: MaterialRecord[] = [];
  for (const file of files) {
    const kind = kindOf(file);
    if (!kind) continue;
    records.push({
      // Not crypto.randomUUID(): it's missing on plain-http LAN addresses, which classrooms often use.
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      kind,
      // A PDF with a missing MIME type would download instead of display.
      blob: kind === "pdf" ? new Blob([file], { type: "application/pdf" }) : file,
      addedAt: Date.now() + records.length,
    });
  }
  if (records.length === 0) return;

  if (state.persistent) {
    try {
      await run("readwrite", (s) => {
        let req!: IDBRequest;
        for (const r of records) req = s.put(r);
        return req;
      });
    } catch (e) {
      throw new Error(
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "瀏覽器儲存空間不足，請先刪除一些教材。"
          : "教材儲存失敗，請再試一次。",
      );
    }
  }

  const added = records.map(toMaterial);
  setState({ items: [...state.items, ...added], selectedId: added[0].id });
}

export async function removeMaterial(id: string) {
  const index = state.items.findIndex((m) => m.id === id);
  if (index < 0) return;
  if (state.persistent) await run("readwrite", (s) => s.delete(id));

  URL.revokeObjectURL(state.items[index].url);
  const items = state.items.filter((m) => m.id !== id);
  // Show the neighbour so the teacher can keep going without reaching for the sidebar.
  const selectedId =
    state.selectedId === id ? (items[Math.min(index, items.length - 1)]?.id ?? null) : state.selectedId;
  setState({ items, selectedId });
}
