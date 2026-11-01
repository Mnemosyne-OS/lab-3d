/**
 * useHostFiles — the host's files as React state, each with its own guard: a
 * picture's URL, the frames a folder holds now, and an object's cameras.
 * An answer for an id or a file that is no longer the one asked is dropped.
 *
 * @module host/useHostFiles
 */
import { useEffect, useState } from 'react';
import { readWhole } from '../core/model';
import type { Rig } from '../core/stageModel';
import { rigOfBytes } from '../lib/rig';
import { doors, type FrameDir } from './doors';
import { fileUrl } from './fileUrl';

/** A picture's object URL once read; `failed` when the host refused it (the tile says so, never a blank). */
export function useFileUrl(id: string | null, file: string | null): { url: string | null; failed: boolean } {
  const key = id && file ? `${id}/${file}` : '';
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean }>({ key: '', url: null, failed: false });
  useEffect(() => {
    if (!id || !file) return;
    let cancelled = false;
    fileUrl(id, file).then(
      (url) => { if (!cancelled) setState({ key: `${id}/${file}`, url, failed: false }); },
      (err: unknown) => {
        if (cancelled) return;
        console.warn('[lab-3d] picture unreadable:', id, file, err);
        setState({ key: `${id}/${file}`, url: null, failed: true });
      },
    );
    return () => { cancelled = true; };
  }, [id, file]);
  return state.key === key ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}

/**
 * The frames a folder holds now, asked again each time `key` changes (the
 * job's count for that folder moved). `null` until the first answer; a refused
 * answer keeps the last list and is said in the log.
 */
export function useFrameNames(id: string | null, dir: FrameDir, key: unknown): string[] | null {
  const [names, setNames] = useState<{ id: string; dir: FrameDir; names: string[] } | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    doors.frames(id, dir).then(
      (r) => { if (!cancelled) setNames({ id, dir, names: Array.isArray(r?.names) ? r.names : [] }); },
      (err: unknown) => { if (!cancelled) console.warn('[lab-3d] frames unlisted:', id, dir, err); },
    );
    return () => { cancelled = true; };
  }, [id, dir, key]);
  return names && names.id === id && names.dir === dir ? names.names : null;
}

/** cameras.json once it exists (`ready`: the coverage step wrote it); null before, or when it is not a rig. */
export function useRig(id: string | null, ready: boolean): Rig | null {
  const [rig, setRig] = useState<{ id: string; rig: Rig } | null>(null);
  useEffect(() => {
    if (!id || !ready) return;
    let cancelled = false;
    readWhole((o) => doors.read(id, 'cameras.json', o)).then((r) => {
      if (cancelled) return;
      if (!r.ok) { console.warn('[lab-3d] cameras unreadable:', id, r.error); return; }
      const parsed = rigOfBytes(r.bytes);
      if (parsed) setRig({ id, rig: parsed });
    }, (err: unknown) => console.warn('[lab-3d] cameras unread:', id, err));
    return () => { cancelled = true; };
  }, [id, ready]);
  return rig?.id === id ? rig.rig : null;
}
