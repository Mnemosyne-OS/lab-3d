import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { fill, words } from '../../i18n/words';

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
const ID = '2026-11-13_16-26-00';
const PHOTOS = Array.from({ length: 30 }, (_, i) => `C:\\app\\series\\${ID}\\${String(i + 1).padStart(3, '0')}.jpg`);

describe('SeriesPhotos', () => {
  afterEach(() => { cleanup(); host.readPicture.mockReset(); host.removePhotos.mockReset(); vi.restoreAllMocks(); });

  it('shows every photo of the series, not a sample', () => {
    host.readPicture.mockResolvedValue('data:image/jpeg;base64,AA==');
    render(<SeriesPhotos w={w} seriesId={ID} photos={PHOTOS} locked={false} onRemoved={vi.fn()} />);
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(30);
  });

  it('the photos picked go to the bin after one question, by their names', async () => {
    host.readPicture.mockResolvedValue('data:image/jpeg;base64,AA==');
    host.removePhotos.mockResolvedValue({ photos: 28 });
    const onRemoved = vi.fn();
    render(<SeriesPhotos w={w} seriesId={ID} photos={PHOTOS} locked={false} onRemoved={onRemoved} />);
    fireEvent.click(screen.getByRole('button', { name: '003.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: '017.jpg' }));
    expect(screen.getByRole('button', { name: '003.jpg' })).toHaveAttribute('aria-pressed', 'true');
    const bar = screen.getByRole('group', { name: fill(p.picked, { n: 2 }) });
    fireEvent.click(within(bar).getByRole('button', { name: p.removePicked }));
    expect(screen.getByText(fill(p.removeSure, { n: 2 }))).toBeInTheDocument();
    expect(host.removePhotos).not.toHaveBeenCalled();
    fireEvent.click(within(bar).getByRole('button', { name: p.removeYes }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(28));
    expect(host.removePhotos).toHaveBeenCalledWith(ID, ['003.jpg', '017.jpg'], 30);
  });

  it('a click again unpicks a photo; « Pick none » clears them all', () => {
    host.readPicture.mockResolvedValue('data:image/jpeg;base64,AA==');
    render(<SeriesPhotos w={w} seriesId={ID} photos={PHOTOS} locked={false} onRemoved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '001.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: '001.jpg' }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '002.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: p.pickNone }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('a series used by a day cannot lose photos: nothing can be picked', () => {
    host.readPicture.mockResolvedValue('data:image/jpeg;base64,AA==');
    render(<SeriesPhotos w={w} seriesId={ID} photos={PHOTOS} locked onRemoved={vi.fn()} />);
    expect(screen.getByRole('button', { name: '001.jpg' })).toBeDisabled();
  });

  it('a refusal of the host is said, nothing stays picked (the names may point at other photos now), and the series is read again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.readPicture.mockResolvedValue('data:image/jpeg;base64,AA==');
    host.removePhotos.mockRejectedValue(new Error('SERIES_STILL_OPEN'));
    const onRemoved = vi.fn();
    render(<SeriesPhotos w={w} seriesId={ID} photos={PHOTOS} locked={false} onRemoved={onRemoved} />);
    fireEvent.click(screen.getByRole('button', { name: '005.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: p.removePicked }));
    fireEvent.click(screen.getByRole('button', { name: p.removeYes }));
    expect(await screen.findByRole('alert')).toHaveTextContent('SERIES_STILL_OPEN');
    await waitFor(() => expect(screen.getByRole('button', { name: '005.jpg' })).toHaveAttribute('aria-pressed', 'false'));
    expect(onRemoved).toHaveBeenCalledWith(-1);
  });
});
