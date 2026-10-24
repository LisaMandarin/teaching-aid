// A game's state kept in this browser's localStorage, so a reload in the middle of class doesn't lose it.

// The saved value, or null when there's none (or the browser won't let us read it).
// Unreadable JSON counts as broken: it's kept aside first, since the game's next save overwrites it.
export function readSaved(key: string): { value: unknown; broken: boolean } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { value: null, broken: false };
  }
  if (raw === null) return { value: null, broken: false };
  try {
    return { value: JSON.parse(raw), broken: false };
  } catch {
    keepBroken(key);
    return { value: null, broken: true };
  }
}

// Keys whose unusable value couldn't be copied aside (the browser is full). Overwriting them would lose the
// only copy, so they aren't saved again during this visit: saving reports failure, which shows 儲存空間不夠.
const held = new Set<string>();

// Copies what's saved under `key` to `<key>:broken`, for a saved value the game couldn't use.
export function keepBroken(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) localStorage.setItem(`${key}:broken`, raw);
  } catch {
    held.add(key);
  }
}

// Saves `value` (null removes it). False when the browser refused, usually because it's full.
export function writeSaved(key: string, value: unknown): boolean {
  if (held.has(key)) return false;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

// The indexes in `v` that point into a list of `length`, in order; anything else is dropped.
// `unique` drops repeats too (a set, like who's absent); a history keeps them.
export function validIndexes(v: unknown, length: number, unique: boolean): number[] {
  const valid = Array.isArray(v) ? v.filter((i) => Number.isInteger(i) && i >= 0 && i < length) : [];
  return unique ? [...new Set(valid)] : valid;
}
