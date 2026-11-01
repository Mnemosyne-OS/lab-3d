/**
 * diveModel — the dive into a painting (doc 166 §15.5): zoom with the wheel
 * where you want, then « Dive further » has the image model paint what lies
 * inside, one level per click, each nested in the one before. Pure: the
 * levels' places, the view, the window sent to the model, the fades. No DOM.
 *
 * Measured on the prototype (24/10, Tony's canvas): a level is the model's
 * repaint of a 3:4 window HALF as wide as the level it sits in, sent as the
 * picture to change; the whole painting must NOT be sent as a reference (the
 * model then repainted the whole painting, out of place); letter-like marks
 * crept in at the first level and stayed, so they are forbidden from it.
 *
 * Coordinates: the painting's own pixels (level 0), y down. A level is a
 * rectangle there; the view is its centre and how many screen pixels one
 * painting pixel takes.
 *
 * @module features/painting/diveModel
 */

/** Each level is this share of its parent's width (×2 per level). */
export const DIVE_STEP = 0.5;
/** The window sent to the model, and the picture it answers: portrait 3:4. */
export const DIVE_ASPECT = 3 / 4;
export const DIVE_RATIO = '3:4';
/** The window is sent at this size (the model answers about 896 × 1195). */
export const DIVE_SEND_WIDTH = 768;
/** The model of a level: the cheapest image model of the credit route. */
export const DIVE_MODEL = 'gemini-3.1-flash-lite-image';
/** Its price per picture as the app's own price list says it (manual, « Images, per generated image »). */
export const DIVE_PRICE_USD = 0.045;
/** A level is shown once it fills this share of the frame's width, fully past FADE_FULL. */
export const FADE_START = 0.45;
export const FADE_FULL = 0.8;
/** A level's edges are softened over this share of its size, so it melts into the one below. */
export const EDGE_SOFT = 0.08;
/** The deepest a view may go: this many screen pixels per pixel of the deepest level's picture. */
export const MAX_SHARPNESS = 2.5;

/**
 * What the model is asked for a level. The large shapes stay put (the level must line up), the
 * matter inside is INVENTED. Chosen on 26/10 over a quieter wording, on the same window of
 * Tony's canvas: both aligned to the pixel, the quiet one added mostly canvas grain (fine detail
 * 21.8 against 18.6 for the window), this one raised crackle, veins, drips (28.6).
 */
export const DIVE_PROMPT = 'This picture is a close-up of an abstract impasto painting. Show what a magnifying glass would reveal: the same view at twice the magnification. Keep the large shapes and colour zones exactly where they are, so the picture lines up with the one given at a glance. But INVENT a new, much richer layer of material inside every zone, far denser than what is visible: thick raised impasto ridges catching light, palette-knife scrapes and sgraffito scratches, drips and pooled paint, fine crackle, embedded pigment grains, layered translucent glazes letting other colours show through from underneath, small islands and veins of contrasting colour from the same palette. Every area must hold new detail, nothing smooth or blurred. Same palette, same gestural hand, physical paint on canvas. No letters, no glyphs, no writing of any kind. Painterly, never photographic, no frame.';

/** One level as kept: the picture the model answered, and its window in its parent (share of the parent's width and height). */
export interface DiveLevel { path: string; x: number; y: number; w: number; h: number }

export interface Rect { x: number; y: number; w: number; h: number }
/** The view: the painting point at the frame's centre, and screen pixels per painting pixel. */
export interface View { cx: number; cy: number; scale: number }

/** Each level's rectangle in the painting's pixels, level 0 (the painting) first. */
export function levelRects(painting: { width: number; height: number }, levels: readonly DiveLevel[]): Rect[] {
  const out: Rect[] = [{ x: 0, y: 0, w: painting.width, h: painting.height }];
  for (const l of levels) {
    const p = out[out.length - 1]!;
    out.push({ x: p.x + l.x * p.w, y: p.y + l.y * p.h, w: l.w * p.w, h: l.h * p.h });
  }
  return out;
}

/**
 * The window of a new level inside `parent` (its rectangle), around the
 * painting point (px, py): 3:4, half the parent's width (less if the parent is
 * too flat for it), kept inside the parent. As shares of the parent.
 */
export function diveWindow(parent: Rect, px: number, py: number): { x: number; y: number; w: number; h: number } {
  const wPx = DIVE_STEP * Math.min(parent.w, parent.h * DIVE_ASPECT);
  const hPx = wPx / DIVE_ASPECT;
  const x0 = Math.min(Math.max(parent.x, px - wPx / 2), parent.x + parent.w - wPx);
  const y0 = Math.min(Math.max(parent.y, py - hPx / 2), parent.y + parent.h - hPx);
  return { x: (x0 - parent.x) / parent.w, y: (y0 - parent.y) / parent.h, w: wPx / parent.w, h: hPx / parent.h };
}

/** The view that shows the whole painting in a frame, with a little room. */
export function fitView(painting: { width: number; height: number }, frame: { width: number; height: number }): View {
  const scale = 0.94 * Math.min(frame.width / painting.width, frame.height / painting.height);
  return { cx: painting.width / 2, cy: painting.height / 2, scale };
}

/**
 * The view after a wheel step of `factor` (> 1 closer) at the frame point
 * (fx, fy): the painting point under the pointer stays under it. Bounded by
 * the whole painting fitted, and by MAX_SHARPNESS on the deepest level.
 */
export function zoomAt(v: View, factor: number, fx: number, fy: number, frame: { width: number; height: number }, min: number, max: number): View {
  const scale = Math.min(max, Math.max(min, v.scale * factor));
  const k = scale / v.scale;
  // The painting point under the pointer, before and after.
  const px = v.cx + (fx - frame.width / 2) / v.scale;
  const py = v.cy + (fy - frame.height / 2) / v.scale;
  return { cx: px - (px - v.cx) / k, cy: py - (py - v.cy) / k, scale };
}

/** The deepest scale allowed: MAX_SHARPNESS screen pixels per pixel of the deepest level's own picture. */
export function maxScale(deepest: Rect, pictureWidth: number): number {
  return (MAX_SHARPNESS * pictureWidth) / deepest.w;
}

/** A level's rectangle on the frame, in frame pixels. */
export function onFrame(r: Rect, v: View, frame: { width: number; height: number }): Rect {
  return { x: (r.x - v.cx) * v.scale + frame.width / 2, y: (r.y - v.cy) * v.scale + frame.height / 2, w: r.w * v.scale, h: r.h * v.scale };
}

/** How opaque a level is drawn: 0 while small on the frame, 1 once it fills FADE_FULL of its width. Level 0 is always 1. */
export function levelFade(index: number, onFrameWidth: number, frameWidth: number): number {
  if (index === 0) return 1;
  const fill = Math.min(1, onFrameWidth / Math.max(1, frameWidth));
  return Math.min(1, Math.max(0, (fill - FADE_START) / (FADE_FULL - FADE_START)));
}

/** The levels kept for each painting, read back: anything malformed is dropped, never guessed. */
export function parseDives(raw: unknown): Record<string, DiveLevel[]> {
  const out: Record<string, DiveLevel[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const levels: DiveLevel[] = [];
    for (const l of v) {
      const o = l as Record<string, unknown>;
      const nums = ['x', 'y', 'w', 'h'].map((f) => o?.[f]);
      if (typeof o?.path !== 'string' || !nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) break;
      levels.push({ path: o.path, x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number });
    }
    if (levels.length) out[k] = levels;
  }
  return out;
}
