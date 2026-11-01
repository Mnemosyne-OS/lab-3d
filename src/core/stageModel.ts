/**
 * The pure half of the processing stage (doc 163, the « wow » redesign): what
 * each step shows is a file that arrived or a number the host measured, and
 * these functions only arrange them. No React, tested with plain values.
 */
import type { ColmapProgress, JobView } from './model';
import { stepsOf } from './model';

export type StageStep = ReturnType<typeof stepsOf>[number];

/** One step of the rail at the top of the stage. */
export interface RailStep { step: StageStep; state: 'done' | 'current' | 'next' }

/**
 * The steps this job runs, each done, current or next. A paused job (short
 * turn) sits on the turn; a finished one has every step done; a failed one
 * keeps the step it failed at as current (the stage says the error there).
 */
export function rail(job: JobView): RailStep[] {
  const steps = stepsOf(job);
  if (job.step === 'done') return steps.map((step) => ({ step, state: 'done' }));
  const at = job.step === 'needsConfirm' ? 'coverage' : job.step;
  let i = steps.indexOf(at as StageStep);
  // A failure says nothing of its step: the last step that measured something is where it stopped.
  if (i < 0) i = job.trainStep !== null ? steps.indexOf('train') : job.coverageDeg !== null ? steps.indexOf('coverage') : job.posesPlaced !== null ? steps.indexOf('poses') : 0;
  return steps.map((step, k) => ({ step, state: k < i ? 'done' : k === i ? 'current' : 'next' }));
}

/** The number in a frame's file name (`f00137.jpg` → 137); null for any other name. */
export function frameNo(name: string): number | null {
  const m = /^f(\d{5})\.(jpg|png)$/.exec(name);
  return m ? Number(m[1]) : null;
}

/** COLMAP's count as a share, 0..1; null when it printed none (the mapping). */
export function colmapFraction(c: ColmapProgress | null | undefined): number | null {
  if (!c || c.done === null || c.of === null || c.of <= 0) return null;
  return Math.min(1, Math.max(0, c.done / c.of));
}

/**
 * The newest frames to show in the film strip while the video is read. The
 * very last file may still be being written by ffmpeg: it is left out while
 * the reading goes on, kept once the count is final.
 */
export function newestFrames(names: readonly string[], n: number, stillWriting: boolean): string[] {
  const done = stillWriting ? names.slice(0, -1) : names;
  return done.slice(Math.max(0, done.length - n));
}

/**
 * Where the kept frames sit on the video's timeline, 0..1, from their file
 * numbers over the frames read. Unnumbered names are left out, never placed at 0.
 */
export function keptMarks(total: number | null, kept: readonly string[]): number[] {
  if (!total || total <= 0) return [];
  return kept.map(frameNo).filter((n): n is number => n !== null).map((n) => Math.min(1, Math.max(0, (n - 1) / Math.max(1, total - 1))));
}

type Vec3 = [number, number, number];
export interface Rig {
  target: Vec3; up: Vec3; cams: Vec3[];
  /**
   * Where each camera looked (unit vectors, in the order of `cams`), from a
   * host that writes them (doc 166 §14); absent from older objects. Facing the
   * middle of what was filmed is right around an object and wrong inside a
   * place: measured on a walk through a flat, 86° off in the median.
   */
  looks?: Vec3[];
}

/** One camera seen from above, on a unit disc around the subject. */
export interface RadarDot { x: number; y: number; deg: number }

/**
 * The cameras COLMAP placed (cameras.json), seen from above: each centre
 * projected on the plane across the scene's real vertical, around the
 * subject, scaled so the farthest sits on the rim. The angles are drawn, the
 * coverage NUMBER stays main's (it measures on its own plane).
 */
export function radar(rig: Rig | null): { dots: RadarDot[]; gap: { from: number; to: number } | null } {
  if (!rig || rig.cams.length === 0) return { dots: [], gap: null };
  const up = norm(rig.up);
  if (!up) return { dots: [], gap: null };
  // Two axes across the vertical: any vector not parallel to it, made perpendicular.
  const seed: Vec3 = Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = norm(sub(seed, scale(up, dot(seed, up))))!;
  const b = cross(up, a);
  const flat = rig.cams.map((c) => {
    const o = sub(c, rig.target);
    return [dot(o, a), dot(o, b)] as [number, number];
  });
  const far = Math.max(...flat.map(([x, y]) => Math.hypot(x, y))) || 1;
  const dots = flat.map(([x, y]) => ({ x: x / far, y: y / far, deg: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 }));
  return { dots, gap: largestGap(dots.map((d) => d.deg)) };
}

/**
 * The widest angle no camera filmed, from → to in increasing degrees (`to`
 * passes 360 when the gap wraps around 0); null under 3 cameras.
 */
export function largestGap(degs: readonly number[]): { from: number; to: number } | null {
  if (degs.length < 3) return null;
  const s = [...degs].sort((x, y) => x - y);
  let from = s[s.length - 1]!, to = s[0]! + 360;
  for (let i = 1; i < s.length; i++) {
    if (s[i]! - s[i - 1]! > to - from) { from = s[i - 1]!; to = s[i]!; }
  }
  return { from, to };
}

function dot(x: Vec3, y: Vec3): number { return x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; }
function sub(x: Vec3, y: Vec3): Vec3 { return [x[0] - y[0], x[1] - y[1], x[2] - y[2]]; }
function scale(x: Vec3, k: number): Vec3 { return [x[0] * k, x[1] * k, x[2] * k]; }
function cross(x: Vec3, y: Vec3): Vec3 { return [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; }
function norm(x: Vec3): Vec3 | null {
  const l = Math.hypot(...x);
  return l > 0 ? scale(x, 1 / l) : null;
}

/**
 * « 12 400 » with the language's grouping; a missing number is « — », never 0.
 * No language from the host is English, as the words are (i18n.ts): never the
 * machine's own, which would write French digits under English words.
 */
export function num(n: number | null | undefined, lang: string | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toLocaleString(lang ?? 'en');
}
