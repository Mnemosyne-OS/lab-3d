/**
 * inkModel — the ink stain a photo of the day appears through (« Une
 * journée »): a few blobs that spread from the middle, fast then slower, their
 * edges torn by a noise that calms down as the stain covers the picture, like
 * ink going into skin. Pure: the shapes and their sizes over time.
 *
 * @module features/day/inkModel
 */

/** How long the stain takes to cover the photo. */
export const INK_MS = 1100;

export interface Blob { x: number; y: number; r: number }

/** Fast, then slower. */
export function inkSpread(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return 1 - Math.pow(1 - x, 3);
}

/** A small seeded random, so one photo always spreads the same way. */
function rand(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * The seed of a photo shown as a (data) URL: its length and its last 256
 * characters, never the whole text. A data URL of a phone photo is ~12 MB,
 * and its end differs from one photo to the next.
 */
export function photoSeed(url: string): number {
  return seedOf(`${url.length}:${url.slice(-256)}`);
}

/** The seed of a short text. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The stain at `u` (0..1) over a picture of `w` × `h`: one blob from the
 * middle that ends past the corners, and three smaller ones that start late
 * around it. At u = 1 the first one alone covers everything.
 */
export function inkBlobs(w: number, h: number, u: number, seed: number): Blob[] {
  const r = rand(seed);
  const diag = Math.hypot(w, h);
  const e = inkSpread(u);
  const blobs: Blob[] = [{ x: w / 2, y: h / 2, r: 0.62 * diag * e }];
  for (let i = 0; i < 3; i++) {
    const delay = 0.12 + 0.25 * r();
    const local = inkSpread((u - delay) / (1 - delay));
    blobs.push({ x: w * (0.2 + 0.6 * r()), y: h * (0.2 + 0.6 * r()), r: (0.18 + 0.12 * r()) * diag * local });
  }
  return blobs;
}

/** How torn the edge is, in the picture's units: wide at first, calm at the end. */
export function inkTear(w: number, u: number): number {
  return w * (0.02 + 0.1 * (1 - inkSpread(u)));
}
