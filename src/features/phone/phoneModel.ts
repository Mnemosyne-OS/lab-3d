/**
 * phoneModel — the plain rules of the phone capture screen (doc 176), kept
 * out of the component so they are tested on their own.
 *
 * @module features/phone/phoneModel
 */
import type { Gallery } from '../objects/libraryModel';
import type { PhoneSeries, PhoneStatus } from '../../host/phoneDoors';

/** The engine refuses a folder of fewer photos (splat.start: 20 to 400). */
export const MIN_PHOTOS = 20;
export const MAX_PHOTOS = 400;

/**
 * How many photos to aim for. Measured in doc 163: 56 and 63 photos gave a
 * sharp object. A place is walked through, so it takes more (doc 166 §14).
 */
export function targetFor(gallery: Gallery): number {
  return gallery === 'places' ? 100 : 60;
}

/** After this long with a series open and no phone on the page, the screen says why it may be. */
export const NO_PHONE_HINT_MS = 30_000;

/**
 * Whether to show the « no phone reached the PC » causes: a series is open,
 * no phone loaded its page, and it has been open long enough to have tried.
 */
export function showNoPhoneHint(st: Pick<PhoneStatus, 'active' | 'phoneSeen' | 'startedAt'>, now: number): boolean {
  return st.active && !st.phoneSeen && st.startedAt !== null && now - st.startedAt >= NO_PHONE_HINT_MS;
}

/** What the « Create » button may do with this many photos: create, or say why not. */
export function createVerdict(photos: number): 'ok' | 'tooFew' | 'tooMany' {
  if (photos < MIN_PHOTOS) return 'tooFew';
  if (photos > MAX_PHOTOS) return 'tooMany';
  return 'ok';
}

/** A default name for a new vault: the gallery's word and the series' date. */
export function defaultVaultName(base: string, startedAt: number | null): string {
  if (startedAt === null) return base;
  const d = new Date(startedAt);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${base} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * When a series was started: the host's time, else read from its id, which
 * the host writes as the local time it opened (`2026-10-24_18-25-57`). Null
 * when neither says it.
 */
export function seriesWhen(s: Pick<PhoneSeries, 'id' | 'startedAt'>): Date | null {
  if (s.startedAt !== null && Number.isFinite(s.startedAt)) return new Date(s.startedAt);
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/.exec(s.id);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const at = new Date(y, mo - 1, d, h, mi, se);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The newest object already made from this series. The host names a job's
 * folder after the folder it read (main/splat jobFolderName:
 * `20261026-140540-2026-10-24_18-25-57`), and a series' folder is its id.
 * A series still waiting may have been made into 3D already: it waits to be
 * put away (Tony, 26/10: a new place opened on the photos of the session before).
 */
export function madeFrom<T extends { id: string; createdAt: string | null }>(seriesId: string, objects: readonly T[]): T | null {
  let best: T | null = null;
  for (const o of objects) {
    if (!/^\d{8}-\d{6}-/.test(o.id) || o.id.slice(16) !== seriesId) continue;
    if (!best || o.id > best.id) best = o;
  }
  return best;
}

/**
 * The waiting series shown first: the one just closed, else the newest not
 * made into 3D yet. None when a new series was asked: an old one never
 * passes for it.
 */
export function firstShown(series: readonly PhoneSeries[], made: (id: string) => boolean, justClosed: string | null, fresh: boolean): string | null {
  if (justClosed && series.some((s) => s.id === justClosed)) return justClosed;
  if (fresh) return null;
  const open = series.filter((s) => !made(s.id));
  return open.length ? open[open.length - 1]!.id : null;
}

/** At most `max` photo numbers (0-based) spread over `count`, the first and the last included. */
export function sampleIndexes(count: number, max: number): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  if (max <= 1) return max === 1 ? [0] : [];
  return Array.from({ length: max }, (_, i) => Math.round((i * (n - 1)) / (max - 1)));
}
