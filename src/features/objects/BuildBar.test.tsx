import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fill, words } from '../../i18n/words';
import type { ObjectEntry } from '../../core/model';

const host = vi.hoisted(() => ({ redo: vi.fn(), resume: vi.fn() }));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, redo: host.redo, resume: host.resume } };
});

import { BuildBar } from './BuildBar';

const w = words('fr');
const PLACE: ObjectEntry = {
  id: '20261113-185147-salle', createdAt: null, quality: 'full', scope: 'place', framesKept: 200, posesPlaced: 200, coverageDeg: null, sceneBytes: 1, thumb: null,
  paused: { step: 4_000, of: 60_000 },
};

describe('BuildBar', () => {
  afterEach(() => { cleanup(); host.redo.mockReset(); host.resume.mockReset(); vi.restoreAllMocks(); });

  it('a paused place says where it stopped, and « Resume » goes on from there, then shows the job', async () => {
    host.resume.mockResolvedValue({ id: 'job' });
    const onShowJob = vi.fn();
    render(<BuildBar w={w} lang="fr" o={PLACE} onShowJob={onShowJob} />);
    expect(screen.getByText(fill(w.objects.pausedAt, { step: '4 000', of: '60 000' }).replace(/ /g, ' '), { normalizer: (s) => s.replace(/[  ]/g, ' ') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.objects.resume }));
    await waitFor(() => expect(onShowJob).toHaveBeenCalled());
    expect(host.resume).toHaveBeenCalledWith(PLACE.id);
    expect(host.redo).not.toHaveBeenCalled();
  });

  it('a place stopped by a crash says so, and « Resume » goes on from its step as for a pause', async () => {
    host.resume.mockResolvedValue({ id: 'job' });
    const onShowJob = vi.fn();
    render(<BuildBar w={w} lang="fr" o={{ ...PLACE, paused: { step: 7_000, of: 60_000, reason: 'TRAIN_FAILED' } }} onShowJob={onShowJob} />);
    const say = (s: string) => s.replace(/[  ]/g, ' ');
    expect(screen.getByText(say(fill(w.objects.crashedAt, { step: '7 000', of: '60 000' })), { normalizer: say })).toBeInTheDocument();
    expect(screen.queryByText(/En pause/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.objects.resume }));
    await waitFor(() => expect(onShowJob).toHaveBeenCalled());
    expect(host.resume).toHaveBeenCalledWith(PLACE.id);
  });

  it('« Make again » in Quick or Full keeps the scope, and a place not paused offers no « Resume »', async () => {
    host.redo.mockResolvedValue({ id: 'job' });
    const onShowJob = vi.fn();
    render(<BuildBar w={w} lang="fr" o={{ ...PLACE, paused: null }} onShowJob={onShowJob} />);
    expect(screen.queryByRole('button', { name: w.objects.resume })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.objects.redoQuick }));
    await waitFor(() => expect(host.redo).toHaveBeenCalledWith(PLACE.id, 'preview', 'place'));
    fireEvent.click(screen.getByRole('button', { name: w.objects.redoFull }));
    await waitFor(() => expect(host.redo).toHaveBeenLastCalledWith(PLACE.id, 'full', 'place'));
  });

  it('a refusal of the host is said in words, and nothing is shown as started', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.resume.mockRejectedValue(new Error('ALREADY_RUNNING'));
    const onShowJob = vi.fn();
    render(<BuildBar w={w} lang="fr" o={PLACE} onShowJob={onShowJob} />);
    fireEvent.click(screen.getByRole('button', { name: w.objects.resume }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onShowJob).not.toHaveBeenCalled();
  });

  it('while a job of this gallery runs, the bar shows it and offers no start', () => {
    const onShowJob = vi.fn();
    render(<BuildBar w={w} lang="fr" o={PLACE} live onShowJob={onShowJob} />);
    expect(screen.getByText(w.create.placeRunning)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: w.objects.resume })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: w.objects.redoQuick })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.create.seeIt }));
    expect(onShowJob).toHaveBeenCalledTimes(1);
    expect(host.resume).not.toHaveBeenCalled();
  });

  it('refused because a job runs elsewhere: the refusal offers to show that job, another refusal does not', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.resume.mockRejectedValue(new Error('ALREADY_RUNNING'));
    const onShowJob = vi.fn();
    const { unmount } = render(<BuildBar w={w} lang="fr" o={PLACE} onShowJob={onShowJob} />);
    fireEvent.click(screen.getByRole('button', { name: w.objects.resume }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: w.create.seeIt }));
    expect(onShowJob).toHaveBeenCalledTimes(1);
    unmount();
    host.resume.mockRejectedValue(new Error('NOT_PAUSED'));
    render(<BuildBar w={w} lang="fr" o={PLACE} onShowJob={onShowJob} />);
    fireEvent.click(screen.getByRole('button', { name: w.objects.resume }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: w.create.seeIt })).not.toBeInTheDocument();
  });

  it('two clicks start one build', async () => {
    let answer: (v: unknown) => void = () => {};
    host.resume.mockImplementation(() => new Promise((r) => { answer = r; }));
    render(<BuildBar w={w} lang="fr" o={PLACE} onShowJob={vi.fn()} />);
    const b = screen.getByRole('button', { name: w.objects.resume });
    fireEvent.click(b);
    fireEvent.click(b);
    expect(host.resume).toHaveBeenCalledTimes(1);
    answer({ id: 'job' });
  });
});
