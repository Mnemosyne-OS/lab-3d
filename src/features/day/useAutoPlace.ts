/**
 * useAutoPlace — the photos of each new moment placed in the morning's place
 * by the host (`splat.placePhotos`, doc 166 §16), one moment at a time.
 *
 * The person adds a moment (Done on the phone, a folder picked): that click
 * starts the placement of what is not placed yet. When the host answers, each
 * photo keeps its viewpoint, and a moment with no spot goes to the nearest
 * spot or to a new one made where its first photo was taken (`applyPlacement`).
 * A photo the host could not place (a crowd, a close-up) is not an error: the
 * moment keeps the person's spot, or waits for one, as before.
 *
 * Refusals:
 *  - not from a click (the window lost the focus): waits for the next click in
 *    the window, then goes on;
 *  - another job on the graphics card: tries again a little later;
 *  - a host without the action (older than this lot): nothing more is asked
 *    this session, the day works by hand as before;
 *  - anything else: the moment is marked tried and the reason said.
 *
 * @module features/day/useAutoPlace
 */
import { useEffect, useRef, useState } from 'react';
import { doors, type PlaceView } from '../../host/doors';
import { momentPhotos, momentsToPlace, type Day, type Moment, type PhotoPose } from '../../core/dayModel';

/** How often the job is read while it runs. */
const POLL_MS = 2_000;
/** Never wait on one moment longer than this (rule 9): far above a minute or two measured on 100 frames. */
const CEILING_MS = 25 * 60_000;
/** Another job holds the graphics card: asked again after this. */
const BUSY_RETRY_MS = 30_000;

export type PlaceNote =
  | { kind: 'placing'; step: PlaceView['step'] }
  | { kind: 'waitingClick' }
  | { kind: 'done'; placed: number; total: number }
  | { kind: 'failed'; detail: string };

/** The host's answer as photos of the moment: an absolute path back to its name. */
export function posesFor(m: Pick<Moment, 'dir' | 'names'>, placed: NonNullable<PlaceView['placed']>): PhotoPose[] {
  const paths = momentPhotos(m);
  return placed.flatMap((p) => {
    const i = paths.indexOf(p.photo);
    return i < 0 ? [] : [{ name: m.names[i]!, pose: { position: p.centre, dir: p.look } }];
  });
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function useAutoPlace({ day, ready, onPlaced, placeId: shown = null }: {
  day: Day | null;
  /** The version of the place on stage (a resumed place is a newer version); the day's own when absent. */
  placeId?: string | null;
  /** The place is on stage: its size is known. */
  ready: boolean;
  /** The host's answer for a moment (possibly no photo placed). */
  onPlaced: (momentId: string, poses: PhotoPose[]) => void;
}): PlaceNote | null {
  const [note, setNote] = useState<PlaceNote | null>(null);
  const [round, setRound] = useState(0);
  const running = useRef<string | null>(null);
  const unsupported = useRef(false);
  const onPlacedRef = useRef(onPlaced);
  onPlacedRef.current = onPlaced;

  const next = day && ready && !unsupported.current ? momentsToPlace(day)[0] ?? null : null;
  const placeId = shown ?? day?.placeId ?? null;

  useEffect(() => {
    if (!next || !placeId || running.current) return;
    const m = next;
    running.current = m.id;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unclick: (() => void) | null = null;
    const after = (ms: number) => new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });
    const finish = () => { running.current = null; if (live) setRound((r) => r + 1); };

    void (async () => {
      const photos = momentPhotos(m);
      try {
        setNote({ kind: 'placing', step: 'preparing' });
        await doors.placePhotos(placeId, photos);
      } catch (err) {
        const why = message(err);
        if (!live) return;
        if (/NOT_FROM_A_GESTURE/.test(why)) {
          // The next click in this window is a gesture: go on from it.
          setNote({ kind: 'waitingClick' });
          const go = () => { unclick?.(); unclick = null; finish(); };
          document.addEventListener('pointerdown', go, { once: true });
          unclick = () => document.removeEventListener('pointerdown', go);
          running.current = null;
          return;
        }
        if (/ALREADY_RUNNING|SPLAT_JOB_RUNNING|ALIGN_RUNNING/.test(why)) {
          setNote({ kind: 'placing', step: 'preparing' });
          await after(BUSY_RETRY_MS);
          finish();
          return;
        }
        if (/Unknown action|not found|Unsupported/i.test(why)) {
          // A host older than this lot: the day stays by hand, nothing more is asked.
          console.warn('[lab-3d] day: this Mnemosyne OS cannot place photos yet:', why);
          unsupported.current = true;
          setNote(null);
          finish();
          return;
        }
        console.warn('[lab-3d] day: the photos could not be placed:', err);
        setNote({ kind: 'failed', detail: why });
        onPlacedRef.current(m.id, []);
        finish();
        return;
      }
      const t0 = Date.now();
      while (live) {
        await after(POLL_MS);
        if (!live) return;
        let v: PlaceView | null = null;
        try {
          v = await doors.placeStatus();
        } catch (err) {
          console.warn('[lab-3d] day: the placement could not be read:', err);
        }
        if (!live) return;
        const ours = v && v.placeId === placeId && v.photos.length === photos.length && v.photos.every((p, i) => p === photos[i]);
        if (v && ours && v.step === 'done') {
          const poses = posesFor(m, v.placed ?? []);
          onPlacedRef.current(m.id, poses);
          setNote({ kind: 'done', placed: poses.length, total: photos.length });
          finish();
          return;
        }
        if (v && ours && (v.step === 'failed' || v.step === 'cancelled')) {
          setNote({ kind: 'failed', detail: v.error ?? v.step });
          onPlacedRef.current(m.id, []);
          finish();
          return;
        }
        if (v && ours) setNote({ kind: 'placing', step: v.step });
        if (Date.now() - t0 > CEILING_MS) {
          setNote({ kind: 'failed', detail: 'TIMEOUT' });
          onPlacedRef.current(m.id, []);
          finish();
          return;
        }
      }
    })();

    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      unclick?.();
      running.current = null;
    };
    // `next` is a fresh object each render: the moment's id says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.id, placeId, round]);

  return note;
}
