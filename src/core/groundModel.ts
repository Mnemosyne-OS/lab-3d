/**
 * Where an object cut out of its video stands (doc 163, « the décor »): its
 * base along the vertical the cameras had, the point of the floor under it and
 * the size of its footprint. The floor drawn there hides what was never filmed
 * (an object standing on a table shows nobody its underside), and the décor's
 * camera never goes under it. Pure: no three.js, tested with plain numbers.
 *
 * Measured on seven real objects (doc 163, « Le décor ») before these constants
 * were chosen: the vase's base sits in a dense band at the bottom of its
 * histogram, while the boots carry a sparse cloud far below them (3 % of the
 * peak, then a gap) that a plain low percentile would have taken for the floor.
 */

/** A point or a direction, world units. */
export type Vec3 = [number, number, number];

export interface Ground {
  /** The unit vertical (the cameras' up). */
  up: Vec3;
  /** The base, along `up`, from the rig's target (world units; below the target, so usually negative). */
  base: number;
  /** The top of the object along `up`, from the same target. */
  top: number;
  /** The point of the floor under the object, world coordinates. */
  foot: Vec3;
  /** The footprint's radius around `foot`, across the vertical. */
  footRadius: number;
  /** Splats the measure kept (opaque, near the object's axis), out of all of them. */
  kept: number;
  total: number;
}

/** A splat lighter than this is a haze, not a surface the object stands on. */
export const MIN_OPACITY = 0.2;
/** Splats farther from the vertical axis than this many median radii are floaters, not the object. */
export const CORE_RADIUS_FACTOR = 3;
/** Under this many kept splats there is nothing to measure: no floor, never a guessed one. */
export const MIN_POINTS = 200;
/** Height bins of the histogram that finds the object's body. */
export const BINS = 64;
/** A bin carrying less than this share of the densest bin is empty space below the object. */
export const DENSE_SHARE = 0.04;
/** Empty bins tolerated inside the body (a thin waist, a handle) before it is called the bottom. */
export const MAX_GAP_BINS = 2;
/** Inside the body, this low share of heights is the base (a few stray splats under it are not). */
export const BASE_QUANTILE = 0.004;
/** The footprint is what stands in this lowest share of the object's height. */
export const FOOT_SHARE = 0.12;

/**
 * The object's ground, from the splats' centres (x, y, z interleaved) and
 * their opacities (0..1), against the rig's target and up. Null when the
 * vertical is unreadable or too few splats remain to say anything: the
 * viewer then draws no floor, never one at a made-up height.
 */
export function measureGround(centers: ArrayLike<number>, opacity: ArrayLike<number>, rig: { target: Vec3; up: Vec3 }): Ground | null {
  const u = unit(rig.up);
  if (!u) return null;
  const t = rig.target;
  const total = Math.min(opacity.length, Math.floor(centers.length / 3));
  const h: number[] = [];
  const wx: number[] = []; const wy: number[] = []; const wz: number[] = [];
  const op: number[] = [];
  for (let i = 0; i < total; i++) {
    const o = opacity[i]!;
    if (!(o >= MIN_OPACITY)) continue;
    const vx = centers[3 * i]! - t[0], vy = centers[3 * i + 1]! - t[1], vz = centers[3 * i + 2]! - t[2];
    if (!Number.isFinite(vx + vy + vz)) continue;
    const hi = vx * u[0] + vy * u[1] + vz * u[2];
    h.push(hi); wx.push(vx - hi * u[0]); wy.push(vy - hi * u[1]); wz.push(vz - hi * u[2]); op.push(o);
  }
  if (h.length < MIN_POINTS) return null;
  const radius = h.map((_, i) => Math.hypot(wx[i]!, wy[i]!, wz[i]!));
  const rMax = quantile(radius, 0.5) * CORE_RADIUS_FACTOR;
  const core = h.map((_, i) => i).filter((i) => radius[i]! <= rMax);
  if (core.length < MIN_POINTS) return null;

  const ch = core.map((i) => h[i]!);
  const lo = quantile(ch, 0.002), hi = quantile(ch, 0.998);
  if (!(hi > lo)) return null;
  const width = (hi - lo) / BINS;
  const hist = new Array<number>(BINS).fill(0);
  for (const i of core) {
    const k = Math.floor((h[i]! - lo) / width);
    if (k >= 0 && k < BINS) hist[k] = hist[k]! + op[i]!;
  }
  const peak = hist.indexOf(Math.max(...hist));
  const dense = hist[peak]! * DENSE_SHARE;
  const bottomBin = walk(hist, peak, -1, dense);
  const topBin = walk(hist, peak, 1, dense);
  const bodyLow = lo + bottomBin * width;
  const bodyHigh = lo + (topBin + 1) * width;
  const body = core.filter((i) => h[i]! >= bodyLow && h[i]! <= bodyHigh);
  if (body.length < MIN_POINTS) return null;
  const base = quantile(body.map((i) => h[i]!), BASE_QUANTILE);
  const top = quantile(body.map((i) => h[i]!), 1 - BASE_QUANTILE);
  if (!(top > base)) return null;

  // The footprint: what stands in the lowest share of the object's height.
  const footTop = base + (top - base) * FOOT_SHARE;
  let foot = body.filter((i) => h[i]! >= base && h[i]! <= footTop);
  if (foot.length < 20) foot = body;
  const mx = mean(foot.map((i) => wx[i]!)), my = mean(foot.map((i) => wy[i]!)), mz = mean(foot.map((i) => wz[i]!));
  const footRadius = quantile(foot.map((i) => Math.hypot(wx[i]! - mx, wy[i]! - my, wz[i]! - mz)), 0.9);
  return {
    up: u,
    base,
    top,
    foot: [t[0] + base * u[0] + mx, t[1] + base * u[1] + my, t[2] + base * u[2] + mz],
    footRadius,
    kept: body.length,
    total,
  };
}

/**
 * The farthest the orbit may tilt from the vertical (OrbitControls' polar
 * angle, 0 = straight above) so the camera stays above the floor: at
 * `distance` from a target `targetHeight` above the floor, with `margin` of
 * air. A camera that cannot reach the floor at all is free to the bottom.
 */
export function maxPolarAboveFloor(distance: number, targetHeight: number, margin: number): number {
  if (!(distance > 0) || !Number.isFinite(targetHeight)) return Math.PI;
  const c = (margin - targetHeight) / distance;
  if (c <= -1) return Math.PI;
  if (c >= 1) return 0;
  return Math.acos(c);
}

/**
 * In a décor the camera stays where a product photo is taken: from a little
 * above, never from overhead and never at the floor, since the backdrop is a
 * picture taken from there (polar angles, from the vertical, in radians).
 */
export const DECOR_MIN_POLAR = 1.05;
export const DECOR_MAX_POLAR = 1.48;
/** Where the camera starts in a décor: looking down 18°. */
export const DECOR_POLAR = 1.26;
/** The share of the view's height the object fills when first placed in a décor. */
export const DECOR_FILL = 0.42;
/** The orbit's centre, above the floor, in object heights: the object sits in the lower middle, on the décor's free surface. */
export const DECOR_LIFT = 0.75;

/**
 * Where the camera first stands for an object put in a décor: on the side the
 * person filmed first (`from`, a camera of the video), DECOR_POLAR from the
 * vertical, far enough for the object to fill DECOR_FILL of the view, and
 * turning around a point above it so the object stands low in the frame.
 */
export function decorFraming(g: Ground, from: Vec3, fovDeg: number): { position: Vec3; target: Vec3 } {
  const u = g.up;
  const height = g.top - g.base;
  const target: Vec3 = [g.foot[0] + u[0] * height * DECOR_LIFT, g.foot[1] + u[1] * height * DECOR_LIFT, g.foot[2] + u[2] * height * DECOR_LIFT];
  // The side to look from: the first camera, flattened across the vertical.
  const v: Vec3 = [from[0] - g.foot[0], from[1] - g.foot[1], from[2] - g.foot[2]];
  const along = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  let side: Vec3 | null = unit([v[0] - along * u[0], v[1] - along * u[1], v[2] - along * u[2]]);
  if (!side) side = unit(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]))!;
  const fov = (Math.min(Math.max(fovDeg, 10), 120) * Math.PI) / 180;
  const distance = height / (DECOR_FILL * 2 * Math.tan(fov / 2));
  const s = Math.sin(DECOR_POLAR) * distance, c = Math.cos(DECOR_POLAR) * distance;
  return {
    target,
    position: [target[0] + side[0] * s + u[0] * c, target[1] + side[1] * s + u[1] * c, target[2] + side[2] * s + u[2] * c],
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Bins kept from `from` going `step` (-1 down, +1 up) while dense, crossing at most MAX_GAP_BINS empty ones. */
function walk(hist: number[], from: number, step: -1 | 1, dense: number): number {
  let last = from;
  let gap = 0;
  for (let k = from + step; k >= 0 && k < hist.length; k += step) {
    if (hist[k]! >= dense) { last = k; gap = 0; }
    else if (++gap > MAX_GAP_BINS) break;
  }
  return last;
}

function unit(v: Vec3): Vec3 | null {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 0 && Number.isFinite(l) ? [v[0] / l, v[1] / l, v[2] / l] : null;
}

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

/** The q-quantile (0..1) of `a`, nearest rank; `a` is not changed. */
export function quantile(a: readonly number[], q: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]!;
}
