import { describe, expect, it } from 'vitest';
import {
  DIFF_RULES, canOverlay, colourDiff, dateOf, daysApart, friseGroups, hasAlignment, orderPair, pct, sim3Pose, type Alignment,
} from './compareModel';
import type { ObjectEntry } from './model';

const obj = (id: string, filmedAt: string | null, extra: Partial<ObjectEntry> = {}): ObjectEntry => ({
  id, createdAt: null, quality: 'full', framesKept: 100, posesPlaced: 100, coverageDeg: 350, sceneBytes: 1, thumb: null, filmedAt, ...extra,
});

const alignment = (extra: Partial<Alignment> = {}): Alignment => ({
  refId: 'a', movedId: 'b', measuredAt: '2026-10-23T00:00:00Z', placed: 90, total: 100, reprojectionPx: 1.2, sharedPoints: 800,
  refPoints: 4000, residualPct: 0.4, sim3: { scale: 1.1, rotation: [1, 0, 0, 0], translation: [0, 0, 0] }, verdict: 'aligned',
  reasons: [], views: [], seconds: {}, ...extra,
});

describe('dateOf', () => {
  it('reads the filming date, and an unreadable or absent one is unknown, never today', () => {
    expect(dateOf({ filmedAt: '2026-10-21T10:39:03Z' })).toBe(Date.parse('2026-10-21T10:39:03Z'));
    expect(dateOf({ filmedAt: 'not a date' })).toBeNull();
    expect(dateOf({ filmedAt: null })).toBeNull();
    expect(dateOf({})).toBeNull();
  });
});

describe('orderPair', () => {
  it('the earlier date is the reference, whatever order they were picked in', () => {
    const early = obj('early', '2026-03-01T10:00:00Z');
    const late = obj('late', '2026-10-01T10:00:00Z');
    expect(orderPair(late, early)).toEqual({ ref: early, moved: late });
    expect(orderPair(early, late)).toEqual({ ref: early, moved: late });
  });

  it('an unknown date keeps the order they were picked in: nothing is guessed', () => {
    const known = obj('known', '2026-10-01T10:00:00Z');
    const unknown = obj('unknown', null);
    expect(orderPair(unknown, known)).toEqual({ ref: unknown, moved: known });
    expect(orderPair(known, unknown)).toEqual({ ref: known, moved: unknown });
  });
});

describe('hasAlignment', () => {
  it('the moved object carries the alignment to its reference, not the other way', () => {
    const ref = obj('ref', null);
    const moved = obj('moved', null, { alignedTo: ['ref'] });
    expect(hasAlignment(ref, moved)).toBe(true);
    expect(hasAlignment(moved, ref)).toBe(false);
    expect(hasAlignment(ref, obj('older-host', null))).toBe(false);
  });
});

describe('friseGroups', () => {
  it('one dot per filmed day, oldest at 0, newest at 1, undated left out', () => {
    const g = friseGroups([
      obj('b2', '2026-10-21T15:00:00'), obj('a', '2026-10-01T09:00:00'), obj('b1', '2026-10-21T10:00:00'), obj('x', null),
    ], 0.1);
    expect(g.map((d) => d.day)).toEqual(['2026-10-01', '2026-10-21']);
    expect(g[0]!.position).toBe(0);
    expect(g[1]!.position).toBe(1);
    // A day's objects, oldest first.
    expect(g[1]!.members.map((o) => o.id)).toEqual(['b1', 'b2']);
  });

  it('a single day sits in the middle of the line', () => {
    expect(friseGroups([obj('a', '2026-10-21T10:00:00')], 0.1)[0]!.position).toBe(0.5);
  });

  it('labels closer than the gap go to the next row, and the rows stop growing at the cap', () => {
    const days = ['01', '02', '03', '04', '05'].map((d) => obj(d, `2026-10-${d}T12:00:00`));
    const g = friseGroups(days, 0.9);
    expect(g.map((d) => d.lane)).toEqual([0, 1, 2, 0, 1]);
    const spaced = friseGroups(days, 0.1);
    expect(spaced.every((d) => d.lane === 0)).toBe(true);
  });
});

describe('daysApart', () => {
  it('whole days between two dates, and nothing when one is unknown', () => {
    expect(daysApart(obj('a', '2026-10-01T12:00:00Z'), obj('b', '2026-10-13T12:00:00Z'))).toBe(12);
    expect(daysApart(obj('a', null), obj('b', '2026-10-13T12:00:00Z'))).toBeNull();
  });
});

describe('sim3Pose', () => {
  it('turns the w-first rotation of the file into three.js order', () => {
    const p = sim3Pose({ scale: 2, rotation: [0.5, 0.1, 0.2, 0.3], translation: [1, 2, 3] });
    expect(p.quaternion).toEqual([0.1, 0.2, 0.3, 0.5]);
    expect(p.scale).toBe(2);
    expect(p.position).toEqual([1, 2, 3]);
  });
});

describe('canOverlay', () => {
  it('only an alignment that passed, with a measured similarity, is overlaid', () => {
    expect(canOverlay(alignment())).toBe(true);
    expect(canOverlay(alignment({ verdict: 'weak' }))).toBe(true);
    expect(canOverlay(alignment({ verdict: 'failed' }))).toBe(false);
    expect(canOverlay(alignment({ sim3: null }))).toBe(false);
    expect(canOverlay(null)).toBe(false);
  });
});

describe('colourDiff', () => {
  // Two 2 × 1 renders, rows bottom-up as WebGL reads them.
  const px = (...rgba: number[][]) => new Uint8Array(rgba.flat());

  it('a pixel only one date covers is hatched and never counted as unchanged', () => {
    const a = px([100, 100, 100, 255], [100, 100, 100, 255]);
    const b = px([100, 100, 100, 255], [100, 100, 100, 0]);
    const d = colourDiff(a, b, 2, 1);
    expect(d.covered).toBe(1);
    expect(d.changed).toBe(0);
    // The second pixel is grey, half-visible: hatching, never left clear.
    expect(d.image[4 + 3]).toBeGreaterThan(0);
    expect(d.image[3]).toBe(0);
  });

  // Two pixels that swap colours keep each channel's sum: the light match stays at 1.
  it('a colour that moved past the threshold is red and counted, an unchanged one left clear', () => {
    const a = px([200, 50, 50, 255], [50, 50, 200, 255], [100, 100, 100, 255]);
    const b = px([50, 50, 200, 255], [200, 50, 50, 255], [100, 100, 100, 255]);
    const d = colourDiff(a, b, 3, 1);
    expect(d.gain).toEqual([1, 1, 1]);
    expect(d.covered).toBe(3);
    expect(d.changed).toBe(2);
    expect([d.image[0], d.image[1], d.image[2]]).toEqual([255, 40, 40]);
    expect(d.image[8 + 3]).toBe(0);
  });

  it('a change of light over the whole view is matched first, not read as a change of the thing', () => {
    const a = px([200, 200, 200, 255], [100, 100, 100, 255]);
    const b = px([100, 100, 100, 255], [50, 50, 50, 255]);
    const d = colourDiff(a, b, 2, 1);
    expect(d.gain[0]).toBeCloseTo(2, 6);
    expect(d.changed).toBe(0);
  });

  it('no pixel both cover: no gain is measured, none applied', () => {
    const a = px([200, 200, 200, 0], [100, 100, 100, 255]);
    const b = px([100, 100, 100, 255], [50, 50, 50, 0]);
    const d = colourDiff(a, b, 2, 1);
    expect(d.covered).toBe(0);
    expect(d.gain).toEqual([1, 1, 1]);
  });

  it('a render below the opacity floor is not covered', () => {
    const under = Math.round(DIFF_RULES.minAlpha * 255) - 1;
    const d = colourDiff(px([0, 0, 0, under]), px([0, 0, 0, 255]), 1, 1);
    expect(d.covered).toBe(0);
  });

  it('rows come out top first', () => {
    // Bottom row (first in the buffer) swaps colours, top row the same.
    const a = px([200, 50, 50, 255], [50, 50, 200, 255], [9, 9, 9, 255], [9, 9, 9, 255]);
    const b = px([50, 50, 200, 255], [200, 50, 50, 255], [9, 9, 9, 255], [9, 9, 9, 255]);
    const d = colourDiff(a, b, 2, 2);
    expect([d.image[3], d.image[4 + 3]]).toEqual([0, 0]);
    expect(d.image[8 + 3]).toBeGreaterThan(0);
    expect(d.image[12 + 3]).toBeGreaterThan(0);
  });
});

describe('pct', () => {
  it('a share, or a dash when there was nothing to count', () => {
    expect(pct(1, 4)).toBe('25 %');
    expect(pct(0, 0)).toBe('—');
  });
});
