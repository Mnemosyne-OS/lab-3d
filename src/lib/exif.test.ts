import { describe, expect, it } from 'vitest';
import { bytesOfDataUrl, exifTakenAt, parseExifDate } from './exif';

/** A JPEG start with one APP1 EXIF block: IFD0 → Exif IFD → the tags given, each an ASCII date. */
function jpeg(tags: Record<number, string>, little = true, dateTime?: string): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const entries = Object.entries(tags).map(([t, s]) => [Number(t), s] as const);
  // Layout: header (8) · IFD0 · Exif IFD · strings.
  const ifd0Count = dateTime ? 2 : 1;
  const ifd0At = 8;
  const exifAt = ifd0At + 2 + ifd0Count * 12 + 4;
  const strAt = exifAt + 2 + entries.length * 12 + 4;
  const strings: number[] = [];
  const place = (s: string) => { const at = strAt + strings.length; strings.push(...[...s].map((c) => c.charCodeAt(0)), 0); return at; };
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At));
  tiff.push(...u16(ifd0Count), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifAt));
  if (dateTime) tiff.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(place(dateTime)));
  tiff.push(...u32(0));
  tiff.push(...u16(entries.length));
  for (const [t, s] of entries) tiff.push(...u16(t), ...u16(2), ...u32(20), ...u32(place(s)));
  tiff.push(...u32(0), ...strings);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xda, 0, 2]);
}

describe('exif', () => {
  it('reads when the photo was taken, as the local clock', () => {
    expect(exifTakenAt(jpeg({ 0x9003: '2026:11:14 10:42:07' }))).toBe(new Date(2026, 10, 14, 10, 42, 7).getTime());
    expect(exifTakenAt(jpeg({ 0x9003: '2026:11:14 10:42:07' }, false))).toBe(new Date(2026, 10, 14, 10, 42, 7).getTime());
  });

  it('the date taken wins over the date digitized when a photo carries both', () => {
    const both = jpeg({ 0x9003: '2026:11:14 10:42:07', 0x9004: '2026:11:15 08:00:00' });
    expect(exifTakenAt(both)).toBe(new Date(2026, 10, 14, 10, 42, 7).getTime());
  });

  it('falls back to the digitized date, then to the file\'s date in IFD0', () => {
    expect(exifTakenAt(jpeg({ 0x9004: '2026:11:14 09:00:00' }))).toBe(new Date(2026, 10, 14, 9).getTime());
    expect(exifTakenAt(jpeg({ 0x9003: '    :  :     :  :  ' }, true, '2026:11:15 08:30:00'))).toBe(new Date(2026, 10, 15, 8, 30).getTime());
  });

  it('says nothing for a picture that is not a JPEG, or has no EXIF before its data', () => {
    expect(exifTakenAt(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(exifTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
    expect(exifTakenAt(jpeg({}))).toBeNull();
  });

  it('a cut block is read as far as it goes and never past its end', () => {
    const full = jpeg({ 0x9003: '2026:11:14 10:42:07' });
    expect(exifTakenAt(full.slice(0, 40))).toBeNull();
  });

  it('dates outside any calendar are refused', () => {
    expect(parseExifDate('2026:13:01 10:00:00')).toBeNull();
    expect(parseExifDate('0000:00:00 00:00:00')).toBeNull();
  });

  it('a data URL gives its first bytes, a URL without base64 gives none', () => {
    const b = jpeg({ 0x9003: '2026:11:14 10:42:07' });
    const url = `data:image/jpeg;base64,${btoa(String.fromCharCode(...b))}`;
    expect(exifTakenAt(bytesOfDataUrl(url)!)).toBe(new Date(2026, 10, 14, 10, 42, 7).getTime());
    expect(bytesOfDataUrl(url, 3)).toEqual(b.slice(0, 3));
    expect(bytesOfDataUrl('data:text/plain,hello')).toBeNull();
  });
});
