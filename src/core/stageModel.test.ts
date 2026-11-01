import { describe, expect, it } from 'vitest';
import type { JobView } from './model';
import { colmapFraction, frameNo, keptMarks, largestGap, newestFrames, num, radar, rail } from './stageModel';

const job = (over: Partial<JobView> = {}): JobView => ({
  id: 'j', video: 'v.mp4', quality: 'preview', step: 'frames', startedAt: 0, stepStartedAt: 0, framesTotal: null, framesKept: null,
  posesPlaced: null, coverageDeg: null, trainStep: null, trainSteps: 7000, cuda: true, outDir: 'x', error: null, ...over,
});
const states = (j: JobView) => rail(j).map((s) => `${s.step}:${s.state}`);

describe('the rail of steps', () => {
  it('the steps before are done, this one current, the rest next; the matte only for the object alone', () => {
    expect(states(job({ step: 'poses' }))).toEqual(['frames:done', 'poses:current', 'coverage:next', 'train:next']);
    expect(states(job({ step: 'matte', scope: 'object' }))).toEqual(['frames:done', 'poses:done', 'coverage:done', 'matte:current', 'train:next']);
  });

  it('a short turn waits on the turn; a finished job has every step done', () => {
    expect(states(job({ step: 'needsConfirm' }))).toEqual(['frames:done', 'poses:done', 'coverage:current', 'train:next']);
    expect(rail(job({ step: 'done' })).every((s) => s.state === 'done')).toBe(true);
  });

  it('a failure stops at the last step that measured something', () => {
    expect(states(job({ step: 'failed', posesPlaced: 12 }))[1]).toBe('poses:current');
    expect(states(job({ step: 'failed', posesPlaced: 100, coverageDeg: 320, trainStep: 3000 }))[3]).toBe('train:current');
    expect(states(job({ step: 'failed' }))[0]).toBe('frames:current');
  });
});

describe('frames', () => {
  it('a frame number comes from its name only; anything else is no number, never 0', () => {
    expect(frameNo('f00137.jpg')).toBe(137);
    expect(frameNo('f00137.png')).toBe(137);
    expect(frameNo('scene.ply')).toBeNull();
    expect(frameNo('f137.jpg')).toBeNull();
  });

  it('the strip leaves out the file ffmpeg may still be writing, and keeps it once the count is final', () => {
    const names = ['f00001.jpg', 'f00002.jpg', 'f00003.jpg', 'f00004.jpg'];
    expect(newestFrames(names, 2, true)).toEqual(['f00002.jpg', 'f00003.jpg']);
    expect(newestFrames(names, 2, false)).toEqual(['f00003.jpg', 'f00004.jpg']);
    expect(newestFrames([], 2, true)).toEqual([]);
  });

  it('a kept frame sits on the timeline where its number puts it; no total, no marks', () => {
    expect(keptMarks(5, ['f00001.jpg', 'f00003.jpg', 'f00005.jpg', 'odd.jpg'])).toEqual([0, 0.5, 1]);
    expect(keptMarks(null, ['f00001.jpg'])).toEqual([]);
    expect(keptMarks(0, ['f00001.jpg'])).toEqual([]);
  });
});

describe('COLMAP and numbers', () => {
  it('a count is a share of its total; the mapping, which prints none, has no share', () => {
    expect(colmapFraction({ phase: 'features', done: 25, of: 100 })).toBe(0.25);
    expect(colmapFraction({ phase: 'mapping', done: null, of: null })).toBeNull();
    expect(colmapFraction(null)).toBeNull();
    expect(colmapFraction({ phase: 'matching', done: 9, of: 4 })).toBe(1);
  });

  it('a missing number reads « — », never 0, and the host language groups the digits', () => {
    expect(num(null, 'en')).toBe('—');
    expect(num(Number.NaN, 'en')).toBe('—');
    expect(num(0, 'en')).toBe('0');
    expect(num(12400, 'en')).toBe('12,400');
    expect(num(12400, undefined)).toBe('12,400');
  });
});

describe('the radar', () => {
  // Cameras on a circle of radius 2 around (1, 1, 0), the vertical along z.
  const ring = (degs: number[]) => ({
    target: [1, 1, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number],
    cams: degs.map((d) => [1 + 2 * Math.cos((d * Math.PI) / 180), 1 + 2 * Math.sin((d * Math.PI) / 180), 0.5] as [number, number, number]),
  });

  it('cameras seen from above sit on the rim, at their own angles, 90° apart stays 90° apart', () => {
    const { dots } = radar(ring([0, 90, 180, 270]));
    expect(dots).toHaveLength(4);
    for (const d of dots) expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    const gaps = dots.map((d, i) => (dots[(i + 1) % 4]!.deg - d.deg + 360) % 360);
    for (const g of gaps) expect(g).toBeCloseTo(90, 6);
  });

  it('the widest unfilmed angle is found, across 0 too', () => {
    expect(largestGap([10, 20, 30, 250])).toEqual({ from: 30, to: 250 });
    expect(largestGap([10, 120, 240])).toEqual({ from: 240, to: 370 });
    expect(largestGap([10, 20])).toBeNull();
  });

  it('no file, no cameras, or no vertical: nothing is drawn', () => {
    expect(radar(null)).toEqual({ dots: [], gap: null });
    expect(radar({ ...ring([0, 90]), up: [0, 0, 0] })).toEqual({ dots: [], gap: null });
  });
});
