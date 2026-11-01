/**
 * The placing view (doc 163): COLMAP's frames light up as it reads them. When
 * it falls silent while it should be counting (26/10: 30 min frozen on the
 * graphics card), the view says for how long, instead of frames that never move.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { fill, words } from '../../i18n/words';
import type { ColmapProgress, JobView } from '../../core/model';

vi.mock('../../host/useHostFiles', () => ({ useRig: () => null, useFileUrl: () => ({ url: null, failed: false }), useFrameNames: () => ['f00001.jpg', 'f00002.jpg'] }));

import { PosesView } from './StepViews';

const w = words('en');
const t0 = 1_000_000;
const job = (colmap: ColmapProgress | null): JobView => ({
  id: 'j', video: 'C:/v', quality: 'full', scope: 'place', step: 'poses', startedAt: t0, stepStartedAt: t0,
  framesTotal: 2, framesKept: 2, posesPlaced: null, coverageDeg: null, trainStep: null, trainStepAt: null, trainSteps: 30_000,
  cuda: true, outDir: 'C:/o', error: null, colmap,
});
const silent = (t: string) => fill(w.create.colmapSilent, { t });

describe('PosesView', () => {
  beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(t0); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('says the silence once COLMAP printed nothing new for a minute, and forgets it at the next frame', () => {
    const c: ColmapProgress = { phase: 'features', done: 1, of: 2, points: { 'f00001.jpg': 900 } };
    const r = render(<PosesView job={job(c)} id="j" w={w} lang="en" now={t0 + 59_000} />);
    expect(screen.queryByText(silent('0:59'))).toBeNull();
    // A new poll hands a new object saying the same: still silent.
    r.rerender(<PosesView job={job({ ...c, points: { ...c.points } })} id="j" w={w} lang="en" now={t0 + 61_000} />);
    expect(screen.getByText(silent('1:01'))).toBeInTheDocument();
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 62_000);
    r.rerender(<PosesView job={job({ phase: 'features', done: 2, of: 2, points: { ...c.points, 'f00002.jpg': 800 } })} id="j" w={w} lang="en" now={t0 + 62_000} />);
    expect(screen.queryByText(/COLMAP/)).toBeNull();
  });

  it('the mapping prints nothing that counts: its quiet is never called a silence', () => {
    render(<PosesView job={job({ phase: 'mapping', done: null, of: null, points: {} })} id="j" w={w} lang="en" now={t0 + 10 * 60_000} />);
    expect(screen.queryByText(/COLMAP/)).toBeNull();
  });
});
