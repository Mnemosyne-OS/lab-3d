/**
 * The pure half of « compare two dates » (doc 163 §6, lot 5): which object is
 * the reference, where the dates sit on the frise, what the host's alignment
 * says, and the difference map. No React, no WebGL: tested with plain arrays.
 */
import type { ObjectEntry } from './model';

type Vec3 = [number, number, number];

/** One filmed viewpoint of the reference (main/splat/splatAlignModel.ts RefView). */
export interface RefView {
  name: string; position: Vec3; quaternion: [number, number, number, number];
  fovY: number; aspect: number; nearestMovedDeg: number | null; comparable: boolean;
}

/** `align-<refId>.json`, as main writes it. */
export interface Alignment {
  refId: string; movedId: string; measuredAt: string;
  placed: number; total: number; reprojectionPx: number | null; sharedPoints: number; refPoints: number; residualPct: number | null;
  /** Placed frames matched directly to the reference; the others rest on them. Absent from files written before the host counted it. */
  linked?: number | null;
  sim3: { scale: number; rotation: [number, number, number, number]; translation: Vec3 } | null;
  verdict: 'aligned' | 'weak' | 'failed';
  reasons: string[];
  views: RefView[];
  seconds: Record<string, number>;
}

/** The alignment job, as main sends it (main/splat/splatAlign.ts). */
export interface AlignJob {
  refId: string; movedId: string;
  step: 'features' | 'matching' | 'placing' | 'measuring' | 'done' | 'failed' | 'cancelled';
  startedAt: number; stepStartedAt: number; error: string | null;
}

export const ALIGN_RUNNING = ['features', 'matching', 'placing', 'measuring'] as const;

/** The date an object is placed on the frise by: when it was filmed; null = unknown. */
export function dateOf(o: Pick<ObjectEntry, 'filmedAt'>): number | null {
  const t = o.filmedAt ? Date.parse(o.filmedAt) : Number.NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * The reference is the earlier date, the other is carried into its frame.
 * Two unknown dates, or one: the order the person picked them, said as
 * « date unknown » on screen, never guessed.
 */
export function orderPair(a: ObjectEntry, b: ObjectEntry): { ref: ObjectEntry; moved: ObjectEntry } {
  const da = dateOf(a), db = dateOf(b);
  if (da !== null && db !== null && db < da) return { ref: b, moved: a };
  return { ref: a, moved: b };
}

/** An alignment already made for this pair: the moved object carries it. */
export function hasAlignment(ref: ObjectEntry, moved: ObjectEntry): boolean {
  return (moved.alignedTo ?? []).includes(ref.id);
}

/** The local calendar day of a date, `YYYY-MM-DD`: the day the screen prints, so a dot and its label agree. */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One dot on the frise: every object filmed that local day, oldest first. */
export interface FriseGroup {
  day: string;
  /** 0..1 on the line, oldest day at 0; one day alone sits in the middle. */
  position: number;
  /** The label row, 0 first: a label never sits on its neighbour's. */
  lane: number;
  members: ObjectEntry[];
}

/** Label rows the frise grows to, at most; past them a label shares the least crowded row. */
export const FRISE_MAX_LANES = 3;

/**
 * The frise, one dot per filmed DAY (doc 163 §6). Five objects of the same
 * day used to be five dots on one point with five labels printed over each
 * other: a day is one dot, and its objects are picked under it. Labels closer
 * than `gap` (a share of the line) go to the next row. Undated objects are
 * left out: the screen lists them apart.
 */
export function friseGroups(objects: readonly ObjectEntry[], gap: number): FriseGroup[] {
  const byDay = new Map<string, { t: number; members: ObjectEntry[] }>();
  for (const o of objects) {
    const t = dateOf(o);
    if (t === null) continue;
    const key = dayKey(t);
    const g = byDay.get(key);
    if (g) { g.members.push(o); g.t = Math.min(g.t, t); } else byDay.set(key, { t, members: [o] });
  }
  const days = [...byDay.entries()].sort((a, b) => a[1].t - b[1].t);
  const min = days.length ? days[0]![1].t : 0;
  const max = days.length ? days[days.length - 1]![1].t : 0;
  const lastAt: number[] = [];
  return days.map(([day, g]) => {
    const position = max > min ? (g.t - min) / (max - min) : 0.5;
    let lane = lastAt.findIndex((p) => position - p >= gap);
    if (lane < 0) lane = lastAt.length < FRISE_MAX_LANES ? lastAt.length : lastAt.indexOf(Math.min(...lastAt));
    lastAt[lane] = position;
    const members = [...g.members].sort((a, b) => (dateOf(a)! - dateOf(b)!) || String(a.createdAt).localeCompare(String(b.createdAt)));
    return { day, position, lane, members };
  });
}

/** Whole days between two dates, for « 12 days apart »; null when one is unknown. */
export function daysApart(a: ObjectEntry, b: ObjectEntry): number | null {
  const da = dateOf(a), db = dateOf(b);
  return da === null || db === null ? null : Math.round(Math.abs(db - da) / 86_400_000);
}

/**
 * Where the later date's scene goes in the reference's frame: the measured
 * similarity, as three.js takes it. The file writes the rotation w first
 * (COLMAP's order); three.js wants x, y, z, w.
 */
export interface Sim3Pose { quaternion: [number, number, number, number]; scale: number; position: Vec3 }

export function sim3Pose(s: NonNullable<Alignment['sim3']>): Sim3Pose {
  const [w, x, y, z] = s.rotation;
  return { quaternion: [x, y, z, w], scale: s.scale, position: s.translation };
}

/** Overlaying is allowed only on an alignment that passed (« weak » is shown, with its warning). */
export function canOverlay(a: Alignment | null): boolean {
  return !!a && a.verdict !== 'failed' && !!a.sim3;
}

/**
 * The difference map's thresholds. 🎭 CHOSEN, not measured (doc 163 §6):
 * no real change has been filmed yet.
 */
export const DIFF_RULES = {
  /** A pixel is covered by a date when its render is at least this opaque. */
  minAlpha: 0.9,
  /** Colour distance (0..1, RGB after the brightness match) above which a pixel « changed ». */
  changed: 0.15,
} as const;

export interface DiffResult {
  /** RGBA, top row first, to paint over the view. */
  image: Uint8ClampedArray;
  width: number; height: number;
  /** Pixels both renders cover; only they are compared. */
  covered: number;
  /** Covered pixels whose colour moved past DIFF_RULES.changed. */
  changed: number;
  total: number;
  /** The per-channel gain applied to the later date so a change of light is not read as a change of the thing. */
  gain: [number, number, number];
}

/**
 * The difference map between two renders of the same viewpoint (RGBA, rows
 * bottom-up as WebGL reads them). What is measured, and nothing else:
 * - coverage: a pixel is compared only where BOTH renders are opaque; any
 *   other pixel is « not filmed by both », painted as hatching — never as
 *   « unchanged »;
 * - colour: the RGB distance after matching the later date's overall
 *   brightness per channel (a cloudy day is not a change of the thing).
 * Changed pixels are red, brighter as the distance grows; unchanged covered
 * pixels are left clear, so the scene shows through.
 */
export function colourDiff(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray, width: number, height: number): DiffResult {
  const total = width * height;
  const minA = Math.round(DIFF_RULES.minAlpha * 255);
  const sumA = [0, 0, 0], sumB = [0, 0, 0];
  let covered = 0;
  for (let i = 0; i < total; i++) {
    const k = i * 4;
    if (a[k + 3]! < minA || b[k + 3]! < minA) continue;
    covered++;
    for (let c = 0; c < 3; c++) { sumA[c] += a[k + c]!; sumB[c] += b[k + c]!; }
  }
  // No common pixel: no gain is measured, none is applied.
  const gain = [0, 1, 2].map((c) => (covered && sumB[c]! > 0 ? sumA[c]! / sumB[c]! : 1)) as [number, number, number];
  const image = new Uint8ClampedArray(total * 4);
  let changed = 0;
  const limit = DIFF_RULES.changed;
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const k = (srcRow * width + x) * 4;
      const o = (y * width + x) * 4;
      if (a[k + 3]! < minA || b[k + 3]! < minA) {
        // Not filmed by both: hatched grey, never « no change ».
        const stripe = (x + y) % 10 < 3;
        image[o] = image[o + 1] = image[o + 2] = 150;
        image[o + 3] = stripe ? 170 : 60;
        continue;
      }
      let d2 = 0;
      for (let c = 0; c < 3; c++) {
        const diff = (a[k + c]! - Math.min(255, b[k + c]! * gain[c]!)) / 255;
        d2 += diff * diff;
      }
      const d = Math.sqrt(d2 / 3);
      if (d > limit) {
        changed++;
        image[o] = 255; image[o + 1] = 40; image[o + 2] = 40;
        image[o + 3] = Math.round(120 + 135 * Math.min(1, (d - limit) / (1 - limit)));
      }
    }
  }
  return { image, width, height, covered, changed, total, gain };
}

/** « 37 % » of a share, or « — » when nothing was there to count. */
export function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((100 * n) / of)} %` : '—';
}
