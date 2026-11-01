/**
 * stepRailModel — the states of the luminous step pipeline, as values (doc 166).
 *
 * A step is pending, active, done or failed; the rail draws what it is given
 * and decides nothing. `railFrom` turns « the step we are at » into those
 * states, so every screen that shows progress (loading a scene, making an
 * object) lights its steps the same way.
 *
 * @module ui/stepRailModel
 */

export type StepState = 'pending' | 'active' | 'done' | 'failed';

export interface RailStep {
  id: string;
  label: string;
  state: StepState;
  /** A short measured fact under the label (« 42 % », « 1.2 s »); absent when nothing was measured. */
  detail?: string;
}

/**
 * The states of `ids` when the work is at index `at`: everything before is
 * done, `at` is active (or failed), everything after is pending. `at` past
 * the end means all done.
 */
export function railFrom(ids: readonly string[], at: number, failed = false): StepState[] {
  return ids.map((_, i) => (i < at ? 'done' : i === at ? (failed ? 'failed' : 'active') : 'pending'));
}

/** How far the rail is, from 0 to 1: done steps plus half of an active one. Failed counts as stopped. */
export function railProgress(states: readonly StepState[]): number {
  if (states.length === 0) return 0;
  const done = states.filter((s) => s === 'done').length;
  const active = states.some((s) => s === 'active') ? 0.5 : 0;
  return (done + active) / states.length;
}
