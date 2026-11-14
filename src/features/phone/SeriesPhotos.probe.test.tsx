/**
 * VERIFIER PROBE (doc 176 §24, session b22ce1b4) — not a shipped test.
 *
 * The shipped suite gives every tile the same picture and never renders the
 * grid AFTER a delete. Here each photo has its own content, and the host does
 * what `removeSeriesPhotos` does: the picked photo goes, the others are
 * renumbered 001, 002… So `002.jpg` names another photo after the delete.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { words } from '../../i18n/words';

const host = vi.hoisted(() => ({ readPicture: vi.fn(), removePhotos: vi.fn() }));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, readPicture: host.readPicture } };
});
vi.mock('../../host/phoneDoors', async (orig) => {
  const real = await orig<typeof import('../../host/phoneDoors')>();
  return { ...real, phoneDoors: { ...real.phoneDoors, removePhotos: host.removePhotos } };
});

import { SeriesPhotos } from './SeriesPhotos';

const w = words('en');
const p = w.phone;
const ID = '2026-11-13_16-26-01';
const DIR = `C:\\app\\series\\${ID}\\`;
const nameOf = (i: number) => `${String(i).padStart(3, '0')}.jpg`;
const pic = (label: string) => `data:image/jpeg;base64,${btoa(label)}`;
const shownIn = (name: string) => screen.getByRole('button', { name }).querySelector('img')?.getAttribute('src') ?? null;

describe('PROBE SeriesPhotos after a delete (names are reused by the renumbering)', () => {
  afterEach(() => { cleanup(); host.readPicture.mockReset(); host.removePhotos.mockReset(); vi.restoreAllMocks(); });

  it('after 002 is deleted, the tile named 002.jpg shows the photo that now carries that name', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The disk: five photos, each its own picture.
    let disk = [1, 2, 3, 4, 5].map((i) => `shot ${i}`);
    host.readPicture.mockImplementation(async (path: string) => pic(disk[parseInt(path.split(/[\\/]/).pop()!, 10) - 1]!));
    // The host: the picked ones to the bin, the others renumbered in their order.
    host.removePhotos.mockImplementation(async (_id: string, names: string[]) => {
      const gone = new Set(names.map((n) => parseInt(n, 10) - 1));
      disk = disk.filter((_, i) => !gone.has(i));
      return { photos: disk.length };
    });
    const paths = (n: number) => Array.from({ length: n }, (_, i) => DIR + nameOf(i + 1));
    const onRemoved = vi.fn();
    const view = render(<SeriesPhotos w={w} seriesId={ID} photos={paths(5)} locked={false} onRemoved={onRemoved} />);
    await waitFor(() => expect(shownIn('002.jpg')).toBe(pic('shot 2')));

    fireEvent.click(screen.getByRole('button', { name: '002.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: p.removePicked }));
    fireEvent.click(screen.getByRole('button', { name: p.removeYes }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(4));
    // What PhoneCapture does next: the status says 4 photos, the same series.
    view.rerender(<SeriesPhotos w={w} seriesId={ID} photos={paths(4)} locked={false} onRemoved={onRemoved} />);
    await new Promise((r) => setTimeout(r, 50));

    expect(disk).toEqual(['shot 1', 'shot 3', 'shot 4', 'shot 5']);
    const seen = [1, 2, 3, 4].map((i) => shownIn(nameOf(i)));
    // The rule: the screen shows the photos that are left, each under its name.
    expect(seen).toEqual(['shot 1', 'shot 3', 'shot 4', 'shot 5'].map(pic));
  });
});
