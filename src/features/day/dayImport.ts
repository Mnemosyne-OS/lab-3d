/**
 * dayImport — photos become moments of the day (« Une journée »).
 *
 * - From the phone: one series is one moment, at the time its first photo
 *   says (EXIF), else when the series opened, else now.
 * - From a folder: the photos are dated by their file, cut into moments where
 *   two in a row are more than 15 minutes apart, and each moment takes the
 *   time its first photo says when it says one. A folder of the whole day
 *   gives the day's moments; the same stand photographed every half hour
 *   gives the tattoo growing.
 * - Photos copied from a phone to the PC can carry the date of the COPY: the
 *   whole day would then be one moment. The oldest photo is read first; when
 *   its EXIF and its file date disagree, or when some file has no date, every
 *   photo is read and dated by its own EXIF.
 *
 * @module features/day/dayImport
 */
import { isPhotoName, momentPhotos, splitByGaps, type Moment, type TimeSource } from '../../core/dayModel';
import type { DirEntry } from '../../host/doors';
import { bytesOfDataUrl, exifTakenAt } from '../../lib/exif';

/** Reads a photo as a data URL (the host's readFile through the cache). */
export type ReadPhoto = (path: string) => Promise<string>;

/** A photo's EXIF and its file date further apart than this: the file dates are copy dates. */
export const COPY_SKEW_MS = 2 * 60_000;

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** When a photo was taken, from its EXIF; null when it says nothing or cannot be read. */
export async function takenAt(path: string, read: ReadPhoto): Promise<number | null> {
  try {
    const bytes = bytesOfDataUrl(await read(path));
    return bytes ? exifTakenAt(bytes) : null;
  } catch (err) {
    console.warn('[lab-3d] day: the photo could not be read for its time:', path, err);
    return null;
  }
}

/** A closed phone series as one moment. `startedAt` is when the series opened, as the host says. */
export async function momentOfSeries(
  series: { dir: string; photos: number; startedAt: number | null },
  spotId: string | null, now: number, read: ReadPhoto,
): Promise<Moment> {
  const names = Array.from({ length: Math.max(0, series.photos) }, (_, i) => `${String(i + 1).padStart(3, '0')}.jpg`);
  // The same path the day shows it by (momentPhotos): one photo, one key in the cache.
  const first = momentPhotos({ dir: series.dir, names: names.slice(0, 1) })[0];
  const exif = first ? await takenAt(first, read) : null;
  const [at, atFrom]: [number, TimeSource] = exif !== null ? [exif, 'exif'] : series.startedAt ? [series.startedAt, 'series'] : [now, 'added'];
  return { id: newId('m'), at, atFrom, spotId, dir: series.dir, names, source: 'phone' };
}

interface Dated { name: string; at: number; from: TimeSource }

/** A folder's photos as moments; an empty list when it holds none. */
export async function momentsOfFolder(dir: string, entries: readonly DirEntry[], spotId: string | null, now: number, read: ReadPhoto): Promise<Moment[]> {
  // The same path the day shows a photo by: a folder the system's dialog gives with backslashes keeps them.
  const path = (name: string) => momentPhotos({ dir, names: [name] })[0]!;
  const files = entries.filter((e) => !e.isDirectory && isPhotoName(e.name));
  const fileAt = (e: DirEntry): number | null => (!e.statFailed && e.mtime ? e.mtime : null);
  const byFile = (e: DirEntry): Dated => {
    const f = fileAt(e);
    return { name: e.name, at: f ?? now, from: f === null ? 'added' : 'file' };
  };
  if (files.length === 0) return [];

  // The oldest photo by its file says whether the file dates can be trusted.
  const oldest = [...files].sort((a, b) => (fileAt(a) ?? now) - (fileAt(b) ?? now))[0]!;
  const oldestExif = await takenAt(path(oldest.name), read);
  const copied = oldestExif !== null && fileAt(oldest) !== null && Math.abs(oldestExif - fileAt(oldest)!) > COPY_SKEW_MS;
  const allByExif = copied || files.some((e) => fileAt(e) === null);

  let dated: Dated[];
  if (allByExif) {
    dated = [];
    for (const e of files) {
      const x = e === oldest ? oldestExif : await takenAt(path(e.name), read);
      dated.push(x !== null ? { name: e.name, at: x, from: 'exif' } : byFile(e));
    }
  } else {
    dated = files.map(byFile);
  }
  const from = new Map(dated.map((d) => [d.name, d.from]));

  const out: Moment[] = [];
  for (const group of splitByGaps(dated)) {
    const first = group[0]!;
    let at = first.at;
    let atFrom = from.get(first.name) ?? 'file';
    // Dated by their files: the first photo's own EXIF is more precise when it has one.
    if (!allByExif) {
      const exif = first.name === oldest.name ? oldestExif : await takenAt(path(first.name), read);
      if (exif !== null) { at = exif; atFrom = 'exif'; }
    }
    out.push({ id: newId('m'), at, atFrom, spotId, dir, names: group.map((p) => p.name), source: 'folder' });
  }
  return out;
}
