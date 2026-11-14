/**
 * photoCache — the day's photos read from disk (`dialog.readFile`), each once,
 * as data URLs. A phone photo is 3 to 9 MB, so only the last few are kept:
 * the one on screen, the one before it, the next ones a playback asked for.
 *
 * @module features/day/photoCache
 */
import { useEffect, useState } from 'react';
import { doors } from '../../host/doors';

/** Photos kept at once (each up to ~12 MB as a data URL). */
export const KEEP_PHOTOS = 8;
const photos = new Map<string, Promise<string>>();

/** The photo as a data URL. Rejects with the host's reason; a failed read is not kept. */
export function photoUrl(path: string): Promise<string> {
  const hit = photos.get(path);
  if (hit) {
    photos.delete(path);
    photos.set(path, hit);
    return hit;
  }
  const p = doors.readPicture(path);
  photos.set(path, p);
  p.catch(() => photos.delete(path));
  while (photos.size > KEEP_PHOTOS) photos.delete(photos.keys().next().value as string);
  return p;
}

/** Read ahead, so the photo is there when the playback shows it. A failure is said when it is shown. */
export function prefetchPhotos(paths: readonly string[]): void {
  for (const p of paths.slice(0, 3)) photoUrl(p).catch(() => undefined);
}

/** A photo as React state: its URL once read, `failed` when the host refused it. */
export function usePhoto(path: string | null): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ path: string; url: string | null; failed: boolean }>({ path: '', url: null, failed: false });
  useEffect(() => {
    if (!path) return;
    let live = true;
    photoUrl(path).then(
      (url) => { if (live) setState({ path, url, failed: false }); },
      (err: unknown) => {
        console.warn('[lab-3d] day photo not read:', path, err);
        if (live) setState({ path, url: null, failed: true });
      },
    );
    return () => { live = false; };
  }, [path]);
  return state.path === path ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}
