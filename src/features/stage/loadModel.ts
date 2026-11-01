/**
 * loadModel — the phases of putting a scene on the stage, as values (Fast
 * Refresh: the hook lives in useSceneLoader.ts). Every phase is real and
 * measured: the bytes arriving (a local file, or pieces from the host), Spark
 * decoding the points, the first frame painted.
 *
 * @module features/stage/loadModel
 */
import { railFrom, type RailStep } from '../../ui/stepRailModel';
import { formatMs } from '../../lib/format';

export const LOAD_STEPS = ['read', 'decode', 'stage'] as const;
export type LoadStep = (typeof LOAD_STEPS)[number];

/** How long each finished phase took, in ms; a phase not reached has no entry. */
export type Took = Partial<Record<LoadStep, number>>;

/**
 * The rail of a load at phase `at`: each finished phase says its time, the
 * phase reading the bytes says the share read (`readShare`, empty when the
 * total is unknown), the others say nothing.
 */
export function loadRail(at: number, failed: boolean, took: Took, readShare: string, labels: Record<LoadStep, string>, lang: string): RailStep[] {
  const states = railFrom(LOAD_STEPS, at, failed);
  return LOAD_STEPS.map((id, i) => {
    const ms = took[id];
    const detail = ms !== undefined ? formatMs(ms, lang) : id === 'read' && states[i] === 'active' && readShare ? readShare : undefined;
    return { id, label: labels[id], state: states[i]!, detail };
  });
}

/** What went wrong, for the sentence: no points, the bytes, or the decoding. */
export function failureKind(reason: string, at: number): 'empty' | 'read' | 'decode' {
  if (reason === 'EMPTY_SCENE') return 'empty';
  return at === 0 ? 'read' : 'decode';
}
