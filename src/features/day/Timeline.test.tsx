import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { words } from '../../i18n/words';
import type { Moment } from '../../core/dayModel';
import { Timeline } from './Timeline';

const w = words('en');
const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m).getTime();
const range = { start: at(10), end: at(14) };
const moment = (id: string, t: number, spotId: string | null): Moment => ({ id, at: t, atFrom: 'exif', spotId, dir: 'C:/d', names: ['a.jpg'], source: 'folder' });

function show(t: number, onScrub = vi.fn(), onPick = vi.fn()) {
  render(<Timeline w={w} lang="en" range={range} t={t} moments={[moment('m1', at(11), 's'), moment('m2', at(13), null)]}
    spotName={(id) => (id ? 'Stand A' : w.day.unplaced)} playing={false} canPlay onScrub={onScrub} onPick={onPick} onPlay={vi.fn()} onStop={vi.fn()} />);
  return { onScrub, onPick, slider: screen.getByRole('slider', { name: w.day.timeline }) };
}

describe('Timeline', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('the keys move the hour by five minutes, an hour with Shift, to either end with Home and End, never past them', () => {
    const { onScrub, slider } = show(at(12));
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onScrub.mock.calls.map((c) => c[0])).toEqual([at(12, 5), at(11), at(14)]);
    cleanup();
    const late = show(at(13, 58));
    fireEvent.keyDown(late.slider, { key: 'ArrowRight' });
    expect(late.onScrub).toHaveBeenCalledWith(at(14));
  });

  it('a key that moved the hour never reaches the scene listening on the window', () => {
    const { slider } = show(at(12));
    const scene = vi.fn();
    window.addEventListener('keydown', scene);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'z' });
    window.removeEventListener('keydown', scene);
    // Only the key the timeline did not use goes on.
    expect(scene).toHaveBeenCalledTimes(1);
    expect(scene.mock.calls[0]![0].key).toBe('z');
  });

  it('each moment is a light named by its hour and its spot, the unplaced said as such', () => {
    const { onPick } = show(at(12));
    // ICU may write a narrow space before AM / PM: \s takes it.
    const placed = screen.getByRole('button', { name: /11:00\sAM · Stand A/ });
    expect(placed).toHaveClass('passed');
    expect(screen.getByRole('button', { name: new RegExp(`01:00\\sPM · ${w.day.unplaced}`) })).toHaveClass('unplaced');
    fireEvent.click(placed);
    expect(onPick.mock.calls[0]![0].id).toBe('m1');
  });
});
