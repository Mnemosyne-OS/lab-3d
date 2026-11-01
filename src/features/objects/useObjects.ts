/**
 * useObjects — the objects the host lists, in three states (rule 11). Asked
 * only inside Mnemosyne OS (`enabled`), again on `retry`. A refused permission
 * is its own state: it is fixed somewhere else than a retry.
 *
 * @module features/objects/useObjects
 */
import { useEffect, useState } from 'react';
import { doors, isPermissionRefusal } from '../../host/doors';
import type { ObjectEntry } from '../../core/model';

export type ObjectsState =
  | { state: 'loading' }
  | { state: 'error'; refused: boolean; detail: string }
  | { state: 'ready'; objects: ObjectEntry[] };

export function useObjects(enabled: boolean, refreshKey = 0): { objects: ObjectsState; retry: () => void } {
  const [objects, setObjects] = useState<ObjectsState>({ state: 'loading' });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setObjects({ state: 'loading' });
    doors.list().then(
      (res) => { if (!cancelled) setObjects({ state: 'ready', objects: Array.isArray(res?.objects) ? res.objects : [] }); },
      (err: unknown) => {
        if (cancelled) return;
        console.warn('[lab-3d] the library could not be read:', err);
        setObjects({ state: 'error', refused: isPermissionRefusal(err), detail: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => { cancelled = true; };
  }, [enabled, round, refreshKey]);

  return { objects, retry: () => setRound((r) => r + 1) };
}
