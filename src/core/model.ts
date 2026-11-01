/**
 * The pure half of Objets 3D: reading an object's file in pieces, and what the
 * job's numbers say on screen. No React, no SDK: tested with a fake reader.
 */

/** One piece as the host answers `splat.read`. */
export interface Piece { base64: string; offset: number; length: number; total: number }

/** A whole file read, or why it stopped. */
export type Read = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

/** At most this many pieces for one file: 80 MB at 8 MB a piece is 10. */
const MAX_PIECES = 64;

function decode(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Reads a whole file through `read(offset)`, piece after piece, until the
 * pieces reach the size the host said. A piece that does not advance stops
 * the read with an error, never a loop. `onProgress` gets 0..1, measured.
 */
export async function readWhole(read: (offset: number) => Promise<Piece>, onProgress?: (fraction: number) => void): Promise<Read> {
  const parts: Uint8Array[] = [];
  let offset = 0;
  let total = -1;
  for (let i = 0; i < MAX_PIECES; i++) {
    let piece: Piece;
    try {
      piece = await read(offset);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    total = piece.total;
    if (piece.length === 0 && offset < total) return { ok: false, error: 'STALLED' };
    parts.push(decode(piece.base64));
    offset += piece.length;
    onProgress?.(total > 0 ? Math.min(1, offset / total) : 1);
    if (offset >= total) {
      const bytes = new Uint8Array(offset);
      let at = 0;
      for (const p of parts) { bytes.set(p, at); at += p.length; }
      return { ok: true, bytes };
    }
  }
  return { ok: false, error: 'TOO_MANY_PIECES' };
}

/** The job's view, as the host sends it (main/splat/splatJob.ts). */
export interface JobView {
  id: string; video: string; quality: 'preview' | 'full';
  /** Absent from a host older than lot 4: read as the whole scene. */
  scope?: Scope;
  step: 'frames' | 'poses' | 'coverage' | 'matte' | 'train' | 'done' | 'needsConfirm' | 'failed' | 'cancelled';
  startedAt: number; stepStartedAt: number;
  framesTotal: number | null; framesKept: number | null; posesPlaced: number | null; coverageDeg: number | null;
  framesMatted?: number | null; matteTotal?: number | null;
  placer?: 'global' | 'incremental' | null; blurRead?: boolean | null;
  /** The object this job was redone from; absent from a host older than the redo. */
  redoOf?: string | null;
  trainStep: number | null; trainSteps: number; cuda: boolean; outDir: string; error: string | null;
  /** When main last measured `trainStep`; absent from a host older than this field. */
  trainStepAt?: number | null;
  /** Where the frames come from; absent from a host older than photos: a video. */
  source?: 'video' | 'photos';
  /** Frames written so far while the video is read, counted on disk; null before the first count. */
  framesSeen?: number | null;
  /** What COLMAP printed while it places the frames; absent from an older host, null outside that step. */
  colmap?: ColmapProgress | null;
  /** The training step of the live preview (`work/exports/live.spz`); null before the first one. */
  liveStep?: number | null;
  /** Brush stopped early and its object at that step was kept (doc 176 §18). Absent from an older host. */
  trainStopped?: { step: number; reason: 'GPU_LOST' | 'TRAIN_FAILED' | 'KEPT'; detail: string } | null;
  /** Brush writes a file every this many steps, its first sign of progress. Absent from an older host. */
  trainExportEvery?: number;
  /** A job from photos stopped at placing: the person's photos COLMAP left out. Absent from an older host. */
  unplacedPhotos?: string[] | null;
}

/**
 * COLMAP's own log while it places the frames (main/splat/splatModel.ts
 * parseColmapLine): « Processed file [i/n] » with the points found in each
 * frame, then « Processing block [i/N, j/M] ». The mapping prints nothing
 * that counts: its `done` and `of` stay null and only the clock moves.
 */
export interface ColmapProgress {
  phase: 'features' | 'matching' | 'mapping';
  done: number | null;
  of: number | null;
  /** Points COLMAP found in each frame, by file name, as it printed them. */
  points?: Record<string, number>;
}

/**
 * What was made (doc 163 lot 4, doc 166 §14): the object alone (cut out of
 * each frame), the whole filmed scene, or a place to walk through (an inside,
 * an outside, a landscape: the whole scene too, opened from inside).
 */
export type Scope = 'object' | 'scene' | 'place';

/** The scopes a host or a manifest may say; anything else is unsaid. */
export const SCOPES: readonly Scope[] = ['object', 'scene', 'place'];

/** A scope as it was said; null for anything else (an older object, a typo). */
export function readScope(raw: unknown): Scope | null {
  return (SCOPES as readonly unknown[]).includes(raw) ? (raw as Scope) : null;
}

/** The word of a scope in any section of the words (each has the three). */
export function scopeWord(scope: Scope | null | undefined): 'scopeObject' | 'scopeScene' | 'scopePlace' | null {
  return scope === 'object' ? 'scopeObject' : scope === 'scene' ? 'scopeScene' : scope === 'place' ? 'scopePlace' : null;
}

/** One finished object (main/splat/splatLibrary.ts). */
export interface ObjectEntry {
  id: string; createdAt: string | null; quality: 'preview' | 'full' | null;
  /** null: made before the choice existed, so nobody wrote it. */
  scope?: Scope | null;
  framesKept: number | null; posesPlaced: number | null; coverageDeg: number | null;
  /** What the viewer loads; `scene.ply` for an object made before the `.spz` (absent from an older host = `.ply`). */
  sceneFile?: SceneFile; sceneBytes: number; sourceBytes?: number | null; spzError?: string | null; thumb: string | null;
  /** What takes the space, per category; absent from a host older than this field. */
  weights?: Partial<Record<Category, { files: number; bytes: number }>>;
  /** When the video was filmed (lot 5); absent from an older host, null when unknown. */
  filmedAt?: string | null;
  /** The reference objects this one was aligned to (lot 5). */
  alignedTo?: string[];
  /** What each « free the space » button gives back now; absent = nothing of it left. Absent from an older host. */
  freeable?: Partial<Record<Freeable, { files: number; bytes: number }>>;
  /** When each freed category went to the recycle bin. */
  freed?: Partial<Record<Freeable, string>>;
  /** The object this one was redone from; absent from a host older than versions, null for a first version. */
  redoOf?: string | null;
  /** The first object of its chain of redos, shared by every version of one object; absent from an older host. */
  versionOf?: string;
  /** The version its object shows: declared by the person, else the newest. Absent from an older host. */
  main?: boolean;
}

/** One object and its versions (`Redo` makes a new version, doc 163). */
export interface VersionGroup { key: string; main: ObjectEntry; versions: ObjectEntry[] }

/**
 * The library's objects, one per group of versions, in the order of their
 * newest version (an object just redone comes first), each group's versions
 * newest first. Ids start with the date, so their order is the age, whatever
 * order the host sent. The main is the one the host marked, else the newest.
 * A host older than versions says nothing: each object is then its own group,
 * as before.
 */
export function groupVersions(objects: ObjectEntry[]): VersionGroup[] {
  const groups = new Map<string, ObjectEntry[]>();
  for (const o of [...objects].sort((a, b) => b.id.localeCompare(a.id))) {
    const key = o.versionOf ?? o.id;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }
  return [...groups].map(([key, versions]) => ({ key, versions, main: versions.find((v) => v.main) ?? versions[0]! }));
}

export type SceneFile = 'scene.spz' | 'scene.ply';

/**
 * The files to try for an object's scene, in order, from its manifest's
 * `files.scene`: an object made since the `.spz` names it, an older one names
 * `scene.ply` or nothing. The other file comes second, so a scene the manifest
 * names but that is gone from the disk still opens from what is there.
 */
export function sceneFiles(manifest: unknown): SceneFile[] {
  const named = (manifest as { files?: { scene?: unknown } } | null)?.files?.scene;
  return named === 'scene.spz' ? ['scene.spz', 'scene.ply'] : ['scene.ply', 'scene.spz'];
}

/** The categories of an object's folder, in the order the card lists them (main/splat/splatLibrary.ts). */
export const CATEGORIES = ['video', 'framesAll', 'frames', 'framesMasked', 'scene', 'sceneCompact', 'cameras', 'work'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * The card's breakdown: the categories measured, heaviest first, and their
 * total. Null when nothing was measured: no total is made up from nothing.
 */
export function weightRows(weights: ObjectEntry['weights']): { rows: Array<{ key: Category; files: number; bytes: number }>; total: number } | null {
  if (!weights) return null;
  const rows = CATEGORIES.flatMap((key) => {
    const w = weights[key];
    return w && Number.isFinite(w.bytes) && Number.isFinite(w.files) ? [{ key, files: w.files, bytes: w.bytes }] : [];
  });
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.bytes - a.bytes);
  return { rows, total: rows.reduce((s, r) => s + r.bytes, 0) };
}

/** The categories the person can send to the bin (main/splat/splatLibrary.ts FREEABLE). */
export const FREEABLE = ['framesAll', 'framesMasked', 'video', 'work'] as const;
export type Freeable = (typeof FREEABLE)[number];

export function isFreeable(c: Category): c is Freeable {
  return (FREEABLE as readonly string[]).includes(c);
}

/**
 * The freed categories that left no row (« sent to the bin on … »): a category
 * that is gone reads as freed, never as an object that never had it. `work`
 * keeps its row (the placement stays), its date is said on that row.
 */
export function freedGone(o: Pick<ObjectEntry, 'freed' | 'weights'>): Array<{ key: Freeable; at: string }> {
  return FREEABLE.flatMap((key) => {
    const at = o.freed?.[key];
    return at && !o.weights?.[key] ? [{ key, at }] : [];
  });
}

export const RUNNING_STEPS = ['frames', 'poses', 'coverage', 'matte', 'train'] as const;

export function isRunning(job: JobView | null): boolean {
  return !!job && (RUNNING_STEPS as readonly string[]).includes(job.step);
}

/** The steps this job runs, in order: the matte only for the object alone. */
export function stepsOf(job: JobView): Array<(typeof RUNNING_STEPS)[number]> {
  return RUNNING_STEPS.filter((s) => s !== 'matte' || job.scope === 'object');
}

/** Frames cut out over frames to cut; null before the first count (no bar on an unmeasured number). */
export function mattePct(job: JobView): number | null {
  if (job.framesMatted == null || !job.matteTotal) return null;
  return Math.min(100, Math.round((job.framesMatted / job.matteTotal) * 100));
}

/** Brush's last written step over the steps asked; null before it wrote one (no bar on an unmeasured number). */
export function trainPct(job: JobView): number | null {
  if (job.trainStep === null || job.trainSteps <= 0) return null;
  return Math.min(100, Math.round((job.trainStep / job.trainSteps) * 100));
}

/**
 * How long ago Brush's last file was seen, and the time left at the pace
 * MEASURED since the step began (doc 163 §7). Brush writes a file every few
 * thousand steps, minutes apart on a full build: between two files the bar
 * does not move, and « last measured N ago » is what tells it from a stall.
 * No left time before the first file (no pace measured yet), nor once the
 * pace says it should be done (an estimate past zero is not a time).
 */
export function trainTiming(
  v: { trainStep: number | null; trainStepAt?: number | null; trainSteps: number; stepStartedAt: number },
  now: number,
): { sinceMs: number; leftMs: number | null } | null {
  if (v.trainStepAt == null || v.trainStep === null) return null;
  const sinceMs = Math.max(0, now - v.trainStepAt);
  const spent = v.trainStepAt - v.stepStartedAt;
  if (v.trainStep <= 0 || spent <= 0) return { sinceMs, leftMs: null };
  const left = ((v.trainSteps - v.trainStep) * spent) / v.trainStep - sinceMs;
  return { sinceMs, leftMs: left > 0 ? left : null };
}

/** « 4:07 », « 1:02:30 ». */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** « 9.2 MB ». */
export function size(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  // A measured zero stays zero: « 1 KB » would be a size nobody measured.
  return bytes === 0 ? '0 KB' : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The date a folder id starts with (`20261021-103903-…`), for a card; null when it does not. */
export function idDate(id: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id);
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : null;
}

/** The object an `open:<id>` intent names (the chat's « open in Objets 3D », doc 163 §10); null for anything else. */
export function openIntentId(intent: unknown): string | null {
  if (typeof intent !== 'string' || !intent.startsWith('open:')) return null;
  const id = intent.slice(5);
  return /^[\p{L}\p{N}_-]{1,80}$/u.test(id) ? id : null;
}

/** The name a person gave the video, from the id (`20261021-103903-Bottines-salon` → `Bottines salon`). */
export function idName(id: string): string {
  return id.replace(/^\d{8}-\d{6}-?/, '').replace(/-/g, ' ').trim() || id;
}
