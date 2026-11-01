/**
 * createModel — making an object, as values (Fast Refresh: the screens live
 * in CreateTab.tsx and JobStage.tsx). The job runs in the host (doc 163); this
 * only arranges what the host measured: every detail on the rail is a count
 * the host sent, never a guess.
 *
 * @module features/create/createModel
 */
import { isRunning, mattePct, trainPct, type JobView, type Scope } from '../../core/model';
import { num, rail, type StageStep } from '../../core/stageModel';
import type { EngineStatus } from '../../host/doors';
import type { RailStep, StepState } from '../../ui/stepRailModel';
import type { Gallery } from '../objects/libraryModel';

/** How often the job is asked while it runs: its steps last seconds to minutes. */
export const POLL_MS = 1_500;

export type EngineVerdict = 'unsupported' | 'notInstalled' | 'noFrames' | 'ready';

/** Whether a new object can be made here, and if not, the one thing missing. */
export function engineVerdict(e: EngineStatus): EngineVerdict {
  if (!e.supported) return 'unsupported';
  if (!e.installed) return 'notInstalled';
  // Frames come from ffmpeg, or from Chromium where ffmpeg cannot be installed (a Mac).
  if (!e.ffmpegInstalled && e.framesReader !== 'chromium') return 'noFrames';
  return 'ready';
}

/**
 * How many images a job keeps from the video (or the folder), chosen by the
 * person (doc 166 §14). More images: more views of each corner, and a longer
 * job (COLMAP compares every pair; at the same training steps each image is
 * seen fewer times). 100 is the default for everything: measured on a walk
 * through a flat, 300 at the quick quality rendered blurrier, not sharper.
 */
export type FrameChoice = number;
export const DEFAULT_FRAMES = 100;
export const FRAME_PRESETS = [100, 200, 400] as const;
/** Below 20 COLMAP has too little to place (the job refuses it), above 400 the folder of photos already stops. */
export const MIN_FRAME_CHOICE = 20;
export const MAX_FRAME_CHOICE = 400;

/** A stored or typed choice: a whole number brought within the bounds; anything else is the default. */
export function readFrameChoice(raw: unknown): FrameChoice {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_FRAMES;
  return Math.min(MAX_FRAME_CHOICE, Math.max(MIN_FRAME_CHOICE, Math.round(n)));
}

/**
 * The scope a job starts with: the object alone needs the cut-out engine, and
 * without it the whole scene is made; a scene and a place need only the 3D engine.
 */
export function madeScope(asked: Scope, objectReady: boolean): Scope {
  return asked === 'object' && !objectReady ? 'scene' : asked;
}

/** What the objects' Create offers: the whole scene (first, the default) or the object alone. */
export const OBJECT_SCOPES = ['scene', 'object'] as const;

/**
 * The scope a job starts with, by the gallery it is made from (doc 166 §14.2):
 * the places make a place, whatever was asked; the objects make what was asked
 * among their two (madeScope), and never a place.
 */
export function galleryScope(gallery: Gallery, asked: Scope, objectReady: boolean): Scope {
  if (gallery === 'places') return 'place';
  return madeScope(asked === 'place' ? 'scene' : asked, objectReady);
}

/**
 * The words of the steps for what is made: a place measures the path the
 * person walked, not a turn around a subject (the arc around the middle of a
 * room means nothing), and it ends as a place, never « a 3D object »
 * (doc 166 §14.2). Only what the HOST said counts: a host that made a scene
 * of a place asked says « scene », and so does the rail.
 */
export function stepLabels(scope: Scope | null | undefined, steps: Record<StageStep, string>, placeSteps: Partial<Record<StageStep, string>>): Record<StageStep, string> {
  return scope === 'place' ? { ...steps, ...placeSteps } : steps;
}

/** A job the stage shows: running, waiting for a decision, or ended but not put away. */
export function isLive(job: JobView | null): boolean {
  return isRunning(job) || job?.step === 'needsConfirm';
}

/**
 * The job's steps on the lit rail: each done step says what it measured, the
 * live one its count so far, the ones ahead nothing. A failed job keeps the
 * step it stopped at, in red.
 */
export function jobRail(job: JobView, labels: Record<StageStep, string>, lang: string): RailStep[] {
  return rail(job).map(({ step, state }) => {
    const s: StepState = state === 'done' ? 'done' : state === 'next' ? 'pending' : job.step === 'failed' ? 'failed' : 'active';
    return { id: step, label: labels[step], state: s, detail: s === 'pending' ? undefined : stepDetail(job, step, lang) };
  });
}

/** The measured count of one step, as the rail says it; undefined when nothing was measured. */
export function stepDetail(job: JobView, step: StageStep, lang: string): string | undefined {
  switch (step) {
    case 'frames':
      if (job.framesKept !== null) return `${num(job.framesKept, lang)} / ${num(job.framesTotal, lang)}`;
      return job.framesSeen != null ? num(job.framesSeen, lang) : undefined;
    case 'poses': {
      if (job.posesPlaced !== null) return `${num(job.posesPlaced, lang)} / ${num(job.framesKept, lang)}`;
      const c = job.colmap;
      return c && c.done !== null && c.of !== null ? `${num(c.done, lang)} / ${num(c.of, lang)}` : undefined;
    }
    case 'coverage':
      // An arc around the middle of a place is not a measure of it: nothing is said.
      return job.coverageDeg !== null && job.scope !== 'place' ? `${job.coverageDeg}°` : undefined;
    case 'matte': {
      const pct = mattePct(job);
      return pct !== null ? `${pct} %` : undefined;
    }
    case 'train': {
      const pct = trainPct(job);
      return pct !== null ? `${pct} %` : undefined;
    }
  }
}

/** The time the job has run: up to now while it runs or waits, up to its last step once it ended. */
export function elapsedMs(job: JobView, now: number): number {
  return Math.max(0, (isLive(job) ? now : job.stepStartedAt) - job.startedAt);
}

/** The file or folder name of the job's source, for its title. */
export function sourceName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * The sentence for a host error: « CODE: detail » (or « CODE (sub-step): detail »)
 * finds its sentence by code, the detail goes in its place; an unknown code
 * is shown as the host wrote it, never hidden.
 */
export function describeError(text: string, sentences: Readonly<Record<string, string>>): string {
  const [head = '', ...rest] = text.split(':');
  // A sub-step said in parentheses has its own sentence when one exists (« POSES_FAILED (features) »), else the step's.
  const sentence = sentences[head.trim()] ?? sentences[head.replace(/\s*\(.*\)$/, '').trim()];
  return sentence ? sentence.replace('{detail}', rest.join(':').trim()) : text;
}
