/**
 * decorTabModel — the Décor tab's arrangement, as values (Fast Refresh: the
 * screens live in DecorTab.tsx and DecorPanel.tsx).
 *
 * A décor goes behind an object cut out of its video (« object alone »): it
 * needs the floor measured at the object's base, and a whole filmed scene has
 * its own room already. Every version of one object shares its décor and its
 * framing (the key is the first version's id, as in Objets 3D).
 *
 * @module features/decor/decorTabModel
 */
import type { ObjectEntry, VersionGroup } from '../../core/model';
import type { DecorEntry, DecorPreset } from '../../core/decorModel';
import type { RailStep, StepState } from '../../ui/stepRailModel';

/** The objects a décor can go behind: those made « object alone », one per group of versions. */
export function objectsAlone(groups: readonly VersionGroup[]): VersionGroup[] {
  return groups.filter((g) => g.main.scope === 'object');
}

/** The key an object's décor and framings are kept under: every version shares it. */
export function decorKeyOf(o: Pick<ObjectEntry, 'id' | 'versionOf'>): string {
  return o.versionOf ?? o.id;
}

/** The last part of a path, either separator. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * A décor's name: its preset in the person's language, else the place typed,
 * else `picked` (a picture chosen on disk: its file name, `gen-1792…png`,
 * says nothing; the file stays readable on hover).
 */
export function decorName(d: DecorEntry, presets: Record<DecorPreset, string>, picked: string): string {
  if (d.preset) return presets[d.preset];
  return d.place.trim() || picked;
}

export const GUIDE_STEPS = ['object', 'decor', 'scene'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

/** Where the tab stands, as the rail reads it. */
export interface GuideState {
  /** none: no object chosen; loading; ready; failed; noFloor: on stage, but no floor measured under it. */
  object: 'none' | 'loading' | 'ready' | 'failed' | 'noFloor';
  /** none: no décor chosen; loading; shown; failed. */
  decor: 'none' | 'loading' | 'shown' | 'failed';
  /** A framing was kept for this object in this décor. */
  framed: boolean;
}

/**
 * The guide's rail: the object first, then its décor, then the framing. A step
 * is lit when the thing it names is on screen, never because it was asked;
 * a step that cannot be reached stays dark.
 */
export function guideRail(s: GuideState, labels: Record<GuideStep, string>, details: Partial<Record<GuideStep, string>>): RailStep[] {
  const object: StepState = s.object === 'ready' ? 'done' : s.object === 'failed' || s.object === 'noFloor' ? 'failed' : 'active';
  const decor: StepState = object !== 'done' ? 'pending' : s.decor === 'shown' ? 'done' : s.decor === 'failed' ? 'failed' : 'active';
  const scene: StepState = decor !== 'done' ? 'pending' : s.framed ? 'done' : 'active';
  const states: Record<GuideStep, StepState> = { object, decor, scene };
  return GUIDE_STEPS.map((id) => ({ id, label: labels[id], state: states[id], detail: states[id] === 'pending' ? undefined : details[id] }));
}
