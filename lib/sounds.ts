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

// Sticks rattling in the 抽籤筒: a burst of short wooden clicks. Ignores the games' mute switch; the draw page has its own.
export function playRattle(seconds: number) {
  const ac = audio();
  const t = ac.currentTime;
  const click = noiseBuffer(ac, 0.03);
  for (let at = 0; at < seconds; at += 0.04 + Math.random() * 0.05) {
    const src = ac.createBufferSource();
    src.buffer = click;
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800 + Math.random() * 1400;
    band.Q.value = 4;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.5 + Math.random() * 0.4, t + at);
    gain.gain.exponentialRampToValueAtTime(0.001, t + at + 0.03);
    src.connect(band).connect(gain).connect(ac.destination);
    src.start(t + at);
  }
}

// A bright two-note chime when the name comes out.
export function playDing() {
  const ac = audio();
  const t = ac.currentTime;
  [988, 1319].forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ac.createGain();
    const at = t + i * 0.12;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.35, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.8);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + 0.8);
  });
}

// 立可拍: the shutter's click-clack, then the motor whirring the photo out until `seconds`.
// Ignores the games' mute switch; the camera page has its own.
export function playCamera(seconds: number) {
  const ac = audio();
  const t = ac.currentTime;
  const click = noiseBuffer(ac, 0.05);
  [3200, 2200].forEach((freq, i) => {
    const at = t + i * 0.07;
    const src = ac.createBufferSource();
    src.buffer = click;
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = freq;
    band.Q.value = 1.5;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.9, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    src.connect(band).connect(gain).connect(ac.destination);
    src.start(at);
  });

  // The motor: a muffled buzz that spins up, runs, and winds down as the photo comes out.
  const start = t + 0.2;
  const end = t + seconds;
  const motor = ac.createOscillator();
  motor.type = "sawtooth";
  motor.frequency.setValueAtTime(80, start);
  motor.frequency.linearRampToValueAtTime(120, start + 0.15);
  motor.frequency.setValueAtTime(120, end - 0.2);
  motor.frequency.linearRampToValueAtTime(70, end);
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 900;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.25, start + 0.08);
  gain.gain.setValueAtTime(0.25, end - 0.15);
  gain.gain.linearRampToValueAtTime(0, end);
  motor.connect(low).connect(gain).connect(ac.destination);
  motor.start(start);
  motor.stop(end);
}

// 拉霸機: the lever's ratchet, then the reels clicking past until `seconds`, slowing down at the end.
// Ignores the games' mute switch; the slot machine page has its own.
export function playSlotSpin(seconds: number) {
  const ac = audio();
  const t = ac.currentTime;
  const click = noiseBuffer(ac, 0.02);
  for (let at = 0.05, gap = 0.05; at < seconds; at += gap, gap = at > seconds - 0.8 ? gap * 1.12 : 0.05) {
    const src = ac.createBufferSource();
    src.buffer = click;
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2400;
    band.Q.value = 6;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.35, t + at);
    gain.gain.exponentialRampToValueAtTime(0.001, t + at + 0.02);
    src.connect(band).connect(gain).connect(ac.destination);
    src.start(t + at);
  }
}

// 拉霸機: a reel clunking to a stop.
export function playReelStop() {
  const ac = audio();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}

// 剪刀石頭布: a soft tap each time the hands change. Ignores the games' mute switch; the page has its own.
export function playHandTick() {
  const ac = audio();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.value = 660 + Math.random() * 120;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.04);
}

// Any sound file or URL, e.g. the teacher's picks for 開禮物. Ignores the games' mute switch; the page has its own.
export function playSoundFile(src: string) {
  const a = fileAudio(src);
  a.currentTime = 0;
  a.play().catch(() => {});
}

export const preloadSoundFile = (src: string) => fileAudio(src).load();
