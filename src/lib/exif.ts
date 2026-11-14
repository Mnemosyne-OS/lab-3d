/**
 * exif — when a JPEG photo was taken, read from its EXIF block (Lab 3D « Une
 * journée »). Only the date: DateTimeOriginal, else DateTimeDigitized, else
 * the IFD0 DateTime. EXIF has no time zone: the date is the camera's local
 * clock, read here as this computer's local time (the photographer's laptop
 * and phone are in the same room).
 *
 * @module lib/exif
 */

/** The bytes a data URL carries, at most `maxBytes` of them from the start (the EXIF block is at the start). */
export function bytesOfDataUrl(url: string, maxBytes = 256 * 1024): Uint8Array | null {
  const comma = url.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(url.slice(0, comma))) return null;
  // Whole groups of 4 characters only: a cut group does not decode.
  const chars = Math.min(url.length - comma - 1, Math.ceil(maxBytes / 3) * 4);
  const part = url.slice(comma + 1, comma + 1 + chars - (chars % 4));
  try {
    const bin = atob(part);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (err) {
    console.warn('[lab-3d] exif: the picture is not base64:', err);
    return null;
  }
}

const DATE_TIME = 0x0132;
const EXIF_IFD = 0x8769;
const ORIGINAL = 0x9003;
const DIGITIZED = 0x9004;

/** When the photo was taken (epoch ms, local clock), or null when its bytes say nothing readable. */
export function exifTakenAt(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    // The picture's data begins: no EXIF came before it.
    if (marker === 0xda || marker === 0xd9) return null;
    const len = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (len < 2) return null;
    if (marker === 0xe1 && isExifHeader(bytes, at + 4)) return readTiff(bytes, at + 10, Math.min(bytes.length, at + 2 + len));
    at += 2 + len;
  }
  return null;
}

function isExifHeader(b: Uint8Array, at: number): boolean {
  return b[at] === 0x45 && b[at + 1] === 0x78 && b[at + 2] === 0x69 && b[at + 3] === 0x66 && b[at + 4] === 0 && b[at + 5] === 0;
}

function readTiff(b: Uint8Array, base: number, end: number): number | null {
  if (base + 8 > end) return null;
  const little = b[base] === 0x49 && b[base + 1] === 0x49;
  if (!little && !(b[base] === 0x4d && b[base + 1] === 0x4d)) return null;
  const u16 = (o: number) => (o + 2 > end ? -1 : little ? b[o]! | (b[o + 1]! << 8) : (b[o]! << 8) | b[o + 1]!);
  const u32 = (o: number) => (o + 4 > end ? -1 : little
    ? (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) + b[o + 3]! * 0x1000000
    : b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!));
  /** The value offset of `tag` in the IFD at `ifd` (relative to the TIFF start), or -1. */
  const find = (ifd: number, tag: number): number => {
    const o = base + ifd;
    const n = u16(o);
    if (n < 0 || n > 512) return -1;
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      if (u16(e) === tag) return u32(e + 8);
    }
    return -1;
  };
  const text = (off: number): number | null => (off < 0 ? null : parseExifDate(ascii(b, base + off, Math.min(end, base + off + 19))));
  const ifd0 = u32(base + 4);
  if (ifd0 < 0) return null;
  const exif = find(ifd0, EXIF_IFD);
  if (exif >= 0) {
    const found = text(find(exif, ORIGINAL)) ?? text(find(exif, DIGITIZED));
    if (found !== null) return found;
  }
  return text(find(ifd0, DATE_TIME));
}

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i]!);
  return s;
}

/** « 2026:11:14 10:42:07 » as a local time; null for the blank dates some cameras write. */
export function parseExifDate(s: string): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return new Date(y, mo - 1, d, h, mi, se).getTime();
}
