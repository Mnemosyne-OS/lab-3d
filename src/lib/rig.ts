/**
 * rig — cameras.json read safely: three numbers for the target and the up,
 * and the cameras that are three numbers each. Anything else is no rig, so a
 * scene is framed from its points instead of from a broken viewpoint. Where
 * each camera looked is kept only when it pairs one to one with the cameras
 * kept: a look given to the wrong camera is worse than none.
 *
 * @module lib/rig
 */
import type { Rig } from '../core/stageModel';

const isVec3 = (x: unknown): x is [number, number, number] => Array.isArray(x) && x.length === 3 && x.every((n) => Number.isFinite(n));
/** A direction: three numbers, not all zero. */
const isLook = (x: unknown): x is [number, number, number] => isVec3(x) && Math.hypot(...x) > 1e-9;

export function asRig(v: unknown): Rig | null {
  const r = v as Partial<Rig> | null;
  if (!r || !isVec3(r.target) || !isVec3(r.up) || !Array.isArray(r.cams)) return null;
  const cams = r.cams.filter(isVec3);
  if (cams.length === 0) return null;
  const looks = Array.isArray(r.looks) && r.looks.length === r.cams.length && cams.length === r.cams.length && r.looks.every(isLook) ? r.looks : null;
  return looks ? { target: r.target, up: r.up, cams, looks } : { target: r.target, up: r.up, cams };
}

/** The bytes of a cameras.json, or null when they are not JSON or not a rig. */
export function rigOfBytes(bytes: Uint8Array): Rig | null {
  try {
    return asRig(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (err) {
    console.warn('[lab-3d] cameras.json is not JSON:', err);
    return null;
  }
}
