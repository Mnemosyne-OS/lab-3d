/**
 * useEngine — the host's 3D engine and its job, in three states (rule 11),
 * asked only inside Mnemosyne OS. Held once for the whole app (App.tsx): the
 * objects and the places each have a Create view, and two of them asking
 * would be two polls for one job. While a job runs or waits for a decision it
 * is asked every POLL_MS, and the polling stops when it ends. The last answer
 * asked wins: a slow answer never overwrites a newer one.
 *
 * useClock — a one-second clock for the elapsed time, ticking only while a
 * job is live (the job's clock runs while it waits too). It lives in the
 * screen that shows the time, so the rest of the app is not drawn again
 * every second.
 *
 * @module features/create/useEngine
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { doors, isPermissionRefusal, type EngineStatus } from '../../host/doors';
import { POLL_MS, isLive } from './createModel';

export type EngineState =
  | { state: 'loading' }
  | { state: 'error'; refused: boolean; detail: string }
  | { state: 'ready'; engine: EngineStatus };

export function useEngine(enabled: boolean): { status: EngineState; refresh: () => Promise<void> } {
  const [status, setStatus] = useState<EngineState>({ state: 'loading' });
  const asked = useRef(0);

  const refresh = useCallback(async () => {
    const n = ++asked.current;
    try {
      const engine = await doors.status();
      if (n === asked.current) setStatus({ state: 'ready', engine });
    } catch (err) {
      if (n !== asked.current) return;
      console.warn('[lab-3d] engine status unreadable:', err);
      setStatus({ state: 'error', refused: isPermissionRefusal(err), detail: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    // Leaving drops the answer in flight.
    return () => { asked.current++; };
  }, [enabled, refresh]);

  const live = enabled && status.state === 'ready' && isLive(status.engine.job);
  useEffect(() => {
    if (!live) return;
    const poll = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(poll);
  }, [live, refresh]);

  return { status, refresh };
}

export function useClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(tick);
  }, [running]);
  return running ? now : Date.now();
}
