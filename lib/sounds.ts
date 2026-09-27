// Synthesized sound effects (Web Audio API) — no audio files needed.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

// Created lazily: browsers only allow audio after a user gesture.
function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Pencil scratch: band-passed noise with a jittery envelope, roughly as long as the draw animation.
export function playScratch() {
  const ac = audio();
  const t = ac.currentTime;
  const dur = 0.4;

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);

  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(2500, t);
  band.frequency.linearRampToValueAtTime(4000, t + dur);
  band.Q.value = 0.8;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t);
  // A few quick swells so it sounds like a stroke rubbing on paper, not a hiss.
  for (let i = 0; i < 6; i++) {
    const at = t + (i * dur) / 6;
    gain.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.15, at + 0.02);
    gain.gain.linearRampToValueAtTime(0.12, at + dur / 6);
  }
  gain.gain.linearRampToValueAtTime(0, t + dur);

  src.connect(band).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + dur);
}

// One voiced syllable: a sawtooth "vocal cord" shaped by two formant filters into a vowel.
function syllable(
  ac: AudioContext,
  start: number,
  dur: number,
  pitch: [number, number],
  formants: [number, number],
  volume: number,
  vibrato = 0,
) {
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(pitch[0], start);
  osc.frequency.exponentialRampToValueAtTime(pitch[1], start + dur);

  if (vibrato > 0) {
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 7;
    lfoGain.gain.value = vibrato;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + dur);
  }

  const out = ac.createGain();
  out.gain.setValueAtTime(0, start);
  out.gain.linearRampToValueAtTime(volume, start + 0.04);
  out.gain.setValueAtTime(volume, start + dur * 0.7);
  out.gain.linearRampToValueAtTime(0, start + dur);

  for (const f of formants) {
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 6;
    osc.connect(bp).connect(out);
  }
  out.connect(ac.destination);

  osc.start(start);
  osc.stop(start + dur);
}

// "Oh-oh": two falling "oh" syllables, the second one lower.
export function playUhOh() {
  const ac = audio();
  const t = ac.currentTime;
  const oh: [number, number] = [500, 850];
  syllable(ac, t, 0.22, [330, 300], oh, 0.9);
  syllable(ac, t + 0.3, 0.38, [260, 200], oh, 0.9);
}

// Scream: a high, wavering "aaah" that slides down, with breath noise on top.
export function playScream() {
  const ac = audio();
  const t = ac.currentTime;
  const dur = 1.4;
  syllable(ac, t, dur, [900, 250], [850, 1250], 1.0, 40);

  const breath = ac.createBufferSource();
  breath.buffer = noiseBuffer(ac, dur);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.08, t);
  g.gain.linearRampToValueAtTime(0, t + dur);
  breath.connect(hp).connect(g).connect(ac.destination);
  breath.start(t);
  breath.stop(t + dur);
}

// Sound for the n-th stroke (1-based): 1–4 scratch, 5 to max-1 "oh-oh", last one scream.
export function playStrokeSound(n: number, max: number) {
  if (muted) return;
  if (n >= max) playScream();
  else if (n >= 5) playUhOh();
  else playScratch();
}

// Recorded sound effects, served from public/sounds.
const files: Record<string, HTMLAudioElement> = {};

function fileAudio(path: string): HTMLAudioElement {
  files[path] ??= new Audio(path);
  return files[path];
}

function playFile(path: string) {
  if (muted) return;
  const a = fileAudio(path);
  a.currentTime = 0;
  a.play().catch(() => {});
}

const WRITING = "/sounds/writing.mp3";
const CHEER = "/sounds/cheer.m4a";

// Load the files ahead of time so they play right away on the first click.
export function preloadMarkSounds() {
  fileAudio(WRITING).load();
  fileAudio(CHEER).load();
}

// Pen writing an O or X on the board.
export const playWriting = () => playFile(WRITING);

// Crowd cheering on a win.
export const playCheer = () => playFile(CHEER);

const COIN = "/sounds/coin.mp3";

export const preloadCoinSound = () => fileAudio(COIN).load();

// Coin dropping into the chest. Ignores the games' mute switch; the rewards page has its own.
export function playCoin() {
  const a = fileAudio(COIN);
  a.currentTime = 0;
  a.play().catch(() => {});
}
