import { describe, expect, it } from 'vitest';
import type { JobView } from '../../core/model';
import type { EngineStatus } from '../../host/doors';
import { MAX_FRAME_CHOICE, MIN_FRAME_CHOICE, describeError, elapsedMs, engineVerdict, jobRail, madeScope, readFrameChoice, sourceName, stepLabels } from './createModel';

const labels = { frames: 'Frames', poses: 'Placement', coverage: 'Turn', matte: 'Cut-out', train: '3D object' };

function job(over: Partial<JobView>): JobView {
  return {
    id: 'j', video: 'C:\\Users\\t\\Videos\\vase.mp4', quality: 'full', scope: 'object', step: 'frames',
    startedAt: 1_000, stepStartedAt: 5_000, framesTotal: null, framesKept: null, posesPlaced: null, coverageDeg: null,
    trainStep: null, trainSteps: 30_000, cuda: true, outDir: 'C:\\x\\20261021-vase', error: null, ...over,
  };
}

const engine = (over: Partial<EngineStatus>): EngineStatus => ({ supported: true, installed: true, ffmpegInstalled: true, job: null, ...over });

describe('engineVerdict', () => {
  it('names the one thing missing, in the order it blocks', () => {
    expect(engineVerdict(engine({ supported: false, installed: false }))).toBe('unsupported');
    expect(engineVerdict(engine({ installed: false }))).toBe('notInstalled');
    expect(engineVerdict(engine({ ffmpegInstalled: false }))).toBe('noFrames');
    expect(engineVerdict(engine({ ffmpegInstalled: false, framesReader: 'chromium' }))).toBe('ready');
    expect(engineVerdict(engine({}))).toBe('ready');
  });
});

describe('jobRail', () => {
  it('a step being read shows the count so far, the ones ahead show nothing', () => {
    const r = jobRail(job({ framesSeen: 212 }), labels, 'en');
    expect(r.map((s) => s.state)).toEqual(['active', 'pending', 'pending', 'pending', 'pending']);
    expect(r.map((s) => s.detail)).toEqual(['212', undefined, undefined, undefined, undefined]);
  });

  it('each finished step says what it measured', () => {
    const r = jobRail(job({ step: 'train', framesKept: 100, framesTotal: 484, posesPlaced: 97, coverageDeg: 320, framesMatted: 100, matteTotal: 100, trainStep: 12_000 }), labels, 'en');
    expect(r.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'active']);
    expect(r.map((s) => s.detail)).toEqual(['100 / 484', '97 / 100', '320°', '100 %', '40 %']);
  });

  it('the whole scene has no cut-out step, and COLMAP counts while it places', () => {
    const r = jobRail(job({ scope: 'scene', step: 'poses', framesKept: 100, framesTotal: 484, colmap: { phase: 'features', done: 37, of: 100 } }), labels, 'en');
    expect(r.map((s) => s.id)).toEqual(['frames', 'poses', 'coverage', 'train']);
    expect(r[1]!.detail).toBe('37 / 100');
  });

  it('a failed job lights the step it stopped at in red', () => {
    const r = jobRail(job({ step: 'failed', framesKept: 100, framesTotal: 484, posesPlaced: 12, error: 'POSES_FAILED: 12/100' }), labels, 'en');
    expect(r.find((s) => s.state === 'failed')?.id).toBe('poses');
  });

  it('a step ahead says nothing, even with a number left from an earlier pass', () => {
    const r = jobRail(job({ step: 'poses', framesKept: 100, framesTotal: 484, coverageDeg: 320, trainStep: 30_000 }), labels, 'en');
    expect(r.map((s) => s.state)).toEqual(['done', 'active', 'pending', 'pending', 'pending']);
    expect(r.slice(2).map((s) => s.detail)).toEqual([undefined, undefined, undefined]);
  });

  it('a step not measured yet says nothing, never a zero', () => {
    const r = jobRail(job({ step: 'train', framesKept: 100, framesTotal: 484, posesPlaced: 100, coverageDeg: 320, framesMatted: 100, matteTotal: 100 }), labels, 'en');
    expect(r[4]!.detail).toBeUndefined();
  });
});

describe('a place', () => {
  it('needs only the 3D engine: kept when the cut-out cannot run, where the object alone falls back to the scene', () => {
    expect(madeScope('place', false)).toBe('place');
    expect(madeScope('object', false)).toBe('scene');
    expect(madeScope('object', true)).toBe('object');
  });

  it('measures a path, not a turn: its step has its own word and says no arc', () => {
    expect(stepLabels('place', labels, { coverage: 'Path', train: '3D place' })).toMatchObject({ coverage: 'Path', train: '3D place', poses: labels.poses });
    expect(stepLabels('scene', labels, { coverage: 'Path' })).toBe(labels);
    const r = jobRail(job({ scope: 'place', step: 'train', framesKept: 100, framesTotal: 484, posesPlaced: 97, coverageDeg: 140, trainStep: 12_000 }), stepLabels('place', labels, { coverage: 'Path' }), 'en');
    expect(r.map((s) => s.id)).toEqual(['frames', 'poses', 'coverage', 'train']);
    expect(r[2]!.label).toBe('Path');
    expect(r[2]!.detail).toBeUndefined();
  });
});

describe('the number of images', () => {
  it('100 unless a number was chosen, and a number is brought within the bounds', () => {
    expect(readFrameChoice('auto')).toBe(100);
    expect(readFrameChoice(null)).toBe(100);
    expect(readFrameChoice('')).toBe(100);
    expect(readFrameChoice('beaucoup')).toBe(100);
    expect(readFrameChoice('250')).toBe(250);
    expect(readFrameChoice(249.6)).toBe(250);
    expect(readFrameChoice('5')).toBe(MIN_FRAME_CHOICE);
    expect(readFrameChoice('1000')).toBe(MAX_FRAME_CHOICE);
  });
});

describe('the clock and the title', () => {
  it('runs while the job runs and stops at its last step once ended', () => {
    expect(elapsedMs(job({ step: 'poses' }), 61_000)).toBe(60_000);
    expect(elapsedMs(job({ step: 'done' }), 61_000)).toBe(4_000);
  });

  it('names the source by its file', () => {
    expect(sourceName('C:\\Users\\t\\Videos\\vase.mp4')).toBe('vase.mp4');
    expect(sourceName('/home/t/photos/vase/')).toBe('vase');
  });
});

describe('describeError', () => {
  const sentences = { POSES_FAILED: 'Too few placed ({detail}).', COVERAGE_FAILED: 'No turn.' };
  it('finds the sentence by code, sub-step or not, and keeps an unknown text as written', () => {
    expect(describeError('POSES_FAILED (matching): 12/100', sentences)).toBe('Too few placed (12/100).');
    // A sub-step with its own sentence takes it.
    expect(describeError('POSES_FAILED (features): x', { ...sentences, 'POSES_FAILED (features)': 'Photos not read ({detail}).' })).toBe('Photos not read (x).');
    expect(describeError('COVERAGE_FAILED', sentences)).toBe('No turn.');
    expect(describeError('SOMETHING_NEW: x', sentences)).toBe('SOMETHING_NEW: x');
  });
});
