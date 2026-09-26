// Builds lib/polyphones.json from ButTaiwan/bpmfvs's poyin_db.txt (教育部《國語一字多音審訂表》).
// Each character maps to its readings in font order: the first is the default (no selector),
// the n-th (0-based) is selected with variation selector U+E01E0 + n.
// Run: node scripts/build-polyphones.mjs
import { writeFileSync } from "node:fs";

const SOURCE = "https://raw.githubusercontent.com/ButTaiwan/bpmfvs/master/ime/poyin_db.txt";

const text = await (await fetch(SOURCE)).text();
const readings = {};
for (const line of text.split("\n")) {
  // e.g. "[長] ㄓㄤˇ\t首*/生*/..." (one entry in the source uses "}" instead of "]")
  const m = line.match(/^\[(.)[\]}]\s+(\S+)/u);
  if (!m) continue;
  (readings[m[1]] ??= []).push(m[2]);
}

const out = Object.fromEntries(Object.entries(readings).map(([c, r]) => [c, r.join(" ")]));
writeFileSync(new URL("../lib/polyphones.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`${Object.keys(out).length} characters`);
