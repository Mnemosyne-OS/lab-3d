import { describe, expect, it, vi } from 'vitest';
import { clock, groupVersions, idDate, idName, isRunning, mattePct, readWhole, sceneFiles, size, stepsOf, trainPct, trainTiming, weightRows, type JobView, type ObjectEntry, type Piece } from './model';

/** A fake `splat.read` over `bytes`, `chunk` bytes a piece. */
function reader(bytes: Uint8Array, chunk: number) {
  return vi.fn(async (offset: number): Promise<Piece> => {
    const part = bytes.subarray(offset, offset + chunk);
    return { base64: btoa(String.fromCharCode(...part)), offset, length: part.length, total: bytes.length };
  });
}

const job = (over: Partial<JobView> = {}): JobView => ({
  id: 'j', video: 'v.mp4', quality: 'preview', step: 'train', startedAt: 0, stepStartedAt: 0,
  framesTotal: 300, framesKept: 100, posesPlaced: 100, coverageDeg: 345,
  trainStep: null, trainSteps: 7000, cuda: true, outDir: 'x', error: null, ...over,
});

describe('readWhole', () => {
  it('assembles the pieces in order up to the size the host said', async () => {
    const bytes = Uint8Array.from({ length: 23 }, (_, i) => i * 7);
    const read = reader(bytes, 5);
    const progress: number[] = [];
    const r = await readWhole(read, (f) => progress.push(f));
    expect(r).toEqual({ ok: true, bytes });
    expect(read).toHaveBeenCalledTimes(5);
    expect(read.mock.calls.map((c) => c[0])).toEqual([0, 5, 10, 15, 20]);
    expect(progress.at(-1)).toBe(1);
  });

  it('stops on a piece that does not advance, never loops', async () => {
    const read = vi.fn(async (): Promise<Piece> => ({ base64: '', offset: 0, length: 0, total: 10 }));
    expect(await readWhole(read)).toEqual({ ok: false, error: 'STALLED' });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('gives up after a bounded number of pieces', async () => {
    const read = reader(new Uint8Array(1000), 1);
    expect(await readWhole(read)).toEqual({ ok: false, error: 'TOO_MANY_PIECES' });
  });

  it('says why a read was refused', async () => {
    const read = vi.fn(async (): Promise<Piece> => { throw new Error('NOT_FOUND'); });
    expect(await readWhole(read)).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('reads an empty file as empty', async () => {
    expect(await readWhole(reader(new Uint8Array(0), 5))).toEqual({ ok: true, bytes: new Uint8Array(0) });
  });
});

describe('job numbers', () => {
  it('a running job is one of the four steps, nothing else', () => {
    expect(isRunning(null)).toBe(false);
    for (const step of ['frames', 'poses', 'coverage', 'train'] as const) expect(isRunning(job({ step }))).toBe(true);
    for (const step of ['done', 'needsConfirm', 'failed', 'cancelled'] as const) expect(isRunning(job({ step }))).toBe(false);
  });

  it('no bar before Brush wrote its first step', () => {
    expect(trainPct(job())).toBeNull();
    expect(trainPct(job({ trainStep: 1400 }))).toBe(20);
    expect(trainPct(job({ trainStep: 9000 }))).toBe(100);
  });

  it('formats a clock and a size', () => {
    expect(clock(247_000)).toBe('4:07');
    expect(clock(3_750_000)).toBe('1:02:30');
    expect(clock(-5)).toBe('0:00');
    expect(size(9_650_000)).toBe('9.2 MB');
    expect(size(300)).toBe('1 KB');
  });

  it('opens the scene the manifest names, the other file second; an old object is its .ply', () => {
    expect(sceneFiles({ version: 2, files: { scene: 'scene.spz' } })).toEqual(['scene.spz', 'scene.ply']);
    expect(sceneFiles({ version: 2, files: { scene: 'scene.ply' } })).toEqual(['scene.ply', 'scene.spz']);
    expect(sceneFiles({ version: 1, files: { scene: 'scene.ply' } })).toEqual(['scene.ply', 'scene.spz']);
    expect(sceneFiles(null)).toEqual(['scene.ply', 'scene.spz']);
    expect(sceneFiles({ files: { scene: '../x' } })).toEqual(['scene.ply', 'scene.spz']);
  });

  it('reads the date and the name in a folder id', () => {
    expect(idDate('20261021-103903-Bottines-salon')).toEqual(new Date(2026, 9, 21, 10, 39, 3));
    expect(idDate('mon-objet')).toBeNull();
    expect(idName('20261021-103903-Bottines-salon')).toBe('Bottines salon');
    expect(idName('20261021-103903')).toBe('20261021-103903');
  });

  it('the matte is a step of the object alone only, and a host without scope is the whole scene', () => {
    expect(stepsOf(job({ scope: 'object' }))).toEqual(['frames', 'poses', 'coverage', 'matte', 'train']);
    expect(stepsOf(job({ scope: 'scene' }))).toEqual(['frames', 'poses', 'coverage', 'train']);
    expect(stepsOf(job())).toEqual(['frames', 'poses', 'coverage', 'train']);
    expect(isRunning(job({ step: 'matte' }))).toBe(true);
  });

  it('the weight rows: heaviest first, unreadable rows left out, no total from nothing', () => {
    expect(weightRows(undefined)).toBeNull();
    expect(weightRows({})).toBeNull();
    const r = weightRows({ scene: { files: 1, bytes: 10 }, framesAll: { files: 3, bytes: 500 }, video: { files: 1, bytes: Number.NaN } })!;
    expect(r.rows.map((x) => x.key)).toEqual(['framesAll', 'scene']);
    expect(r.total).toBe(510);
    expect(size(0)).toBe('0 KB');
    expect(size(2_147_483_648)).toBe('2.00 GB');
  });

  it('the train timing: how long ago Brush last wrote, and the time left at the measured pace', () => {
    // Step began at 0; 18 000 of 30 000 measured at 18 min; now 19 min.
    const v = { trainStep: 18_000, trainStepAt: 18 * 60_000, trainSteps: 30_000, stepStartedAt: 0 };
    expect(trainTiming(v, 19 * 60_000)).toEqual({ sinceMs: 60_000, leftMs: 12 * 60_000 - 60_000 });
    expect(trainTiming({ ...v, trainStep: 0, trainStepAt: 0 }, 30_000)).toEqual({ sinceMs: 30_000, leftMs: null });
    expect(trainTiming(v, 40 * 60_000)!.leftMs).toBeNull();
    expect(trainTiming({ ...v, trainStepAt: null }, 1)).toBeNull();
  });

  it('the matte bar exists only once a count was measured', () => {
    expect(mattePct(job())).toBeNull();
    expect(mattePct(job({ framesMatted: 0, matteTotal: 0 }))).toBeNull();
    expect(mattePct(job({ framesMatted: 0, matteTotal: 95 }))).toBe(0);
    expect(mattePct(job({ framesMatted: 57, matteTotal: 95 }))).toBe(60);
  });
});

describe('versions', () => {
  const entry = (id: string, over: Partial<ObjectEntry> = {}): ObjectEntry => ({
    id, createdAt: null, quality: 'preview', framesKept: 100, posesPlaced: 100, coverageDeg: 320, sceneBytes: 1, thumb: null, ...over,
  });

  it('one group per object, in the order of its newest version; the main is the one the host marked', () => {
    const groups = groupVersions([
      entry('20261022-120000-boots', { versionOf: '20261021-100000-boots', main: false }),
      entry('20261022-090000-vase', { versionOf: '20261022-090000-vase', main: true }),
      entry('20261021-110000-boots', { versionOf: '20261021-100000-boots', main: true }),
      entry('20261021-100000-boots', { versionOf: '20261021-100000-boots', main: false }),
    ]);
    expect(groups.map((g) => [g.key, g.main.id, g.versions.length])).toEqual([
      ['20261021-100000-boots', '20261021-110000-boots', 3],
      ['20261022-090000-vase', '20261022-090000-vase', 1],
    ]);
  });

  it('whatever order the host sends, versions and groups go newest first', () => {
    const groups = groupVersions([
      entry('20261021-100000-boots', { versionOf: 'a' }), entry('20261020-090000-vase'), entry('20261022-120000-boots', { versionOf: 'a' }),
    ]);
    expect(groups.map((g) => g.versions.map((v) => v.id))).toEqual([['20261022-120000-boots', '20261021-100000-boots'], ['20261020-090000-vase']]);
    expect(groups[0]!.main.id).toBe('20261022-120000-boots');
  });

  it('no version marked main: the newest shows', () => {
    const groups = groupVersions([entry('b', { versionOf: 'a' }), entry('a', { versionOf: 'a' })]);
    expect(groups[0]!.main.id).toBe('b');
  });

  it('a host older than versions: each object alone, as before', () => {
    expect(groupVersions([entry('b'), entry('a')]).map((g) => [g.key, g.main.id, g.versions.length])).toEqual([['b', 'b', 1], ['a', 'a', 1]]);
  });
});
