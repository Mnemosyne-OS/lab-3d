import { describe, expect, it, vi } from 'vitest';
import { momentPhotos } from '../../core/dayModel';
import { momentOfSeries, momentsOfFolder } from './dayImport';

const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m).getTime();
/** A JPEG start whose IFD0 says only DateTime (0x0132), little-endian. */
function jpegAt(date: string): string {
  const s = [...date].map((c) => c.charCodeAt(0)).concat(0);
  const tiff = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x32, 0x01, 2, 0, 20, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0, ...s];
  const len = tiff.length + 8;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, 0xff, 0xda];
  return `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
}
const NO_EXIF = 'data:image/png;base64,iVBORw0KGgo=';

describe('dayImport', () => {
  it('a phone series is one moment at the time its first photo says, named as the host writes them', async () => {
    const read = vi.fn().mockResolvedValue(jpegAt('2026:11:14 10:42:00'));
    const m = await momentOfSeries({ dir: 'C:\\app\\phone\\2026-11-14_10-41', photos: 3, startedAt: at(10, 41) }, 'spot', at(15), read);
    expect(read).toHaveBeenCalledWith('C:\\app\\phone\\2026-11-14_10-41\\001.jpg');
    expect(m).toMatchObject({ at: at(10, 42), atFrom: 'exif', spotId: 'spot', names: ['001.jpg', '002.jpg', '003.jpg'], source: 'phone' });
  });

  it('a series whose photo says no time takes when the series opened, else now', async () => {
    const read = vi.fn().mockResolvedValue(NO_EXIF);
    expect(await momentOfSeries({ dir: 'C:/s', photos: 1, startedAt: at(9) }, null, at(15), read)).toMatchObject({ at: at(9), atFrom: 'series' });
    expect(await momentOfSeries({ dir: 'C:/s', photos: 1, startedAt: null }, null, at(15), read)).toMatchObject({ at: at(15), atFrom: 'added' });
  });

  it('a photo that cannot be read leaves the time to the series, never a failed import', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const read = vi.fn().mockRejectedValue(new Error('Access denied'));
    expect(await momentOfSeries({ dir: 'C:/s', photos: 2, startedAt: at(9) }, null, at(15), read)).toMatchObject({ at: at(9), atFrom: 'series' });
  });

  it('a folder is cut by its files\' times, each moment taking its first photo\'s EXIF when it has one', async () => {
    const read = vi.fn(async (p: string) => (p.endsWith('/c.jpg') ? jpegAt('2026:11:14 10:58:00') : NO_EXIF));
    const found = await momentsOfFolder('C:/Users/p/day/', [
      { name: 'c.jpg', isDirectory: false, path: '', mtime: at(11) },
      { name: 'a.jpg', isDirectory: false, path: '', mtime: at(10) },
      { name: 'b.JPG', isDirectory: false, path: '', mtime: at(10, 10) },
      { name: 'sub', isDirectory: true, path: '', mtime: at(10) },
      { name: 'x.heic', isDirectory: false, path: '', mtime: at(10) },
    ], null, at(15), read);
    expect(found.map((m) => [m.names, m.at, m.atFrom])).toEqual([[['a.jpg', 'b.JPG'], at(10), 'file'], [['c.jpg'], at(10, 58), 'exif']]);
    expect(found.every((m) => m.dir === 'C:/Users/p/day/' && m.spotId === null && m.source === 'folder')).toBe(true);
  });

  it('photos copied to the PC carry the copy\'s date: every photo is dated by its EXIF instead', async () => {
    const exif: Record<string, string> = { 'a.jpg': '2026:11:14 10:00:00', 'b.jpg': '2026:11:14 10:05:00', 'c.jpg': '2026:11:14 13:00:00' };
    const read = vi.fn(async (p: string) => jpegAt(exif[p.split('/').pop()!]!));
    // All three files were written at 18:00, the second the phone was emptied.
    const found = await momentsOfFolder('C:/Users/p/copied', ['a.jpg', 'b.jpg', 'c.jpg'].map((name) => ({ name, isDirectory: false, path: '', mtime: at(18) })), null, at(19), read);
    expect(found.map((m) => [m.names, m.at, m.atFrom])).toEqual([[['a.jpg', 'b.jpg'], at(10), 'exif'], [['c.jpg'], at(13), 'exif']]);
  });

  it('file dates that agree with the EXIF are trusted: one photo read per moment, not every photo', async () => {
    const read = vi.fn(async () => jpegAt('2026:11:14 10:00:30'));
    const files = Array.from({ length: 6 }, (_, i) => ({ name: `p${i}.jpg`, isDirectory: false, path: '', mtime: at(10, i) }));
    const found = await momentsOfFolder('C:/d', files, null, at(19), read);
    expect(found).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a folder given with backslashes is read by the paths the day shows its photos by', async () => {
    const read = vi.fn().mockResolvedValue(NO_EXIF);
    const found = await momentsOfFolder('C:\\Users\\p\\day', [{ name: 'a.jpg', isDirectory: false, path: '', mtime: at(10) }], null, at(15), read);
    expect(read).toHaveBeenCalledWith('C:\\Users\\p\\day\\a.jpg');
    expect(momentPhotos(found[0]!)).toEqual(['C:\\Users\\p\\day\\a.jpg']);
  });

  it('one file without a date makes every photo dated by its EXIF: taken 5 min apart, they are one moment', async () => {
    const exif: Record<string, string> = { 'a.jpg': '2026:11:14 10:05:00', 'b.jpg': '2026:11:14 10:00:00' };
    const read = vi.fn(async (p: string) => jpegAt(exif[p.split('/').pop()!]!));
    const found = await momentsOfFolder('C:/d', [
      { name: 'a.jpg', isDirectory: false, path: '', mtime: 0, statFailed: true },
      { name: 'b.jpg', isDirectory: false, path: '', mtime: at(10) },
    ], null, at(19), read);
    // Dated « now » (19:00) by its missing file date, a.jpg would have been a moment of its own.
    expect(found.map((m) => [m.names, m.at, m.atFrom])).toEqual([[['b.jpg', 'a.jpg'], at(10), 'exif']]);
  });

  it('a file whose date could not be read is dated now, and said so', async () => {
    const found = await momentsOfFolder('C:/d', [{ name: 'a.jpg', isDirectory: false, path: '', mtime: 0, statFailed: true }], null, at(15), vi.fn().mockResolvedValue(NO_EXIF));
    expect(found[0]).toMatchObject({ at: at(15), atFrom: 'added' });
  });
});
