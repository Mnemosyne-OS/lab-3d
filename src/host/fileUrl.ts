/**
 * fileUrl — an object's pictures (a thumbnail, a frame the job wrote, a
 * cut-out), read once each from the host. Such a file never changes once
 * written, so its object URL is kept; the oldest are let go (and revoked)
 * past a bound, so a long session does not hold every frame of every object.
 *
 * @module host/fileUrl
 */
import { doors } from './doors';
import { readWhole } from '../core/model';

/** Object URLs kept at once: a job's stage shows ~100 frames, a library a few dozen thumbnails. */
const KEEP = 400;
const urls = new Map<string, Promise<string>>();

function mimeOf(file: string): string {
  return file.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/** The object URL of an object's picture. Rejects with the host's reason; a failed read is not kept. */
export function fileUrl(id: string, file: string): Promise<string> {
  const key = `${id}/${file}`;
  const hit = urls.get(key);
  if (hit) {
    // Most recent last: the bound lets go of the least recently shown.
    urls.delete(key);
    urls.set(key, hit);
    return hit;
  }
  const p = readWhole((offset) => doors.read(id, file, offset)).then((r) => {
    if (!r.ok) throw new Error(r.error);
    return URL.createObjectURL(new Blob([r.bytes], { type: mimeOf(file) }));
  });
  urls.set(key, p);
  p.catch(() => urls.delete(key));
  while (urls.size > KEEP) {
    const [oldest, url] = urls.entries().next().value as [string, Promise<string>];
    urls.delete(oldest);
    // A failed read was already said by whoever asked for it, and is not in the map.
    url.then((u) => URL.revokeObjectURL(u), () => {});
  }
  return p;
}
