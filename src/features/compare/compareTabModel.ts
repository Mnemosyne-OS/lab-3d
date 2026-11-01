/**
 * compareTabModel — the Compare tab's arrangement, as values (Fast Refresh:
 * the screens live in CompareTab.tsx and CompareView.tsx).
 *
 * The list stays flat: two dates are two shoots, not two settings of one
 * shoot, so every finished object is offered, both scopes, every version.
 *
 * @module features/compare/compareTabModel
 */
import type { ObjectEntry } from '../../core/model';
import type { Alignment } from '../../core/compareModel';
import type { RailStep, StepState } from '../../ui/stepRailModel';

export const COMPARE_STEPS = ['dates', 'align', 'view'] as const;
export type CompareStep = (typeof COMPARE_STEPS)[number];

/** Where the tab stands, as the rail reads it. */
export interface CompareGuide {
  /** Two dates are picked. */
  pair: boolean;
  /** none: never aligned; running; reading: the file is being read; the verdict; failed: the job stopped, or the file is unreadable. */
  align: 'none' | 'running' | 'reading' | Alignment['verdict'] | 'stopped';
  /** The two scenes on stage: idle (nothing to show), loading, ready, failed. */
  view: 'idle' | 'loading' | 'ready' | 'failed';
}

/**
 * The guide's rail: two dates, then their alignment, then the comparison. A
 * « not aligned » verdict is a failed step, and the comparison stays dark
 * behind it: two objects that are not in one frame are never overlaid.
 */
export function compareRail(s: CompareGuide, labels: Record<CompareStep, string>, details: Partial<Record<CompareStep, string>>): RailStep[] {
  const dates: StepState = s.pair ? 'done' : 'active';
  const align: StepState = !s.pair ? 'pending'
    : s.align === 'aligned' || s.align === 'weak' ? 'done'
      : s.align === 'failed' || s.align === 'stopped' ? 'failed' : 'active';
  const view: StepState = align !== 'done' ? 'pending' : s.view === 'ready' ? 'done' : s.view === 'failed' ? 'failed' : 'active';
  const states: Record<CompareStep, StepState> = { dates, align, view };
  return COMPARE_STEPS.map((id) => ({ id, label: labels[id], state: states[id], detail: states[id] === 'pending' ? undefined : details[id] }));
}

/** Where the picked pair is remembered. */
export const PAIR_KEY = 'lab3d.comparePair';

/** The remembered picks: at most two different ids, anything else is no pick. */
export function readPair(raw: string | null): string[] {
  let ids: unknown;
  try { ids = raw ? JSON.parse(raw) : []; } catch (err) { console.warn('[lab-3d] remembered pair unreadable:', err); return []; }
  if (!Array.isArray(ids)) return [];
  const strings = ids.filter((id): id is string => typeof id === 'string');
  return [...new Set(strings)].slice(-2);
}

/** The picks whose object is still listed: one gone leaves the other picked, never a date with nothing behind it. */
export function presentPicks(picked: readonly string[], objects: readonly Pick<ObjectEntry, 'id'>[]): string[] {
  return picked.filter((id) => objects.some((o) => o.id === id));
}

/** A press on an object: picked again unpicks it, a third pick lets the oldest go. */
export function togglePick(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
}
