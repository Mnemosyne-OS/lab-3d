/**
 * mirror — Lab 3D's blob in the host's mirror (doc 73), written one key at a
 * time. The host keeps ONE blob per app and `state.set` replaces it whole:
 * the décors and the days each own a key, and a write that sent only its own
 * key would erase the other one. So each write reads the blob, changes its
 * key, and writes the blob back, one write after the other.
 *
 * @module host/mirror
 */
import { doors } from './doors';

let queue: Promise<unknown> = Promise.resolve();

/** The whole blob, or an error when the host could not be asked (never an empty blob in its place). */
export async function readMirror(): Promise<Record<string, unknown>> {
  const res = await doors.stateGet();
  const state = res?.state;
  return state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
}

/**
 * Sets `key` in the blob and keeps every other key as the host has it. Writes
 * run one at a time, in the order asked. A blob that could not be read is
 * never written over: the write fails instead, and says why.
 */
export function writeMirrorKey(key: string, value: unknown): Promise<void> {
  const run = queue.then(async () => {
    const blob = await readMirror();
    await doors.stateSet({ ...blob, [key]: value });
  });
  // The next write waits for this one, whether it worked or not.
  queue = run.catch(() => undefined);
  return run;
}
