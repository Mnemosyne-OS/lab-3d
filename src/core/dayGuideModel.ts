/**
 * dayGuideModel — the guide of « Une journée »: one step at a time, one
 * button. The step is read from what exists, never stored: a place filmed, a
 * spot pinned, moments taken. Pure.
 *
 *   1. place    film the empty place (or: it is being built, or: it is ready)
 *   2. spot     walk to the stand and pin it
 *   3. moments  take a moment, again and again through the day
 *   4. end      scan the finished tattoo, play the day
 *
 * @module core/dayGuideModel
 */
import type { Day } from './dayModel';

export type GuideStep = 'place' | 'spot' | 'moments' | 'end';
export const GUIDE_STEPS: readonly GuideStep[] = ['place', 'spot', 'moments', 'end'];

/** Past this long without a moment, the guide says a new one is due. */
export const MOMENT_RHYTHM_MS = 30 * 60_000;

export interface GuideInput {
  /** The day open, if any. */
  day: Day | null;
  /** The places in the library, by id (an id starts with its date: the greatest is the newest). */
  placeIds: readonly string[];
  /** A place is being made by the host now. */
  building: boolean;
  /** The person said the day is over (« End of day »). */
  ended: boolean;
  now: number;
  /** The days kept: a day on the newest place is resumed, never doubled by an empty one. */
  days?: ReadonlyArray<Pick<Day, 'id' | 'placeId' | 'createdAt'>>;
}

/**
 * At step 1: film one, wait while it is built, resume the day already on the
 * newest place, or start the day on it.
 */
export type PlaceState = 'film' | 'building' | 'resume' | 'ready';

export interface Guide {
  step: GuideStep;
  /** At step 1: film one, wait for it, or start the day on the newest. */
  place: PlaceState;
  /** The newest place, offered to start the day with; null with none. */
  newest: string | null;
  /**
   * The latest day kept on the newest place: resumed instead of a new empty
   * day. A day on an older place (yesterday's test) is not: the newest place
   * is today's.
   */
  resumeId: string | null;
  /** When the last moment was taken; null with none. */
  lastAt: number | null;
  /** Whole minutes since the last moment; null with none. */
  sinceMin: number | null;
  /** The last moment is older than the rhythm. */
  due: boolean;
  /** The spot the next moment goes to: the last moment's, else the first pinned. */
  spotId: string | null;
}

export function guideOf({ day, placeIds, building, ended, now, days = [] }: GuideInput): Guide {
  const newest = placeIds.length ? [...placeIds].sort().at(-1)! : null;
  const onNewest = newest ? days.filter((d) => d.placeId === newest).sort((a, b) => a.createdAt - b.createdAt).at(-1) ?? null : null;
  const resumeId = onNewest?.id ?? null;
  const place: PlaceState = building ? 'building' : resumeId ? 'resume' : newest ? 'ready' : 'film';
  const base: Guide = { step: 'place', place, newest, resumeId, lastAt: null, sinceMin: null, due: false, spotId: null };
  if (!day) return base;
  const last = [...day.moments].sort((a, b) => a.at - b.at).at(-1) ?? null;
  const placedLast = [...day.moments].filter((m) => m.spotId && day.spots.some((s) => s.id === m.spotId)).sort((a, b) => a.at - b.at).at(-1);
  const lastAt = last ? last.at : null;
  const read: Guide = {
    ...base,
    lastAt,
    sinceMin: lastAt === null ? null : Math.max(0, Math.floor((now - lastAt) / 60_000)),
    due: lastAt !== null && now - lastAt >= MOMENT_RHYTHM_MS,
    spotId: placedLast?.spotId ?? day.spots[0]?.id ?? null,
  };
  if (day.spots.length === 0) return { ...read, step: 'spot' };
  return { ...read, step: ended ? 'end' : 'moments' };
}

/** « just now », « 18 min », « 1 h 05 »: minutes turn into hours past the hour. */
export type Ago = { kind: 'now' } | { kind: 'min'; n: number } | { kind: 'h'; h: number; m: string };

export function agoOf(minutes: number): Ago {
  if (minutes < 1) return { kind: 'now' };
  if (minutes < 60) return { kind: 'min', n: minutes };
  return { kind: 'h', h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') };
}

/** Each step of the bar: done, the current one, or still to come. */
export function stepStates(step: GuideStep): Array<{ step: GuideStep; state: 'done' | 'current' | 'next' }> {
  const at = GUIDE_STEPS.indexOf(step);
  return GUIDE_STEPS.map((s, i) => ({ step: s, state: i < at ? 'done' : i === at ? 'current' : 'next' }));
}
