/**
 * detect — finds out whether Lab 3D runs inside Mnemosyne OS (doc 166 §4).
 *
 * One question, `getStatus`, which every host answers without a permission.
 * The answer is awaited for a long while, but the app is not held for it:
 * after `settleMs` with no answer it is told « foreign » and works on its own.
 *
 * 🎭 No answer yet is not « no »: a slow host that answers after `settleMs`
 * still turns the app into its Mnemosyne state, it does not leave the
 * integrated features off for the session.
 *
 * Written here first, with the types doc 166 gives `detectHost()` in the SDK:
 * moving it there is a publication of the SDK, which is Tony's call.
 *
 * @module host/detect
 */
import { fromStatus, type HostState, type HostStatusAnswer } from './hostState';

/** How long the app waits before working on its own. */
export const SETTLE_MS = 1_500;
/** How long a late answer is still welcome. */
export const ANSWER_MS = 15_000;

export interface DetectDeps {
  /** True when the page has a parent frame. */
  framed: () => boolean;
  /** Asks the host; rejects when nobody answers in `timeoutMs`. */
  ask: (timeoutMs: number) => Promise<HostStatusAnswer>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

/**
 * Calls `onState` with where the app runs: once at once when there is no
 * parent frame, otherwise « foreign » after `SETTLE_MS` unless Mnemosyne
 * answered first, then « mnemosyne » whenever it answers. Returns a stop
 * function: no call happens after it.
 */
export function watchHost(onState: (state: HostState) => void, deps: DetectDeps): () => void {
  if (!deps.framed()) {
    onState({ kind: 'standalone' });
    return () => {};
  }
  let live = true;
  let answered = false;
  const settle = deps.setTimer(() => {
    if (live && !answered) onState({ kind: 'foreign' });
  }, SETTLE_MS);
  deps.ask(ANSWER_MS).then(
    (answer) => {
      if (!live) return;
      answered = true;
      deps.clearTimer(settle);
      onState(fromStatus(answer));
    },
    (err: unknown) => {
      // Nobody answered at all: the « foreign » given at SETTLE_MS stands.
      if (live) console.info('[lab-3d] no Mnemosyne host answered:', err instanceof Error ? err.message : err);
    },
  );
  return () => {
    live = false;
    deps.clearTimer(settle);
  };
}
