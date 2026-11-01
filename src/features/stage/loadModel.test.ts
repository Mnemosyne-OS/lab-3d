import { describe, expect, it } from 'vitest';
import { failureKind, loadRail } from './loadModel';

const labels = { read: 'Read', decode: 'Decode', stage: 'Stage' };

describe('loadRail', () => {
  it('shows the share read while the bytes arrive, nothing else yet', () => {
    const rail = loadRail(0, false, {}, '42 %', labels, 'en');
    expect(rail.map((s) => s.state)).toEqual(['active', 'pending', 'pending']);
    expect(rail.map((s) => s.detail)).toEqual(['42 %', undefined, undefined]);
  });

  it('a finished phase says how long it took, never an unknown share', () => {
    const rail = loadRail(1, false, { read: 12 }, '', labels, 'en');
    expect(rail.map((s) => s.detail)).toEqual(['12 ms', undefined, undefined]);
    expect(loadRail(0, false, {}, '', labels, 'en')[0]!.detail).toBeUndefined();
  });

  it('the phase that stopped is the failed one, the ones before keep their time', () => {
    const rail = loadRail(1, true, { read: 1500 }, '', labels, 'fr');
    expect(rail.map((s) => s.state)).toEqual(['done', 'failed', 'pending']);
    expect(rail[0]!.detail).toBe('1,5 s');
  });
});

describe('failureKind', () => {
  it('a scene without points is said as such wherever it stopped', () => {
    expect(failureKind('EMPTY_SCENE', 1)).toBe('empty');
    expect(failureKind('READ_TIMEOUT', 0)).toBe('read');
    expect(failureKind('Invalid SPZ', 1)).toBe('decode');
  });
});
