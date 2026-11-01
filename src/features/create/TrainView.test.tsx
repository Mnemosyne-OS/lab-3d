/**
 * The training view (doc 176 §17): Brush prints nothing, so before its first
 * file there is no step to show. The view says when the first preview comes
 * and how long Brush has been at it, never « 0 % » or « step 0 ».
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fill, words } from '../../i18n/words';
import type { JobView } from '../../core/model';

vi.mock('../../host/useHostFiles', () => ({ useRig: () => null, useFileUrl: () => ({ url: null, failed: false }), useFrameNames: () => [] }));
vi.mock('./LivePreview', () => ({ LivePreview: ({ step }: { step: number }) => <div>live cloud at {step}</div> }));

import { TrainView } from './StepViews';

const w = words('en');
const now = 1_000_000;
const job = (over: Partial<JobView>): JobView => ({
  id: 'j', video: 'C:/v', quality: 'full', scope: 'scene', step: 'train', startedAt: now - 600_000, stepStartedAt: now - 107_000,
  framesTotal: 37, framesKept: 37, posesPlaced: 37, coverageDeg: 331, trainStep: 0, trainStepAt: now - 107_000, trainSteps: 30_000,
  cuda: true, outDir: 'C:/o', error: null, liveStep: null, trainExportEvery: 1000, ...over,
});

describe('TrainView', () => {
  afterEach(cleanup);

  it('before the first file, says when the object comes and for how long Brush has worked, never 0 %', () => {
    render(<TrainView job={job({})} id="j" w={w} lang="en" now={now} />);
    expect(screen.getByText(fill(w.create.trainWorking, { step: '1,000' }))).toBeInTheDocument();
    expect(screen.getByText(fill(w.create.trainFirst, { step: '1,000' }))).toBeInTheDocument();
    expect(screen.getByText(fill(w.create.trainFor, { t: '1:47' }))).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText(fill(w.create.trainStep, { step: '0', steps: '30,000' }))).toBeNull();
  });

  it('once Brush wrote a file, shows its step and share', () => {
    render(<TrainView job={job({ trainStep: 3000, trainStepAt: now - 5000, liveStep: 3000 })} id="j" w={w} lang="en" now={now} />);
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText(fill(w.create.trainStep, { step: '3,000', steps: '30,000' }))).toBeInTheDocument();
    expect(screen.getByText('live cloud at 3000')).toBeInTheDocument();
  });

  it('on a host that does not say the export step, still says Brush works', () => {
    render(<TrainView job={job({ trainExportEvery: undefined })} id="j" w={w} lang="en" now={now} />);
    expect(screen.getByText(w.create.trainWorkingSoon)).toBeInTheDocument();
  });
});

describe('TrainView full view', () => {
  afterEach(cleanup);

  it('the cloud being built opens as big as the window, and Escape brings it back', () => {
    const { container } = render(<TrainView job={job({ trainStep: 3000, trainStepAt: now - 5000, liveStep: 3000 })} id="j" w={w} lang="en" now={now} />);
    const panel = () => container.querySelector('.job-main.live');
    expect(panel()).not.toHaveClass('full');
    fireEvent.click(screen.getByRole('button', { name: w.create.liveFull }));
    expect(panel()).toHaveClass('full');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(panel()).not.toHaveClass('full');
  });
});
