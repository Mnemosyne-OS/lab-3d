/**
 * useSceneLoader — one stage per tab and the load that fills it, measured
 * phase by phase (loadModel). The canvas is created on the first load and
 * kept: a scene replaces the last one on the same stage.
 *
 * Each load takes a number: a scene asked while another loads wins, a closed
 * view drops the load in flight, and leaving the tab drops it too (it would
 * otherwise build a stage on a tab that is gone, and report to nobody).
 *
 * @module features/stage/useSceneLoader
 */
import { useEffect, useRef, useState } from 'react';
import { SplatStage, type LoadOptions, type StageInfo } from '../../engine/SplatStage';
import { percent } from '../../lib/format';
import type { Took } from './loadModel';

/** What a source hands over once its bytes are here. */
export interface Prepared<M> { bytes: Uint8Array; fileName: string; opts?: Omit<LoadOptions, 'onDecoded'>; meta: M }

export type LoaderView<M> =
  | { kind: 'idle' }
  | { kind: 'loading'; name: string; at: number; readShare: string; took: Took }
  | { kind: 'failed'; name: string; at: number; reason: string; took: Took }
  | { kind: 'ready'; name: string; info: StageInfo; ms: number; meta: M };

export function useSceneLoader<M>() {
  const [view, setView] = useState<LoaderView<M>>({ kind: 'idle' });
  const hostRef = useRef<HTMLDivElement>(null);
  const stage = useRef<SplatStage | null>(null);
  const call = useRef(0);

  useEffect(() => () => { call.current++; stage.current?.dispose(); stage.current = null; }, []);

  /**
   * Reads the bytes with `read` (it reports what arrived), then decodes and
   * stages them. `before` sets the stage's options (turn, flip) first.
   */
  const load = async (
    name: string,
    read: (onBytes: (loaded: number, total: number) => void) => Promise<Prepared<M>>,
    before?: (s: SplatStage) => void,
  ): Promise<void> => {
    const n = ++call.current;
    const live = () => n === call.current;
    const t0 = performance.now();
    let mark = t0;
    const took: Took = {};
    const stamp = (step: keyof Took) => { const now = performance.now(); took[step] = now - mark; mark = now; };
    let at = 0;
    setView({ kind: 'loading', name, at, readShare: '', took: {} });
    try {
      const prepared = await read((loaded, total) => {
        if (live()) setView({ kind: 'loading', name, at: 0, readShare: percent(loaded, total), took: {} });
      });
      if (!live()) return;
      stamp('read');
      at = 1;
      setView({ kind: 'loading', name, at, readShare: '', took: { ...took } });
      if (!stage.current && hostRef.current) stage.current = new SplatStage(hostRef.current);
      const s = stage.current;
      if (!s) throw new Error('NO_STAGE');
      before?.(s);
      const info = await s.load(prepared.bytes, prepared.fileName, {
        ...prepared.opts,
        onDecoded: () => {
          if (!live()) return;
          stamp('decode');
          at = 2;
          setView({ kind: 'loading', name, at, readShare: '', took: { ...took } });
        },
      });
      if (!live()) return;
      stamp('stage');
      setView({ kind: 'ready', name, info, ms: performance.now() - t0, meta: prepared.meta });
    } catch (err) {
      if (!live()) return;
      console.warn('[lab-3d] scene not shown:', name, err);
      setView({ kind: 'failed', name, at, reason: err instanceof Error ? err.message : String(err), took: { ...took } });
    }
  };

  /** A refusal before any byte is read (a file this app does not read). */
  const refuse = (name: string, reason: string) => {
    call.current++;
    setView({ kind: 'failed', name, at: 0, reason, took: {} });
  };

  /** Back to nothing on stage; the stage itself is kept for the next scene. */
  const close = () => {
    call.current++;
    stage.current?.close();
    setView({ kind: 'idle' });
  };

  return { view, hostRef, stage, load, refuse, close };
}
