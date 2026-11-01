/**
 * frameModel — where to put the camera for a scene nobody described (doc 166).
 *
 * A scene from another tool carries no camera rig, and splat scenes are full
 * of floaters: a few points far away would make a plain bounding box frame the
 * empty sky. The box is taken between quantiles of each axis instead, so the
 * camera frames where the points actually are. Pure: no three.js.
 *
 * @module engine/frameModel
 */

export type Vec3 = [number, number, number];
export interface Bounds { center: Vec3; radius: number }

/** The share of points left out at each end of each axis. */
export const FRAME_QUANTILE = 0.02;
/** At most this many points are read to frame a scene: past it, a stride. */
export const FRAME_SAMPLE = 200_000;

/**
 * The box between quantiles `q` and `1 − q` of each axis of `xyz` (x, y, z
 * interleaved): its centre and the radius of the sphere around it. Null for
 * no point or a non-finite result.
 */
export function robustBounds(xyz: ArrayLike<number>, q = FRAME_QUANTILE): Bounds | null {
  const n = Math.floor(xyz.length / 3);
  if (n === 0) return null;
  const axes = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) axes[a]![i] = xyz[3 * i + a]!;
  const lo: number[] = [], hi: number[] = [];
  for (const axis of axes) {
    axis.sort();
    lo.push(axis[Math.min(n - 1, Math.floor(q * (n - 1)))]!);
    hi.push(axis[Math.max(0, Math.ceil((1 - q) * (n - 1)))]!);
  }
  const center: Vec3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  const radius = Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2;
  if (!center.every(Number.isFinite) || !Number.isFinite(radius)) return null;
  // A single point (or a flat cloud) still needs a distance to look from.
  return { center, radius: radius > 0 ? radius : 1 };
}

/**
 * How far the camera stands from the centre so the sphere fits the view:
 * through the narrower of the vertical and horizontal fields, with a margin.
 */
export function frameDistance(radius: number, fovDeg: number, aspect: number, margin = 1.15): number {
  const v = (fovDeg * Math.PI) / 360;
  const h = Math.atan(Math.tan(v) * Math.max(aspect, 1e-3));
  return (radius * margin) / Math.sin(Math.min(v, h));
}

/**
 * The vertical field of view for a window of `aspect` (width / height): the
 * given one on a landscape window; on a portrait one, wide enough that the
 * horizontal field stays the given one, so a viewpoint filmed in landscape
 * does not lose its sides on a phone. Never past `maxDeg`.
 */
export function fovForAspect(fovDeg: number, aspect: number, maxDeg = 100): number {
  if (!(aspect > 0) || aspect >= 1) return fovDeg;
  const half = (fovDeg * Math.PI) / 360;
  const widened = (Math.atan(Math.tan(half) / aspect) * 360) / Math.PI;
  return Math.min(maxDeg, widened);
}

/** Every `stride`-th index so that at most `max` of `count` are read (1 when all fit). */
export function sampleStride(count: number, max = FRAME_SAMPLE): number {
  return count <= max ? 1 : Math.ceil(count / max);
}
