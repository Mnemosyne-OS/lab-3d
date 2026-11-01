/**
 * The two galleries inside Mnemosyne (doc 166 §14.2): the objects and the
 * places each have their own Create, one engine is asked for both, and a job
 * is shown in the gallery of what it makes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { words } from '../i18n/words';
import type { JobView, ObjectEntry } from '../core/model';
import type { EngineStatus } from '../host/doors';

vi.mock('../features/viewer/ViewerTab', () => ({ ViewerTab: () => <div data-testid="viewer" /> }));
vi.mock('./useHost', () => ({ useHost: () => ({ kind: 'mnemosyne', capabilities: [], platform: 'win32' }) }));
const host = vi.hoisted(() => ({
  status: vi.fn(), list: vi.fn(), read: vi.fn(), frames: vi.fn(), pickVideo: vi.fn(), pickPhotos: vi.fn(),
  start: vi.fn(), startPhotos: vi.fn(), continueJob: vi.fn(), cancel: vi.fn(), openSettings: vi.fn(),
  stateGet: vi.fn(), stateSet: vi.fn(), refreshPermission: vi.fn(),
}));
vi.mock('../host/doors', async (orig) => {
  const real = await orig<typeof import('../host/doors')>();
  return { ...real, doors: host };
});
vi.mock('../engine/SplatStage', () => ({
  SplatStage: class {
    async load() { return { splats: 1, grounded: false, viewpoints: 0, walkable: false, mode: 'orbit', viewAt: 0 }; }
    setAutoRotate() {} resetView() {} close() {} dispose() {}
  },
}));

import { App } from './App';

const w = words(navigator.language);
const engine = (job: JobView | null = null): EngineStatus => ({ supported: true, installed: true, ffmpegInstalled: true, objectOnly: 'ready', job });
const job = (over: Partial<JobView>): JobView => ({
  id: 'job-1', video: 'C:\\Users\\t\\Videos\\jardin.mp4', quality: 'preview', scope: 'place', step: 'poses',
  startedAt: Date.now() - 60_000, stepStartedAt: Date.now() - 5_000, framesTotal: 400, framesKept: 100, posesPlaced: null, coverageDeg: null,
  trainStep: null, trainSteps: 7_000, cuda: true, outDir: 'C:\\Users\\t\\.mnemosyne\\generations\\splats\\20261023-jardin', error: null, ...over,
});
const obj = (id: string, scope: ObjectEntry['scope']): ObjectEntry => ({
  id, createdAt: null, quality: 'full', scope, framesKept: 100, posesPlaced: 100, coverageDeg: 320, sceneBytes: 4096, thumb: null,
});
const LIST = [obj('20261021-192953-vase', 'object'), obj('20261022-090000-jardin', 'place')];

function setup(status: EngineStatus, tab = 'objects') {
  localStorage.setItem('lab3d.tab', tab);
  host.status.mockResolvedValue(status);
  host.list.mockResolvedValue({ objects: LIST });
  host.frames.mockResolvedValue({ names: [] });
  host.read.mockRejectedValue(new Error('NOT_FOUND'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<App />);
}

describe('App, the two galleries', () => {
  afterEach(() => {
    cleanup(); localStorage.clear(); vi.restoreAllMocks();
    for (const f of Object.values(host)) f.mockReset();
  });

  it('a tab per gallery, and no Create tab any more', () => {
    setup(engine(), 'viewer');
    expect(screen.getByRole('tab', { name: w.tabs.objects })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: w.tabs.places })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(6);
  });

  it('the engine is asked once a gallery is opened, never before', async () => {
    setup(engine(), 'viewer');
    await act(async () => {});
    expect(host.status).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: w.tabs.places }));
    await waitFor(() => expect(host.status).toHaveBeenCalledTimes(1));
    // The other gallery reads the same answer: no second question.
    fireEvent.click(screen.getByRole('tab', { name: w.tabs.objects }));
    await act(async () => {});
    expect(host.status).toHaveBeenCalledTimes(1);
  });

  it('the objects’ Create offers the object alone and the scene, and goes back to the tiles', async () => {
    setup(engine());
    fireEvent.click(await screen.findByRole('button', { name: w.create.newObject }));
    const group = await screen.findByRole('radiogroup', { name: w.create.scope });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: w.create.newObject })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.tabs.objects) }));
    expect(await screen.findByRole('button', { name: w.create.newObject })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vase/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /jardin/ })).not.toBeInTheDocument();
  });

  it('the places’ Create makes a place, with nothing to choose about what to keep', async () => {
    setup(engine(), 'places');
    fireEvent.click(await screen.findByRole('button', { name: w.create.newPlace }));
    expect(await screen.findByText(w.create.videoSubPlace)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: w.create.scope })).not.toBeInTheDocument();
  });

  it('a place being made: the objects’ Create says so, and its button leads to the places’ Create showing it', async () => {
    setup(engine(job({})));
    fireEvent.click(await screen.findByRole('button', { name: w.create.newObject }));
    fireEvent.click(await screen.findByRole('button', { name: w.create.seeIt }));
    expect(screen.getByRole('tab', { name: w.tabs.places })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('jardin.mp4')).toBeInTheDocument();
    // Back in the places, the button says the job is being made.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${w.tabs.places}`) }));
    expect(await screen.findByRole('button', { name: w.create.jobRunning })).toBeInTheDocument();
  });

  it('a finished job reads the libraries again, and « look at it » opens it in its gallery', async () => {
    setup(engine(job({ step: 'done', posesPlaced: 100 })), 'places');
    host.list.mockResolvedValue({ objects: [...LIST, obj('20261023-jardin', 'place')] });
    await waitFor(() => expect(host.list.mock.calls.length).toBeGreaterThanOrEqual(2));
    fireEvent.click(await screen.findByRole('button', { name: w.create.newPlace }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(w.create.view) }));
    await waitFor(() => expect(host.read).toHaveBeenCalled());
    expect(host.read.mock.calls[0]?.[0]).toBe('20261023-jardin');
  });
});
