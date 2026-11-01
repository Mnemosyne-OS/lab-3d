/**
 * The pure half of walking inside a scene (doc 166 §14): a place filmed or
 * photographed, then visited at eye height instead of turned around. No
 * three.js, no DOM, tested with plain values.
 *
 * Everything is measured in the scene's own frame: the real vertical COLMAP
 * gave the cameras (rig.up) and two axes across it. A box in the world's axes
 * would lean with a tilted scene and let the eye through the floor.
 *
 * The visit stays where the person filmed (doc 163 §7): the camera centres'
 * box, with a margin, and the eye's height kept within the heights the
 * cameras had. Past that the scene was never seen, and the splats show it.
 * A box over-includes the corners of an L-shaped walk; nothing finer is
 * measured today.
 *
 * @module core/walkModel
 */
import type { Rig } from './stageModel';

type Vec3 = [number, number, number];

/** The scene's frame: two horizontal axes and the vertical, right-handed (a × b = up). */
export interface WalkBasis { a: Vec3; b: Vec3; up: Vec3 }

/** Where the eye may go, in the basis's coordinates (along a, along b, height). */
export interface WalkZone {
  basis: WalkBasis;
  min: Vec3;
  max: Vec3;
  /** The scene's size: the median distance from a camera to what was filmed. */
  scale: number;
  /** Walking speed, scene units per second. */
  speed: number;
}

/** The look, as two angles in the basis: yaw around up from a, pitch above the horizontal. */
export interface Look { yaw: number; pitch: number }

/** The highest and lowest look, so the view never flips over the vertical. */
export const MAX_PITCH = (85 * Math.PI) / 180;
/** Radians turned per pixel dragged. */
export const TURN_PER_PX = 0.004;
/** Margin around the cameras' box, as a share of its widest side. */
const MARGIN_SHARE = 0.15;
/** The smallest margin, as a share of the scene's size: a turn on the spot still allows a step. */
const MARGIN_FLOOR = 0.15;
/** How far the eye may rise above or sink below the filmed heights, as a share of the scene's size. */
const HEIGHT_MARGIN = 0.05;
/** The cameras' box is crossed in about this many seconds… */
const CROSS_SECONDS = 8;
/** …and never slower than this share of the scene's size per second. */
const SPEED_FLOOR = 0.25;
/** Held Shift multiplies the speed. */
export const RUN_FACTOR = 3;
/** The arrow keys turn this fast, radians per second (about 70° a second). */
export const KEY_TURN_RAD_S = 1.2;
/** How fast a move reaches the speed asked and stops when let go: 1 / this, in seconds. */
const EASE_PER_S = 10;

/** A move asked by the keys or the on-screen pad, each part −1, 0 or 1. */
export interface Held { forward: number; side: number; rise: number; turn: number }

export const NO_HOLD: Held = { forward: 0, side: 0, rise: 0, turn: 0 };

export type WalkKey = 'forward' | 'back' | 'left' | 'right' | 'rise' | 'sink' | 'turnLeft' | 'turnRight';

/**
 * A key by its PHYSICAL place (KeyboardEvent.code), never its letter: the
 * four keys under the left hand are WASD on a QWERTY keyboard and ZQSD on an
 * AZERTY one, and both are « KeyW KeyA KeyS KeyD ». Arrows turn left and right.
 */
export function walkKey(code: string): WalkKey | null {
  switch (code) {
    case 'KeyW': case 'ArrowUp': return 'forward';
    case 'KeyS': case 'ArrowDown': return 'back';
    case 'KeyA': return 'left';
    case 'KeyD': return 'right';
    case 'KeyE': case 'PageUp': return 'rise';
    case 'KeyQ': case 'PageDown': return 'sink';
    case 'ArrowLeft': return 'turnLeft';
    case 'ArrowRight': return 'turnRight';
    default: return null;
  }
}

/** What a set of keys held asks, opposite keys cancelling out. */
export function heldOf(keys: ReadonlySet<WalkKey>): Held {
  const v = (plus: WalkKey, minus: WalkKey) => (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0);
  return { forward: v('forward', 'back'), side: v('right', 'left'), rise: v('rise', 'sink'), turn: v('turnLeft', 'turnRight') };
}

/** The scene's frame from its vertical; null when the vertical is not a direction. */
export function walkBasis(upRaw: Vec3): WalkBasis | null {
  const up = norm(upRaw);
  if (!up) return null;
  const seed: Vec3 = Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = norm(sub(seed, scale(up, dot(seed, up))))!;
  return { a, b: cross(up, a), up };
}

/** A world point in the basis's coordinates. */
export function toBasis(k: WalkBasis, p: Vec3): Vec3 {
  return [dot(p, k.a), dot(p, k.b), dot(p, k.up)];
}

/** Back from the basis's coordinates to the world. */
export function fromBasis(k: WalkBasis, q: Vec3): Vec3 {
  return add(add(scale(k.a, q[0]), scale(k.b, q[1])), scale(k.up, q[2]));
}

/** Where the eye may go in a scene the cameras COLMAP placed; null without cameras. */
export function walkZone(rig: Rig): WalkZone | null {
  const basis = walkBasis(rig.up);
  if (!basis || rig.cams.length === 0) return null;
  const qs = rig.cams.map((c) => toBasis(basis, c));
  const lo = [0, 1, 2].map((i) => Math.min(...qs.map((q) => q[i]!))) as Vec3;
  const hi = [0, 1, 2].map((i) => Math.max(...qs.map((q) => q[i]!))) as Vec3;
  const dists = rig.cams.map((c) => Math.hypot(...sub(c, rig.target))).sort((x, y) => x - y);
  const sceneScale = Math.max(1e-6, dists[dists.length >> 1]!);
  const wide = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  const m = Math.max(MARGIN_SHARE * wide, MARGIN_FLOOR * sceneScale);
  const h = HEIGHT_MARGIN * sceneScale;
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]);
  return {
    basis,
    min: [lo[0] - m, lo[1] - m, lo[2] - h],
    max: [hi[0] + m, hi[1] + m, hi[2] + h],
    scale: sceneScale,
    speed: Math.max(diag / CROSS_SECONDS, SPEED_FLOOR * sceneScale),
  };
}

/** A point kept inside the zone: each coordinate of the basis on its own. */
export function clampToZone(z: WalkZone, p: Vec3): Vec3 {
  const q = toBasis(z.basis, p);
  const c = q.map((v, i) => Math.min(z.max[i]!, Math.max(z.min[i]!, v))) as Vec3;
  return c.every((v, i) => v === q[i]) ? p : fromBasis(z.basis, c);
}

/** The direction a look faces, a unit vector in the world. */
export function lookDir(k: WalkBasis, l: Look): Vec3 {
  const h = Math.cos(l.pitch);
  return add(add(scale(k.a, h * Math.cos(l.yaw)), scale(k.b, h * Math.sin(l.yaw))), scale(k.up, Math.sin(l.pitch)));
}

/** The look facing a direction; a direction along the vertical keeps the yaw it is given. */
export function lookOf(k: WalkBasis, dir: Vec3, yawIfVertical = 0): Look {
  const d = norm(dir);
  if (!d) return { yaw: yawIfVertical, pitch: 0 };
  const q = toBasis(k, d);
  const flat = Math.hypot(q[0], q[1]);
  const pitch = clampPitch(Math.atan2(q[2], flat));
  return { yaw: flat > 1e-9 ? Math.atan2(q[1], q[0]) : yawIfVertical, pitch };
}

/**
 * Where a visit starts: on a filmed camera (the first by default), facing
 * where that camera looked when the host wrote it (`rig.looks`). Without it
 * (an older object), facing what was filmed (the median of the points, the
 * orbit's centre too): right around an object, wrong inside a place, where
 * the middle of everything filmed is often behind a wall (86° off in the
 * median on a walk through a flat). When the camera sits on that centre, it
 * faces the way it went next.
 */
export function startPose(rig: Rig, k: WalkBasis, at = 0): { position: Vec3; look: Look } {
  const i = rig.cams[at] ? at : 0;
  const position = rig.cams[i]!;
  const looked = rig.looks?.[i];
  if (looked && Math.hypot(...looked) > 1e-9) return { position, look: lookOf(k, looked) };
  let dir = sub(rig.target, position);
  if (Math.hypot(...dir) < 1e-6) {
    const next = rig.cams.find((c) => Math.hypot(...sub(c, position)) > 1e-6);
    dir = next ? sub(next, position) : k.a;
  }
  return { position, look: lookOf(k, dir) };
}

/** Two filmed views count as the same place seen the same way within this share of the scene's size… */
const NEAR_SHARE = 0.2;
/** …and this angle between where they looked. */
const SAME_LOOK_RAD = (30 * Math.PI) / 180;

/**
 * The filmed view a visit starts from: the one seen the most, i.e. with the
 * most other cameras near it looking the same way. The first image of a video
 * is the worst start: nothing was filmed before it, and on a walk through a
 * flat it rendered as a blur where the middle of the walk was sharp. Without
 * looks (an older object) the first view, as before. Ties go to the earliest.
 */
export function bestStart(rig: Rig, scale: number): number {
  const looks = rig.looks;
  if (!looks || looks.length !== rig.cams.length) return 0;
  const near = NEAR_SHARE * scale;
  const cosMax = Math.cos(SAME_LOOK_RAD);
  const unit = looks.map((l) => scale3(l, 1 / (Math.hypot(...l) || 1)));
  let best = 0;
  let bestCount = -1;
  rig.cams.forEach((c, i) => {
    let count = 0;
    rig.cams.forEach((d, j) => {
      if (j !== i && Math.hypot(...sub(d, c)) <= near && dot(unit[i]!, unit[j]!) >= cosMax) count++;
    });
    if (count > bestCount) { best = i; bestCount = count; }
  });
  return best;
}

/**
 * A move eased toward the one asked over `dt` seconds: it starts and stops
 * in about a tenth of a second instead of jumping, and a long frame (a tab
 * that came back) lands on the move asked, never past it.
 */
export function easeStep(now: Vec3, asked: Vec3, dt: number): Vec3 {
  const t = Math.min(1, Math.max(0, dt * EASE_PER_S));
  return [now[0] + (asked[0] - now[0]) * t, now[1] + (asked[1] - now[1]) * t, now[2] + (asked[2] - now[2]) * t];
}

/**
 * A drag turns the view as if the scene were held and pulled (a photo
 * sphere's gesture): dragging right brings what is on the left into view,
 * dragging down raises the view.
 */
export function turnBy(l: Look, dxPx: number, dyPx: number): Look {
  return { yaw: wrap(l.yaw + dxPx * TURN_PER_PX), pitch: clampPitch(l.pitch + dyPx * TURN_PER_PX) };
}

/**
 * The step for what is held, over `dt` seconds. Forward and sideways go
 * along the floor whatever the look's pitch (walking, not flying); rising
 * goes along the vertical.
 */
export function stepOf(z: WalkZone, l: Look, held: Held, dt: number, run = false): Vec3 {
  const k = z.basis;
  const f: Vec3 = add(scale(k.a, Math.cos(l.yaw)), scale(k.b, Math.sin(l.yaw)));
  const right = cross(f, k.up);
  const v = add(add(scale(f, held.forward), scale(right, held.side)), scale(k.up, held.rise));
  const len = Math.hypot(...v);
  if (len === 0) return [0, 0, 0];
  return scale(v, (z.speed * dt * (run ? RUN_FACTOR : 1)) / len);
}

/** A wheel notch or a pinch: toward what the view faces, pitch included, a fixed share of a second of walking. */
export function pushOf(z: WalkZone, l: Look, amount: number): Vec3 {
  return scale(lookDir(z.basis, l), z.speed * amount);
}

function clampPitch(p: number): number {
  return Math.min(MAX_PITCH, Math.max(-MAX_PITCH, p));
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function dot(x: Vec3, y: Vec3): number { return x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; }
function add(x: Vec3, y: Vec3): Vec3 { return [x[0] + y[0], x[1] + y[1], x[2] + y[2]]; }
function sub(x: Vec3, y: Vec3): Vec3 { return [x[0] - y[0], x[1] - y[1], x[2] - y[2]]; }
function scale(x: Vec3, s: number): Vec3 { return [x[0] * s, x[1] * s, x[2] * s]; }
const scale3 = scale;
function cross(x: Vec3, y: Vec3): Vec3 { return [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; }
function norm(x: Vec3): Vec3 | null {
  const l = Math.hypot(...x);
  return l > 0 ? scale(x, 1 / l) : null;
}
