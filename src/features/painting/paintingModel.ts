/**
 * paintingModel — a painting brought to life (doc 166 §15): the photo of a
 * painting laid on its depth (the same relief as the décor, doc 166 §12),
 * seen by a camera that drifts slowly inside it and follows the pointer.
 * Pure: the drift, the framing, the list of recent paintings. No three.js.
 *
 * The scene is built once from an anchor camera standing at distance 1 from
 * the centre of turn, looking down -z; the picture spans PICTURE_FOV_DEG
 * vertically from there. Everything below is in units of that distance.
 *
 * @module features/painting/paintingModel
 */
import type { Vec3 } from '../../core/groundModel';

/** The vertical field the whole picture spans from the anchor. */
export const PICTURE_FOV_DEG = 36;
/** The picture fills at most this share of the view, so its edges stay in sight while the camera drifts. */
export const FRAME_MARGIN = 0.9;

/**
 * How far the camera drifts from the anchor, in anchor distances: side to
 * side, up and down, and toward the picture. The nearest stroke sits at 0.45
 * (RELIEF_NEAR): a dolly past about 0.3 would go through it.
 */
export const DRIFT = { sway: 0.05, rise: 0.025, dolly: 0.16, pointer: 0.07 } as const;
/** Seconds per drift cycle, prime to each other so the path never repeats exactly. */
export const DRIFT_PERIODS = { sway: 23, rise: 29, dolly: 37 } as const;

/** A pointer over the stage, -1..1 each way (y up); null when it is elsewhere. */
export interface Pointer { x: number; y: number }

/**
 * Where the camera stands at `t` seconds, relative to the centre of turn. It
 * always looks at that centre, so the strokes in front of it move one way and
 * those behind it the other: that is the relief. `moving` false keeps only
 * the pointer (a person who asked for less motion, or a pause).
 */
export function driftPosition(t: number, pointer: Pointer | null, moving: boolean): Vec3 {
  const wave = (period: number) => Math.sin((2 * Math.PI * t) / period);
  const px = pointer ? clamp(pointer.x) : 0;
  const py = pointer ? clamp(pointer.y) : 0;
  const x = (moving ? DRIFT.sway * wave(DRIFT_PERIODS.sway) : 0) + DRIFT.pointer * px;
  const y = (moving ? DRIFT.rise * wave(DRIFT_PERIODS.rise) : 0) + DRIFT.pointer * py;
  // From the anchor (0) to DRIFT.dolly forward and back: (1 - cos) / 2 starts at rest.
  const z = 1 - (moving ? (DRIFT.dolly * (1 - Math.cos((2 * Math.PI * t) / DRIFT_PERIODS.dolly))) / 2 : 0);
  return [x, y, z];
}

/**
 * The camera's vertical field so the picture fits whole in the view (both
 * aspects width over height), with `margin` of the view around it: by height
 * when the view is wider than the picture, by width otherwise.
 */
export function cameraFovToContain(pictureFovDeg: number, viewAspect: number, pictureAspect: number, margin = FRAME_MARGIN): number {
  const half = Math.tan((pictureFovDeg * Math.PI) / 360);
  const byWidth = Math.max(1, pictureAspect / Math.max(1e-6, viewAspect));
  const t = (half * byWidth) / Math.max(0.1, margin);
  return (Math.atan(t) * 360) / Math.PI;
}

/** The size of the flat picture at distance 1 from the anchor (when no depth can be read). */
export function flatSize(pictureFovDeg: number, pictureAspect: number): { width: number; height: number } {
  const height = 2 * Math.tan((pictureFovDeg * Math.PI) / 360);
  return { width: height * pictureAspect, height };
}

/** How many paintings the list keeps. */
export const RECENT_MAX = 12;

/** The list with `path` first, once, cut to RECENT_MAX. */
export function addRecent(list: readonly string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX);
}

/** A kept list read back: only strings, no duplicates, at most RECENT_MAX; anything else is an empty list. */
export function parseRecent(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const p of raw) if (typeof p === 'string' && p && !out.includes(p) && out.length < RECENT_MAX) out.push(p);
  return out;
}

/**
 * The photos of a phone series, in the order they were taken: the host names
 * them 001.jpg, 002.jpg… (the phone page always sends JPEG, doc 176), in the
 * folder's own separator.
 */
export function seriesPhotos(dir: string, count: number): string[] {
  const base = trimSep(dir);
  return Array.from({ length: Math.max(0, count) }, (_, i) => `${base}${sepOf(dir)}${String(i + 1).padStart(3, '0')}.jpg`);
}

/** The list with every path right under `from` moved under `to` (a series put away), the rest untouched. */
export function movedPaths(list: readonly string[], from: string, to: string): string[] {
  const f = trimSep(from);
  return list.map((p) => {
    const cut = p.lastIndexOf(sepOf(p));
    return cut > 0 && p.slice(0, cut) === f ? `${trimSep(to)}${sepOf(to)}${p.slice(cut + 1)}` : p;
  });
}

const BACKSLASH = String.fromCharCode(92);
/** A Windows path's separator where it has one, else the slash. */
function sepOf(p: string): string {
  return p.includes(BACKSLASH) ? BACKSLASH : '/';
}
function trimSep(p: string): string {
  let end = p.length;
  while (end > 1 && (p[end - 1] === '/' || p[end - 1] === BACKSLASH)) end--;
  return p.slice(0, end);
}

/** The file's name without its folder or extension. */
export function paintingName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, '') || base;
}

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0;
}
