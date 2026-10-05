// Synthesises the combat sound effects (cannon, splash, hit, sink) into assets/audio/.
// They are generated from noise and oscillators, not sampled, so they are original and royalty-free.
// Seeded, so every run produces the same files. Needs ffmpeg for MP3; without it, WAV files are written instead.
//
//   node scripts/make-sfx.js
//
// UI cues in assets/audio/ come from the uisfx pack (CC0); see assets/audio/CREDITS.md.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RATE = 44100;
const OUT = path.resolve(__dirname, '..', 'assets', 'audio');

// ---- building blocks -------------------------------------------------------

/** Deterministic PRNG (mulberry32) so the noise is the same on every run. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buffer = (seconds) => new Float32Array(Math.round(seconds * RATE));

function noise(seconds, rand) {
  const b = buffer(seconds);
  for (let i = 0; i < b.length; i++) b[i] = rand() * 2 - 1;
  return b;
}

/** RBJ biquad; `freq` may be a function of time (seconds) for sweeps. */
function biquad(input, type, freq, q = 0.707) {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const f = typeof freq === 'function' ? freq(i / RATE) : freq;
    const w = (2 * Math.PI * Math.min(f, RATE * 0.45)) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    let b0, b1, b2;
    if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; } // bandpass, 0 dB peak
    const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    const x = input[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** Attack then exponential decay with time constant `tau`, starting at `start` seconds. */
const env = (attack, tau, start = 0) => (t) => {
  const u = t - start;
  if (u < 0) return 0;
  return u < attack ? u / attack : Math.exp(-(u - attack) / tau);
};

function shape(input, envelope, gain = 1) {
  for (let i = 0; i < input.length; i++) input[i] *= gain * envelope(i / RATE);
  return input;
}

/** Sine whose frequency follows `freq(t)`; phase is integrated so sweeps stay smooth. */
function sweep(seconds, freq, envelope, gain = 1, wave = Math.sin) {
  const b = buffer(seconds);
  let phase = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * freq(t)) / RATE;
    b[i] = wave(phase) * envelope(t) * gain;
  }
  return b;
}

const saw = (phase) => ((phase / Math.PI) % 2) - 1;

function mixInto(target, source, offsetSeconds = 0) {
  const off = Math.round(offsetSeconds * RATE);
  for (let i = 0; i < source.length && off + i < target.length; i++) target[off + i] += source[i];
  return target;
}

/** Soft clip, short fade-out, normalise to -1 dBFS. */
function finish(b, drive = 1.5) {
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive);
  const fade = Math.round(0.05 * RATE);
  for (let i = 0; i < fade; i++) b[b.length - 1 - i] *= i / fade;
  let peak = 0;
  for (const v of b) peak = Math.max(peak, Math.abs(v));
  const g = peak ? 0.89 / peak : 1;
  for (let i = 0; i < b.length; i++) b[i] *= g;
  return b;
}

/** A rising bubble: short sine chirp. */
function bubble(rand, base, gain = 0.5) {
  const len = 0.03 + rand() * 0.05;
  const f0 = base * (0.8 + rand() * 0.6);
  return sweep(len, (t) => f0 * (1 + 2.5 * t / len), (t) => Math.sin(Math.PI * t / len) ** 2, gain);
}

// ---- the cues ---------------------------------------------------------------

/** Ship's cannon: low thump, a bright muzzle blast that darkens quickly, and a rumbling tail. */
function cannon() {
  const rand = rng(11);
  const len = 1.5;
  const out = buffer(len);
  mixInto(out, sweep(len, (t) => 35 + 70 * Math.exp(-t / 0.08), env(0.003, 0.28), 1.0));
  mixInto(out, shape(biquad(noise(len, rand), 'lowpass', (t) => 300 + 3500 * Math.exp(-t / 0.05)), env(0.002, 0.12), 1.4));
  mixInto(out, shape(biquad(noise(len, rand), 'lowpass', 180), env(0.02, 0.45), 0.9));
  return finish(out, 1.8);
}

/** Shot lands in the water: a hissing splash with droplets. */
function splash() {
  const rand = rng(23);
  const len = 1.2;
  const out = buffer(len);
  mixInto(out, shape(biquad(noise(len, rand), 'bandpass', (t) => 900 + 1400 * Math.exp(-t / 0.2), 0.6), env(0.025, 0.22), 1.6));
  mixInto(out, shape(biquad(noise(len, rand), 'highpass', 4000), env(0.01, 0.12), 0.5));
  mixInto(out, shape(biquad(noise(len, rand), 'lowpass', 250), env(0.01, 0.1), 0.6)); // the impact on the surface
  for (let i = 0; i < 14; i++) mixInto(out, bubble(rand, 900, 0.25), 0.12 + rand() * 0.75);
  return finish(out, 1.2);
}

/** Shot hits a ship: a sharp crack, an explosion and crackling debris. */
function hit() {
  const rand = rng(37);
  const len = 1.6;
  const out = buffer(len);
  mixInto(out, shape(biquad(noise(0.05, rand), 'highpass', 2500), env(0.001, 0.012), 1.2)); // crack
  mixInto(out, shape(biquad(noise(len, rand), 'lowpass', (t) => 250 + 2200 * Math.exp(-t / 0.15)), env(0.004, 0.3), 1.6));
  mixInto(out, sweep(len, (t) => 40 + 50 * Math.exp(-t / 0.1), env(0.004, 0.3), 0.9));
  // Debris: sparse clicks through a resonant filter, thinning out over time.
  const debris = buffer(len);
  for (let i = 0; i < debris.length; i++) {
    const t = i / RATE;
    if (rand() < 0.004 * Math.exp(-t / 0.4)) debris[i] = (rand() * 2 - 1) * 4;
  }
  mixInto(out, biquad(debris, 'bandpass', 1800, 2.5), 0.08);
  return finish(out, 1.6);
}

/** Ship sinks: a big explosion, a groaning hull going down, and bubbles rising. */
function sink() {
  const rand = rng(53);
  const len = 3.2;
  const out = buffer(len);
  mixInto(out, shape(biquad(noise(len, rand), 'lowpass', (t) => 180 + 1800 * Math.exp(-t / 0.25)), env(0.005, 0.5), 1.6));
  mixInto(out, sweep(len, (t) => 30 + 45 * Math.exp(-t / 0.2), env(0.005, 0.6), 1.0));
  // Hull groan: a low sawtooth sliding down, with a slow wobble, through a lowpass.
  const groan = sweep(2.4, (t) => (95 - 40 * t / 2.4) * (1 + 0.03 * Math.sin(2 * Math.PI * 5 * t)),
    (t) => Math.min(1, t / 0.4) * Math.max(0, 1 - t / 2.4), 0.35, saw);
  mixInto(out, biquad(groan, 'lowpass', 400), 0.45);
  // Bubbles get sparser as the wreck goes down.
  let t = 0.6;
  while (t < 3.0) {
    mixInto(out, bubble(rand, 380), t);
    t += 0.04 + (t - 0.6) * 0.12 * rand();
  }
  return finish(out, 1.4);
}

// ---- output -----------------------------------------------------------------

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function hasFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

const CUES = { cannon, splash, hit, sink };
const mp3 = hasFfmpeg();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-'));
fs.mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(CUES)) {
  const tmpWav = path.join(tmp, name + '.wav');
  fs.writeFileSync(tmpWav, wav(make()));
  if (mp3) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmpWav, '-ac', '1', '-b:a', '96k', path.join(OUT, name + '.mp3')]);
  } else {
    fs.copyFileSync(tmpWav, path.join(OUT, name + '.wav'));
  }
  console.log(`${name} -> assets/audio/${name}.${mp3 ? 'mp3' : 'wav'}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
