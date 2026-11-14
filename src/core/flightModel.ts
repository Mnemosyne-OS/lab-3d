/**
 * flightModel — the camera flying from where it stands to a spot of the day
 * (Lab 3D « Une journée »): the eye glides along a straight line while the
 * look turns the short way round, slow at both ends. Pure.
 *
 * The look is in the walk's own angles (yaw around the scene's vertical,
 * pitch above the horizon), so the flight never rolls the view.
 *
 * @module core/flightModel
 */
import type { Look } from './walkModel';

type Vec3 = [number, number, number];

export interface EyeAt { position: Vec3; look: Look }

/** The shortest flight, and the longest: a far spot takes longer, never forever. */
export const FLIGHT_MIN_MS = 900;
export const FLIGHT_MAX_MS = 2600;

/** Slow start, slow end. */
export function easeInOut(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** The turn from `a` to `b` the short way, in (-π, π]. */
export function shortTurn(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Where the eye is at `u` (0..1) of the flight. */
export function flightAt(from: EyeAt, to: EyeAt, u: number): EyeAt {
  const e = easeInOut(u);
  const p = from.position;
  const q = to.position;
  return {
    position: [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e, p[2] + (q[2] - p[2]) * e],
    look: { yaw: from.look.yaw + shortTurn(from.look.yaw, to.look.yaw) * e, pitch: from.look.pitch + (to.look.pitch - from.look.pitch) * e },
  };
}

/** How long a flight lasts: by the distance, as a share of the place's size, and by how far the look turns. */
export function flightMs(from: EyeAt, to: EyeAt, placeScale: number): number {
  const d = Math.hypot(to.position[0] - from.position[0], to.position[1] - from.position[1], to.position[2] - from.position[2]);
  const far = placeScale > 0 ? Math.min(1, d / placeScale) : 1;
  const turn = Math.abs(shortTurn(from.look.yaw, to.look.yaw)) / Math.PI;
  return Math.round(FLIGHT_MIN_MS + (FLIGHT_MAX_MS - FLIGHT_MIN_MS) * Math.min(1, Math.max(far, turn * 0.6)));
}
