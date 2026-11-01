import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fill, words } from '../../i18n/words';
import type { JobView } from '../../core/model';
import type { EngineStatus } from '../../host/doors';
import { inMnemosyne, type HostState } from '../../host/hostState';
import type { Gallery } from '../objects/libraryModel';

const host = vi.hoisted(() => ({
  status: vi.fn(), pickVideo: vi.fn(), pickPhotos: vi.fn(), start: vi.fn(), startPhotos: vi.fn(),
  continueJob: vi.fn(), cancel: vi.fn(), openSettings: vi.fn(), frames: vi.fn(), read: vi.fn(), readPicture: vi.fn(),
}));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: host };
});
vi.mock('../../engine/SplatStage', () => ({
  SplatStage: class { async load() { return { splats: 1, grounded: false, viewpoints: 0 }; } setAutoRotate() {} close() {} dispose() {} },
}));

vi.mock('../phone/PhoneCapture', () => ({
  PhoneCapture: ({ continueSeries }: { continueSeries?: string | null }) => <div>phone capture screen{continueSeries ? ` going on with ${continueSeries}` : ''}</div>,
}));
vi.mock('../phone/SeriesAfterJob', () => ({
  SeriesAfterJob: ({ photosDir }: { photosDir: string }) => <div>where do the photos of {photosDir} go</div>,
}));

import { CreateTab } from './CreateTab';
import { useEngine } from './useEngine';

const w = words('en');
const MNEMO: HostState = { kind: 'mnemosyne', capabilities: [], platform: 'win32' };
const engine = (over: Partial<EngineStatus> = {}): EngineStatus => ({ supported: true, installed: true, ffmpegInstalled: true, objectOnly: 'ready', job: null, ...over });
const job = (over: Partial<JobView>): JobView => ({
  id: 'job-1', video: 'C:\\Users\\t\\Videos\\vase.mp4', quality: 'full', scope: 'object', step: 'frames',
  startedAt: Date.now() - 60_000, stepStartedAt: Date.now() - 5_000, framesTotal: null, framesKept: null, posesPlaced: null, coverageDeg: null,
  trainStep: null, trainSteps: 30_000, cuda: true, outDir: 'C:\\Users\\t\\.mnemosyne\\generations\\splats\\20261022-vase', error: null, ...over,
});

// The app holds the engine for both galleries; here one view holds it alone.
function Held({ h, gallery, shown, onView, onBack, onShowJob }: {
  h: HostState | null; gallery: Gallery; shown: boolean; onView: () => void; onBack: () => void; onShowJob: (g: Gallery) => void;
}) {
  const { status, refresh } = useEngine(h !== null && inMnemosyne(h));
  return <CreateTab w={w} lang="en" host={h} gallery={gallery} shown={shown} status={status} refresh={refresh} onView={onView} onBack={onBack} onShowJob={onShowJob} />;
}

function renderTab(h: HostState | null = MNEMO, gallery: Gallery = 'objects', shown = true) {
  const onView = vi.fn();
  const onBack = vi.fn();
  const onShowJob = vi.fn();
  const r = render(<Held h={h} gallery={gallery} shown={shown} onView={onView} onBack={onBack} onShowJob={onShowJob} />);
  return { ...r, onView, onBack, onShowJob };
}

describe('CreateTab', () => {
  afterEach(() => {
    cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks();
    for (const f of Object.values(host)) f.mockReset();
  });

  it('outside Mnemosyne says what it needs and asks the host nothing', () => {
    renderTab({ kind: 'foreign' });
    expect(screen.getByText(w.locked.title)).toBeInTheDocument();
    expect(host.status).not.toHaveBeenCalled();
  });

  it('an engine not installed names it and opens the settings where it installs', async () => {
    host.status.mockResolvedValue(engine({ installed: false }));
    host.openSettings.mockResolvedValue({ page: 'video' });
    renderTab();
    expect(await screen.findByText(w.create.notInstalled)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.create.openVideoSettings }));
    expect(host.openSettings).toHaveBeenCalledWith('video');
  });

  it('starts from a video with the choices shown, and the whole scene when the object alone cannot run', async () => {
    localStorage.setItem('lab3d.scope', 'object');
    host.status.mockResolvedValueOnce(engine({ objectOnly: 'noMatte' })).mockResolvedValue(engine({ job: job({}) }));
    host.pickVideo.mockResolvedValue({ path: 'C:/Users/t/Videos/vase.mp4' });
    host.start.mockResolvedValue(job({}));
    host.frames.mockResolvedValue({ names: [] });
    renderTab();
    fireEvent.click(await screen.findByRole('radio', { name: new RegExp(w.create.full) }));
    expect(screen.getByRole('radio', { name: new RegExp(w.create.scopeObject) })).toBeDisabled();
    expect(screen.getByText(w.create.objectNoMatte)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.video) }));
    expect(await screen.findByText('vase.mp4')).toBeInTheDocument();
    expect(host.start).toHaveBeenCalledWith('C:/Users/t/Videos/vase.mp4', 'full', 'scene', undefined);
    expect(localStorage.getItem('lab3d.quality')).toBe('full');
  });

  it('offers the phone only on a host that announces it, and tells an older host to update', async () => {
    host.status.mockResolvedValue(engine());
    const r = renderTab();
    expect(await screen.findByText(w.phone.needsUpdate)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(w.phone.source) })).toBeNull();
    r.unmount();
    renderTab({ kind: 'mnemosyne', capabilities: ['phone.photos'], platform: 'win32' });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(w.phone.source) }));
    expect(await screen.findByText('phone capture screen')).toBeInTheDocument();
    expect(screen.queryByText(w.phone.needsUpdate)).toBeNull();
    // Back from the phone is back to the form, not out of Create.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.newObject) }));
    expect(await screen.findByRole('button', { name: new RegExp(w.phone.source) })).toBeInTheDocument();
  });

  it('the places make a place, with no choice of what to keep, even when the object alone cannot run', async () => {
    localStorage.setItem('lab3d.scope', 'object');
    host.status.mockResolvedValueOnce(engine({ objectOnly: 'noMatte' })).mockResolvedValue(engine({ job: job({ scope: 'place' }) }));
    host.pickPhotos.mockResolvedValue({ path: 'C:/Users/t/Pictures/jardin' });
    host.startPhotos.mockResolvedValue(job({ scope: 'place' }));
    host.frames.mockResolvedValue({ names: [] });
    renderTab(MNEMO, 'places');
    expect(await screen.findByText(w.create.photosSubPlace)).toBeInTheDocument();
    expect(screen.getByText(w.create.videoSubPlace)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: w.create.newPlace })).toBeInTheDocument();
    // Nothing to choose: no scope group, and the object alone's missing engine is not this gallery's business.
    expect(screen.queryByRole('radiogroup', { name: w.create.scope })).not.toBeInTheDocument();
    expect(screen.queryByText(w.create.objectNoMatte)).not.toBeInTheDocument();
    // The preview of the steps already says « path », no cut-out, and it ends as a place, never a 3D object.
    expect(screen.getByText(w.create.placeSteps.coverage)).toBeInTheDocument();
    expect(screen.queryByText(w.create.steps.matte)).not.toBeInTheDocument();
    expect(screen.getByText(w.create.placeSteps.train)).toBeInTheDocument();
    expect(screen.queryByText(w.create.steps.train)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.photos) }));
    await screen.findByText(w.create.placeSteps.coverage);
    expect(host.startPhotos).toHaveBeenCalledWith('C:/Users/t/Pictures/jardin', 'preview', 'place', undefined);
    // The objects' remembered choice is the objects' own.
    expect(localStorage.getItem('lab3d.scope')).toBe('object');
  });

  it('the objects offer the scene and the object alone, never a place, and a place remembered from before is the scene', async () => {
    localStorage.setItem('lab3d.scope', 'place');
    host.status.mockResolvedValueOnce(engine()).mockResolvedValue(engine({ job: job({ scope: 'scene' }) }));
    host.pickVideo.mockResolvedValue({ path: 'C:/v.mp4' });
    host.start.mockResolvedValue(job({ scope: 'scene' }));
    host.frames.mockResolvedValue({ names: [] });
    renderTab(MNEMO, 'objects');
    const group = await screen.findByRole('radiogroup', { name: w.create.scope });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(screen.queryByRole('radio', { name: new RegExp(w.create.scopePlace) })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: new RegExp(w.create.scopeScene) })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { name: w.create.newObject })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.video) }));
    await screen.findByText('vase.mp4');
    expect(host.start).toHaveBeenCalledWith('C:/v.mp4', 'preview', 'scene', undefined);
  });

  it('each gallery remembers its own quality and image count', async () => {
    host.status.mockResolvedValue(engine());
    const first = renderTab(MNEMO, 'places');
    fireEvent.click(await screen.findByRole('radio', { name: /^400/ }));
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(w.create.full) }));
    expect(localStorage.getItem('lab3d.frames.places')).toBe('400');
    expect(localStorage.getItem('lab3d.quality.places')).toBe('full');
    first.unmount();
    renderTab(MNEMO, 'objects');
    expect(await screen.findByRole('radio', { name: /^100/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: new RegExp(w.create.quick) })).toHaveAttribute('aria-checked', 'true');
  });

  it('the other gallery’s job is said with a way to it, never drawn under this gallery’s name', async () => {
    host.status.mockResolvedValue(engine({ job: job({ scope: 'place', step: 'poses', framesKept: 100, framesTotal: 400 }) }));
    host.frames.mockResolvedValue({ names: [] });
    const { onShowJob } = renderTab(MNEMO, 'objects');
    expect(await screen.findByText(w.create.placeRunning)).toBeInTheDocument();
    // Neither the form (the host would refuse a second job) nor the place's stage.
    expect(screen.queryByRole('button', { name: new RegExp(w.create.video) })).not.toBeInTheDocument();
    expect(screen.queryByText('100 / 400')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.create.seeIt }));
    expect(onShowJob).toHaveBeenCalledWith('places');
  });

  it('an ended job of the other gallery does not stand in the way: the form shows', async () => {
    host.status.mockResolvedValue(engine({ job: job({ scope: 'object', step: 'done', framesKept: 100, posesPlaced: 100 }) }));
    renderTab(MNEMO, 'places');
    expect(await screen.findByText(w.create.photosSubPlace)).toBeInTheDocument();
    expect(screen.queryByText(w.create.objectRunning)).not.toBeInTheDocument();
  });

  it('hidden, it draws nothing and fetches no previews of a running job', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'frames', framesTotal: 400 }) }));
    host.frames.mockResolvedValue({ names: [] });
    renderTab(MNEMO, 'objects', false);
    await waitFor(() => expect(host.status).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText('vase.mp4')).not.toBeInTheDocument();
    expect(host.frames).not.toHaveBeenCalled();
  });

  it('the back button leads to the gallery, named as the tab is', async () => {
    host.status.mockResolvedValue(engine());
    const { onBack } = renderTab(MNEMO, 'places');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(w.tabs.places) }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('100 by default, sent as nothing: an older host keeps 100 as well', async () => {
    host.status.mockResolvedValueOnce(engine()).mockResolvedValue(engine({ job: job({}) }));
    host.pickVideo.mockResolvedValue({ path: 'C:/v.mp4' });
    host.start.mockResolvedValue(job({}));
    host.frames.mockResolvedValue({ names: [] });
    renderTab();
    expect(await screen.findByRole('radio', { name: /^100/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.video) }));
    await screen.findByText('vase.mp4');
    expect(host.start).toHaveBeenCalledWith('C:/v.mp4', 'preview', 'scene', undefined);
  });

  it('a preset or a typed number is sent, remembered, and a typed one is brought within the bounds', async () => {
    host.status.mockResolvedValueOnce(engine()).mockResolvedValue(engine({ job: job({}) }));
    host.pickPhotos.mockResolvedValue({ path: 'C:/p' });
    host.startPhotos.mockResolvedValue(job({}));
    host.frames.mockResolvedValue({ names: [] });
    const { unmount } = renderTab();
    // Each larger count says how many times longer, never « longer » twice.
    expect(await screen.findByRole('radio', { name: /^200/ })).toHaveTextContent(fill(w.create.framesLonger, { n: 2 }));
    expect(screen.getByRole('radio', { name: /^400/ })).toHaveTextContent(fill(w.create.framesLonger, { n: 4 }));
    fireEvent.click(screen.getByRole('radio', { name: /^200/ }));
    expect(localStorage.getItem('lab3d.frames')).toBe('200');
    const field = screen.getByRole('spinbutton', { name: w.create.framesOther });
    fireEvent.change(field, { target: { value: '1000' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    // Brought down to 400, which is also a preset: its tile lights, the field empties.
    expect(screen.getByRole('radio', { name: /^200/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /^400/ })).toHaveAttribute('aria-checked', 'true');
    expect(field).toHaveValue(null);
    expect(localStorage.getItem('lab3d.frames')).toBe('400');
    fireEvent.change(field, { target: { value: '260' } });
    fireEvent.blur(field);
    expect(field).toHaveValue(260);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.photos) }));
    await screen.findByText('vase.mp4');
    expect(host.startPhotos).toHaveBeenCalledWith('C:/p', 'preview', 'scene', 260);
    unmount();
    // Opened again: the choice is the one left.
    host.status.mockResolvedValue(engine());
    renderTab();
    expect(await screen.findByRole('spinbutton', { name: w.create.framesOther })).toHaveValue(260);
  });

  it('a place being measured says « path », and no arc around a middle that means nothing', async () => {
    host.status.mockResolvedValue(engine({ job: job({ scope: 'place', step: 'coverage', framesKept: 100, posesPlaced: 96, coverageDeg: 140 }) }));
    host.read.mockRejectedValue(new Error('NOT_FOUND'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTab(MNEMO, 'places');
    expect(await screen.findByText(w.create.placePhase.coverage)).toBeInTheDocument();
    expect(screen.queryByText(w.create.turnFilmed)).not.toBeInTheDocument();
    expect(screen.queryByText('140°')).not.toBeInTheDocument();
  });

  it('a place the host made as a scene is shown as the scene it says, pause included', async () => {
    // A host older than places reads « place » as the whole scene, and pauses on a short turn.
    host.status.mockResolvedValue(engine({ job: job({ scope: 'scene', step: 'needsConfirm', framesKept: 100, posesPlaced: 100, coverageDeg: 125 }) }));
    host.read.mockRejectedValue(new Error('NOT_FOUND'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('lab3d.scope', 'place');
    renderTab();
    expect(await screen.findByText(new RegExp('125° filmed around'))).toBeInTheDocument();
    expect(screen.queryByText(w.create.placeSteps.coverage)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(w.create.scopeScene))).toBeInTheDocument();
  });

  it('a dialog closed starts nothing and says nothing; a refusal is said in its own words', async () => {
    host.status.mockResolvedValue(engine());
    host.pickVideo.mockResolvedValueOnce({ path: null }).mockResolvedValueOnce({ path: 'C:/v.mp4' });
    host.start.mockRejectedValue(new Error('ALREADY_RUNNING'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTab();
    const video = await screen.findByRole('button', { name: new RegExp(w.create.video) });
    fireEvent.click(video);
    await act(async () => {});
    expect(host.start).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(video);
    expect(await screen.findByRole('alert')).toHaveTextContent(w.create.errors.ALREADY_RUNNING!);
  });

  it('a running job shows its measured steps, asks again while it runs, and stops on Stop', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    host.status.mockResolvedValue(engine({ job: job({ step: 'poses', framesKept: 100, framesTotal: 484, colmap: { phase: 'features', done: 37, of: 100 } }) }));
    host.frames.mockResolvedValue({ names: [] });
    host.cancel.mockResolvedValue({ ok: true });
    renderTab();
    expect(await screen.findByText('100 / 484')).toBeInTheDocument();
    expect(screen.getAllByText('37 / 100').length).toBeGreaterThan(0);
    const asked = host.status.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600); });
    expect(host.status.mock.calls.length).toBeGreaterThan(asked);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.stop) }));
    await act(async () => {});
    expect(host.cancel).toHaveBeenCalledWith('job-1');
  });

  it('the clock keeps running while the job waits for a decision', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    host.status.mockResolvedValue(engine({ job: job({ step: 'needsConfirm', startedAt: Date.now() - 60_000, framesKept: 100, posesPlaced: 100, coverageDeg: 125 }) }));
    host.read.mockRejectedValue(new Error('NOT_FOUND'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTab();
    const clock = await screen.findByTitle(w.create.elapsed);
    const before = clock.textContent;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(clock.textContent).not.toBe(before);
  });

  it('a short turn waits for a decision and continues on it', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'needsConfirm', framesKept: 100, posesPlaced: 100, coverageDeg: 125 }) }));
    host.read.mockRejectedValue(new Error('NOT_FOUND'));
    host.continueJob.mockResolvedValue({ ok: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTab();
    expect(await screen.findByText(new RegExp('125° filmed around'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.create.continue }));
    await act(async () => {});
    expect(host.continueJob).toHaveBeenCalledWith('job-1');
  });

  it('a finished job shows its object in the gallery, and the form is there the next time', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'done', framesKept: 100, posesPlaced: 100, coverageDeg: 320 }) }));
    host.frames.mockResolvedValue({ names: [] });
    const { onView } = renderTab();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(w.create.view) }));
    expect(onView).toHaveBeenCalledWith('20261022-vase');
    expect(await screen.findByRole('button', { name: new RegExp(w.create.video) })).toBeInTheDocument();
  });

  it('a failed job says why in words, never a bare code', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'failed', framesKept: 100, posesPlaced: 12, error: 'POSES_FAILED: 12/100' }) }));
    renderTab();
    expect(await screen.findByRole('alert')).toHaveTextContent('COLMAP placed too few frames (12/100).');
  });

  it('a job from photos that stopped at placing shows the photos left out, and adds more into the same folder', async () => {
    const unplaced = ['C:/Users/t/Pictures/s1/s1_014.jpg', 'C:/Users/t/Pictures/s1/s1_015.jpg'];
    host.status.mockResolvedValue(engine({ job: job({
      step: 'failed', source: 'photos', video: 'C:/Users/t/Pictures/s1', framesKept: 20, posesPlaced: 13,
      error: 'POSES_FAILED: 13/20', unplacedPhotos: unplaced,
    }) }));
    host.readPicture.mockResolvedValue('data:image/jpeg;base64,AA');
    renderTab({ kind: 'mnemosyne', capabilities: ['phone.photos'], platform: 'win32' });
    expect(await screen.findByText(fill(w.create.unplacedTitle, { n: 2 }), { exact: false, normalizer: (t) => t.toLowerCase() })).toBeInTheDocument();
    await waitFor(() => expect(host.readPicture).toHaveBeenCalledWith(unplaced[1]));
    expect(await screen.findByAltText('s1_014.jpg')).toHaveAttribute('src', 'data:image/jpeg;base64,AA');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.phone.addMore) }));
    expect(await screen.findByText('phone capture screen going on with s1')).toBeInTheDocument();
  });

  it('a 3D object made from photos asks, under it, where the photos go', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'done', source: 'photos', video: 'C:/App/series/s1' }) }));
    host.frames.mockResolvedValue({ names: [] });
    renderTab({ kind: 'mnemosyne', capabilities: ['phone.photos'], platform: 'win32' });
    expect(await screen.findByText('where do the photos of C:/App/series/s1 go')).toBeInTheDocument();
  });

  it('while a build runs, the phone opens for a new series and the back arrow returns to the build', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'train', trainStep: 3000, trainSteps: 30_000, liveStep: null }) }));
    host.frames.mockResolvedValue({ names: [] });
    renderTab({ kind: 'mnemosyne', capabilities: ['phone.photos'], platform: 'win32' });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(w.phone.title) }));
    expect(await screen.findByText('phone capture screen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.create.newObject) }));
    expect(await screen.findByRole('button', { name: new RegExp(w.phone.title) })).toBeInTheDocument();
  });

  it('« Keep it now » shows once Brush wrote an object, and asks the host to keep it', async () => {
    (host as unknown as { keepNow: ReturnType<typeof vi.fn> }).keepNow = vi.fn().mockResolvedValue({ success: true });
    host.status.mockResolvedValue(engine({ job: job({ step: 'train', trainStep: 12_000, trainSteps: 30_000, liveStep: 12_000 }) }));
    host.frames.mockResolvedValue({ names: [] });
    // The live object is read while Brush trains: none here (an undefined piece crashed after the test).
    host.read.mockRejectedValue(new Error('NOT_FOUND'));
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: w.create.keepNow }));
    await waitFor(() => expect((host as unknown as { keepNow: ReturnType<typeof vi.fn> }).keepNow).toHaveBeenCalledWith('job-1'));
  });

  it('a build the card gave up on says it in words, and makes it again on Quick in one click', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'failed', source: 'photos', video: 'C:/App/series/s1', scope: 'scene', error: 'GPU_LOST: Somehow lost data loading channel!' }) }));
    host.startPhotos.mockResolvedValue(job({ scope: 'scene' }));
    renderTab();
    expect(await screen.findByRole('alert')).toHaveTextContent(w.create.errors.GPU_LOST!);
    fireEvent.click(screen.getByRole('button', { name: w.create.retryQuick }));
    await waitFor(() => expect(host.startPhotos).toHaveBeenCalledWith('C:/App/series/s1', 'preview', 'scene', undefined));
  });

  it('a build Brush stopped early keeps its object and says at which step', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'done', trainSteps: 30_000, trainStopped: { step: 11_000, reason: 'GPU_LOST', detail: 'x' } }) }));
    host.frames.mockResolvedValue({ names: [] });
    renderTab();
    expect(await screen.findByText(new RegExp(w.create.stoppedGpu.slice(0, 20)))).toHaveTextContent(fill(w.create.stoppedAt, { step: '11,000', of: '30,000' }));
  });

  it('a job from a video, or a host without the phone, offers no « Add photos »', async () => {
    host.status.mockResolvedValue(engine({ job: job({ step: 'failed', source: 'photos', video: 'C:/p', error: 'POSES_FAILED: 13/20', unplacedPhotos: [] }) }));
    renderTab();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(w.phone.addMore) })).toBeNull();
  });
});
