import { describe, expect, it } from 'vitest';
import { fovForAspect, frameDistance, robustBounds, sampleStride } from './frameModel';

describe('fovForAspect', () => {
  it('keeps the field on a landscape window and widens it on a portrait one', () => {
    expect(fovForAspect(50, 16 / 9)).toBe(50);
    expect(fovForAspect(50, 1)).toBe(50);
    // At aspect 0.5 the horizontal field must stay 50°: tan(h/2) = tan(v/2) * aspect.
    const v = fovForAspect(50, 0.5);
    expect(Math.atan(Math.tan((v * Math.PI) / 360) * 0.5) * 360 / Math.PI).toBeCloseTo(50, 6);
  });

  it('never opens past its bound, and an unknown shape keeps the field', () => {
    expect(fovForAspect(50, 0.05)).toBe(100);
    expect(fovForAspect(50, 0)).toBe(50);
    expect(fovForAspect(50, Number.NaN)).toBe(50);
  });
});

describe('robustBounds', () => {
  it('frames the cloud, not the floaters far from it', () => {
    const pts: number[] = [];
    for (let i = 0; i < 1000; i++) pts.push((i % 10) / 10, ((i / 10) % 10) / 10, (i % 7) / 7);
    // Ten floaters a hundred units away.
    for (let i = 0; i < 10; i++) pts.push(100, 100, 100);
    const b = robustBounds(pts)!;
    expect(b.center[0]).toBeCloseTo(0.45, 1);
    expect(b.radius).toBeLessThan(2);
  });

  it('a single point still has a distance to look from', () => {
    expect(robustBounds([1, 2, 3])).toEqual({ center: [1, 2, 3], radius: 1 });
  });

  it('nothing to frame is null, never a box at the origin', () => {
    expect(robustBounds([])).toBeNull();
    expect(robustBounds([NaN, 0, 0, 1, 1, 1])).toBeNull();
  });
});

describe('frameDistance', () => {
  it('a wide view fits through the vertical field, a tall one through the horizontal', () => {
    const wide = frameDistance(1, 60, 2);
    const tall = frameDistance(1, 60, 0.5);
    expect(wide).toBeCloseTo(1.15 / Math.sin(Math.PI / 6), 6);
    expect(tall).toBeGreaterThan(wide);
  });
});

describe('sampleStride', () => {
  it('reads everything when it fits, a stride past the ceiling', () => {
    expect(sampleStride(1000, 200_000)).toBe(1);
    expect(sampleStride(1_000_000, 200_000)).toBe(5);
    expect(sampleStride(1_000_001, 200_000)).toBe(6);
  });
});
