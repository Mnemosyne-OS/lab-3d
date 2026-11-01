/**
 * worldModel — the painting cut into a world (doc 166 §15.4): its colour
 * masses, each a layer floating at its own depth, the dark ones far, the light
 * ones near. Pure: plain arrays in and out, no DOM, no randomness (the same
 * canvas gives the same world every time it is opened).
 *
 * Every number here is the one of the prototype Tony approved on 24/10 (a
 * video made from his mother's canvas, 960 px tall), expressed as a share of
 * the picture's height so it holds at any working size: levels stretched from
 * 1 % to 99.5 % per channel with a gamma of 0.85, a blur of 14 px before the
 * colours are grouped, 5 masses, a majority filter of 15 px twice.
 *
 * @module features/painting/worldModel
 */
import { PICTURE_FOV_DEG, flatSize } from './paintingModel';

/** The retouch: each channel stretched between these percentiles, then this gamma. */
export const LEVELS_LOW = 1;
export const LEVELS_HIGH = 99.5;
export const LEVELS_GAMMA = 0.85;

/** How many colour masses the canvas is cut into. */
export const MASSES = 5;
/** The colours are grouped on a picture at most this tall: the masses are large, more pixels only cost time. */
export const WORK_HEIGHT = 320;
/** The blur before grouping, as a share of the height (14 px of 960): a fine stroke is not a mass. */
export const BLUR_SHARE = 14 / 960;
/** The majority filter's window, as a share of the height (15 px of 960), applied MAJORITY_PASSES times. */
export const MAJORITY_SHARE = 15 / 960;
export const MAJORITY_PASSES = 2;
/** Rounds of grouping: the masses no longer move well before. */
export const KMEANS_ROUNDS = 25;

/** Where the layers stand, in anchor distances: the farthest mass, the nearest, and the whole canvas behind them all. */
export const WORLD_FAR = 1.5;
export const WORLD_NEAR = 0.7;
export const WORLD_BACK = 1.6;
/** How far a layer bobs, as a share of its own height (7 px of 960), and in how many seconds. */
export const BOB_SHARE = 7 / 960;
export const BOB_PERIOD_S = 2.5;

/**
 * The retouch of a photo taken in dim light: each channel stretched between
 * its LEVELS_LOW and LEVELS_HIGH percentiles, then the gamma. Alpha untouched.
 */
export function levels(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const n = rgba.length / 4;
  const out = new Uint8ClampedArray(rgba.length);
  const lut: Uint8ClampedArray[] = [];
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[rgba[i * 4 + c]!]!++;
    const lo = percentile(hist, n, LEVELS_LOW);
    const hi = Math.max(lo + 1, percentile(hist, n, LEVELS_HIGH));
    const t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) t[v] = Math.round(Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), LEVELS_GAMMA) * 255);
    lut.push(t);
  }
  for (let i = 0; i < n; i++) {
    out[i * 4] = lut[0]![rgba[i * 4]!]!;
    out[i * 4 + 1] = lut[1]![rgba[i * 4 + 1]!]!;
    out[i * 4 + 2] = lut[2]![rgba[i * 4 + 2]!]!;
    out[i * 4 + 3] = rgba[i * 4 + 3]!;
  }
  return out;
}

/** The value under which `p` % of the `n` counted values lie. */
function percentile(hist: Uint32Array, n: number, p: number): number {
  const target = (p / 100) * n;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= target) return v;
  }
  return 255;
}

/**
 * CIE Lab (D65) of an sRGB colour, in 8-bit units like the prototype's
 * (Pillow's « LAB »): L × 2.55, a and b + 128.
 */
export function lab8(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [(116 * fy - 16) * 2.55, 500 * (fx - fy) + 128, 200 * (fy - fz) + 128];
}

/** Three box blurs of the given radius over each of `ch` channels: close to a Gaussian. */
export function boxBlur(v: Float32Array, w: number, h: number, ch: number, radius: number): Float32Array {
  if (radius < 1) return v;
  let a = v, b = new Float32Array(v.length);
  for (let pass = 0; pass < 3; pass++) {
    for (const horizontal of [true, false]) {
      const len = horizontal ? w : h, lines = horizontal ? h : w;
      for (let line = 0; line < lines; line++) {
        for (let c = 0; c < ch; c++) {
          const at = (i: number) => ((horizontal ? line * w + i : i * w + line) * ch + c);
          let sum = 0;
          for (let i = -radius; i <= radius; i++) sum += a[at(Math.min(len - 1, Math.max(0, i)))]!;
          for (let i = 0; i < len; i++) {
            b[at(i)] = sum / (2 * radius + 1);
            sum += a[at(Math.min(len - 1, i + radius + 1))]! - a[at(Math.max(0, i - radius))]!;
          }
        }
      }
      [a, b] = [b, a];
    }
  }
  return a;
}

/** Each pixel takes the label most of its window holds (`size` odd), ties kept as they are. */
export function majority(labels: Uint8Array, w: number, h: number, k: number, size: number): Uint8Array {
  const r = size >> 1;
  const out = new Uint8Array(labels.length);
  const count = new Uint32Array(k);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      count.fill(0);
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) count[labels[yy * w + xx]!]!++;
      }
      const own = labels[y * w + x]!;
      let best = own;
      for (let c = 0; c < k; c++) if (count[c]! > count[best]!) best = c;
      out[y * w + x] = best;
    }
  }
  return out;
}

export interface Masses {
  /** Per pixel of the working picture, its mass by depth rank: 0 the farthest (darkest), MASSES - 1 the nearest. */
  labels: Uint8Array;
  width: number;
  height: number;
  /** How many masses hold at least one pixel. */
  count: number;
}

/**
 * The colour masses of a picture (RGBA, `w` × `h`, already at its working
 * size): blurred, grouped in Lab by k-means started from the quantiles of
 * lightness (no randomness), smoothed by the majority filter, then ranked by
 * lightness, dark (far) to light (near).
 */
export function colourMasses(rgba: Uint8ClampedArray, w: number, h: number, k = MASSES): Masses {
  const n = w * h;
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [L, a, b] = lab8(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
    lab[i * 3] = L; lab[i * 3 + 1] = a; lab[i * 3 + 2] = b;
  }
  const blurred = boxBlur(lab, w, h, 3, Math.max(0, Math.round(BLUR_SHARE * h)));
  // Started from the lightness quantiles: the same picture always gives the same masses.
  const byL = Array.from({ length: n }, (_, i) => i).sort((p, q) => blurred[p * 3]! - blurred[q * 3]!);
  const centres = Array.from({ length: k }, (_, c) => {
    const i = byL[Math.min(n - 1, Math.floor(((c + 0.5) / k) * n))]!;
    return [blurred[i * 3]!, blurred[i * 3 + 1]!, blurred[i * 3 + 2]!];
  });
  const labels = new Uint8Array(n);
  for (let round = 0; round < KMEANS_ROUNDS; round++) {
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const C = centres[c]!;
        const d = (blurred[i * 3]! - C[0]!) ** 2 + (blurred[i * 3 + 1]! - C[1]!) ** 2 + (blurred[i * 3 + 2]! - C[2]!) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      labels[i] = best;
      const s = sum[best]!;
      s[0]! += blurred[i * 3]!; s[1]! += blurred[i * 3 + 1]!; s[2]! += blurred[i * 3 + 2]!; s[3]!++;
    }
    for (let c = 0; c < k; c++) {
      const s = sum[c]!;
      if (s[3]! > 0) centres[c] = [s[0]! / s[3]!, s[1]! / s[3]!, s[2]! / s[3]!];
    }
  }
  const win = Math.max(1, Math.round(MAJORITY_SHARE * h)) | 1;
  let smooth = labels;
  for (let p = 0; p < MAJORITY_PASSES; p++) smooth = majority(smooth, w, h, k, win);
  // Ranked by lightness: the dark far, the light near.
  const rankOf = new Uint8Array(k);
  centres.map((C, c) => ({ c, L: C[0]! })).sort((p, q) => p.L - q.L).forEach((e, r) => { rankOf[e.c] = r; });
  const ranked = new Uint8Array(n);
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) { ranked[i] = rankOf[smooth[i]!]!; seen.add(ranked[i]!); }
  return { labels: ranked, width: w, height: h, count: seen.size };
}

/** The working size of a picture: at most WORK_HEIGHT tall, its shape kept. */
export function workSize(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, WORK_HEIGHT / Math.max(1, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Where the layer of rank `r` (0 the farthest) stands, in anchor distances. */
export function layerDistance(r: number, k = MASSES): number {
  return k <= 1 ? WORLD_NEAR : WORLD_FAR - ((WORLD_FAR - WORLD_NEAR) * r) / (k - 1);
}

/**
 * The height of a plane at distance `d` from the anchor that covers exactly
 * the picture's field there: from the anchor every layer lands on its own
 * pixels, the world looks like the flat picture until the camera moves.
 */
export function planeHeight(d: number): number {
  return flatSize(PICTURE_FOV_DEG, 1).height * d;
}

/** A layer's bob at `t` seconds, in anchor units: still when the drift is. Nearer layers move more. */
export function bobOffset(t: number, r: number, d: number, moving: boolean, k = MASSES): number {
  if (!moving) return 0;
  const near = k <= 1 ? 1 : r / (k - 1);
  return BOB_SHARE * planeHeight(d) * (0.4 + near) * Math.sin(2 * Math.PI * (t / BOB_PERIOD_S + r * 0.37));
}
