import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { words } from '../../i18n/words';
import type { ObjectEntry } from '../../core/model';
import type { Alignment, RefView } from '../../core/compareModel';
import type { HostState } from '../../host/hostState';
import { RIG, piecesOf } from '../objects/fakeHost.test-util';

const host = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), align: vi.fn(), alignStatus: vi.fn(), alignCancel: vi.fn() }));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, ...host } };
});

// The two renderers draw with WebGL, which jsdom has not: a stand-in that keeps the contract.
const stage = vi.hoisted(() => ({ made: 0, loads: [] as unknown[], modes: [] as string[], measures: [] as string[], disposed: 0 }));
vi.mock('../../engine/CompareStage', () => ({
  CompareStage: class {
    constructor() { stage.made++; }
    async load(ref: { fileName: string }, moved: { fileName: string }, _rig: unknown, pose: unknown, start: unknown) {
      stage.loads.push({ ref: ref.fileName, moved: moved.fileName, pose, start });
    }
    setMode(m: string) { stage.modes.push(m); }
    async measure(v: { name: string }) {
      stage.measures.push(v.name);
      // Two identical 2 × 1 renders: nothing changed, everything covered.
      const px = new Uint8Array([90, 90, 90, 255, 90, 90, 90, 255]);
      return { a: px, b: px.slice(), w: 2, h: 1 };
    }
    resetView() {}
    dispose() { stage.disposed++; }
  },
}));

import { CompareTab } from './CompareTab';

const w = words('en');
const MNEMO: HostState = { kind: 'mnemosyne', capabilities: [], platform: 'win32' };
const EARLY = '20260301-120000-garden';
const LATE = '20261001-120000-garden';
const obj = (id: string, filmedAt: string | null, extra: Partial<ObjectEntry> = {}): ObjectEntry => ({
  id, createdAt: null, quality: 'full', scope: 'scene', framesKept: 100, posesPlaced: 100, coverageDeg: 334, sceneBytes: 4096, thumb: null,
  filmedAt, alignedTo: [], ...extra,
});
const view = (name: string, comparable: boolean, position: RefView['position'] = [0, 0, 3]): RefView => ({ name, position, quaternion: [0, 0, 0, 1], fovY: 50, aspect: 2, nearestMovedDeg: 3, comparable });
const ALIGNMENT = (extra: Partial<Alignment> = {}): Alignment => ({
  refId: EARLY, movedId: LATE, measuredAt: '2026-10-23T00:00:00Z', placed: 90, total: 100, reprojectionPx: 1.2, sharedPoints: 800,
  refPoints: 4000, residualPct: 0.4, sim3: { scale: 2, rotation: [0.5, 0.1, 0.2, 0.3], translation: [1, 2, 3] }, verdict: 'aligned',
  reasons: [], views: [view('far.jpg', false, [9, 9, 9]), view('near.jpg', true, [0, 0, 3])], seconds: {}, ...extra,
});
const sceneFiles = (id: string) => ({
  [`${id}/cameras.json`]: JSON.stringify(RIG),
  [`${id}/manifest.json`]: JSON.stringify({ files: { scene: 'scene.spz' } }),
  [`${id}/scene.spz`]: new Uint8Array([1, 2]),
});

function ready(alignment: Alignment | null, extra: Partial<ObjectEntry> = {}) {
  host.list.mockResolvedValue({ objects: [obj(LATE, '2026-10-01T12:00:00', { alignedTo: alignment ? [EARLY] : [], ...extra }), obj(EARLY, '2026-03-01T12:00:00')] });
  host.read.mockImplementation(piecesOf({
    ...sceneFiles(EARLY), ...sceneFiles(LATE),
    ...(alignment ? { [`${LATE}/align-${EARLY}.json`]: JSON.stringify(alignment) } : {}),
  }));
  host.alignStatus.mockResolvedValue(null);
}

/** Picks the LATER date first: the earlier must still become the reference. */
async function pickBoth() {
  render(<CompareTab w={w} lang="en" host={MNEMO} />);
  fireEvent.click(await screen.findByTestId('day-2026-10-01'));
  fireEvent.click(screen.getByTestId('day-2026-03-01'));
  await screen.findByTestId('pair');
}

describe('CompareTab', () => {
  afterEach(() => {
    cleanup(); localStorage.clear(); vi.restoreAllMocks();
    for (const f of Object.values(host)) f.mockReset();
    stage.made = 0; stage.loads = []; stage.modes = []; stage.measures = []; stage.disposed = 0;
  });

  it('outside Mnemosyne says what it needs and asks the host nothing', () => {
    render(<CompareTab w={w} lang="en" host={{ kind: 'standalone' }} />);
    expect(screen.getByText(w.locked.title)).toBeInTheDocument();
    expect(host.list).not.toHaveBeenCalled();
    expect(host.alignStatus).not.toHaveBeenCalled();
  });

  it('a hidden tab asks nothing until it is opened', async () => {
    ready(null);
    const { rerender } = render(<CompareTab w={w} lang="en" host={MNEMO} active={false} />);
    await act(async () => {});
    expect(host.list).not.toHaveBeenCalled();
    rerender(<CompareTab w={w} lang="en" host={MNEMO} active />);
    await waitFor(() => expect(host.list).toHaveBeenCalledTimes(1));
  });

  it('the earlier date is the reference whatever the order picked, and the pair is remembered', async () => {
    ready(null);
    await pickBoth();
    const pair = screen.getByTestId('pair');
    expect(pair.textContent).toMatch(new RegExp(`${w.compare.reference}.*garden.*${w.compare.later}`));
    expect(pair.textContent!.indexOf('3/1/2026')).toBeLessThan(pair.textContent!.indexOf('10/1/2026'));
    expect(JSON.parse(localStorage.getItem('lab3d.comparePair')!)).toEqual([LATE, EARLY]);
    expect(screen.getByText(w.compare.alignFirst)).toBeInTheDocument();
  });

  it('two presses start ONE alignment, the reference first, and its step and clock show while it runs', async () => {
    ready(null);
    let answer!: (v: unknown) => void;
    host.align.mockReturnValue(new Promise((r) => { answer = r; }));
    await pickBoth();
    const go = screen.getByRole('button', { name: w.compare.alignStart });
    fireEvent.click(go);
    fireEvent.click(go);
    expect(host.align).toHaveBeenCalledTimes(1);
    expect(host.align).toHaveBeenCalledWith(EARLY, LATE);
    host.alignStatus.mockResolvedValue({ refId: EARLY, movedId: LATE, step: 'matching', startedAt: Date.now(), stepStartedAt: Date.now(), error: null });
    await act(async () => { answer({ refId: EARLY, movedId: LATE, step: 'features', startedAt: Date.now(), stepStartedAt: Date.now(), error: null }); });
    expect(screen.getAllByText(w.compare.alignStep.features).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: new RegExp(w.compare.stop) })).toBeInTheDocument();
  });

  it('a finished alignment reads the list again once and shows the four numbers', async () => {
    ready(null);
    const job = { refId: EARLY, movedId: LATE, step: 'placing', startedAt: 5, stepStartedAt: 5, error: null };
    host.align.mockResolvedValue(job);
    await pickBoth();
    // The host's job is done: the list now carries the file beside the later date.
    host.alignStatus.mockResolvedValue({ ...job, step: 'done' });
    ready(ALIGNMENT());
    host.alignStatus.mockResolvedValue({ ...job, step: 'done' });
    fireEvent.click(screen.getByRole('button', { name: w.compare.alignStart }));
    await screen.findByTestId('alignment', {}, { timeout: 4000 });
    expect(screen.getByTestId('alignment').textContent).toMatch(/90 of 100 frames placed · error 1\.20 px · 800 points in common · gap 0\.40 %/);
    await waitFor(() => expect(host.list).toHaveBeenCalledTimes(2));
    // Once per finished job, never again; and a job that is not running is not asked about any more.
    const asked = host.alignStatus.mock.calls.length;
    await new Promise((r) => setTimeout(r, 1700));
    expect(host.list).toHaveBeenCalledTimes(2);
    expect(host.alignStatus.mock.calls.length).toBe(asked);
  });

  it('stopping asks the host to stop, then reads where it stands', async () => {
    ready(null);
    host.alignStatus.mockResolvedValue({ refId: EARLY, movedId: LATE, step: 'features', startedAt: 5, stepStartedAt: 5, error: null });
    await pickBoth();
    const stop = await screen.findByRole('button', { name: new RegExp(w.compare.stop) });
    const before = host.alignStatus.mock.calls.length;
    host.alignCancel.mockResolvedValue({ ok: true });
    host.alignStatus.mockResolvedValue({ refId: EARLY, movedId: LATE, step: 'cancelled', startedAt: 5, stepStartedAt: 5, error: null });
    await act(async () => { stop.click(); });
    expect(host.alignCancel).toHaveBeenCalledTimes(1);
    expect(host.alignStatus.mock.calls.length).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: new RegExp(w.compare.stop) })).not.toBeInTheDocument();
  });

  it('a host that refuses says so in words', async () => {
    ready(null);
    host.align.mockRejectedValue(new Error('Unauthorized: This cartridge does not have the "dialog:open" permission.'));
    await pickBoth();
    await act(async () => { screen.getByRole('button', { name: w.compare.alignStart }).click(); });
    expect(await screen.findByText(w.compare.refused)).toBeInTheDocument();
  });

  it('says how many placed frames are matched directly, and nothing of it for a file written before the count', async () => {
    ready(ALIGNMENT({ linked: 55, placed: 99 }));
    await pickBoth();
    expect((await screen.findByTestId('alignment')).textContent).toContain('55 of the 99 placed frames are matched directly to the reference');
    // A fresh window: the remembered pair would be unpicked by the clicks below.
    cleanup(); localStorage.clear();
    ready(ALIGNMENT());
    await pickBoth();
    expect((await screen.findByTestId('alignment')).textContent).not.toMatch(/matched directly/);
  });

  it('a failed alignment shows its numbers and reasons, and is never overlaid', async () => {
    // A similarity was even measured: the verdict alone forbids the overlay.
    ready(ALIGNMENT({ verdict: 'failed', placed: 28, reasons: ['FEW_PLACED', 'RESIDUAL_HIGH'] }));
    await pickBoth();
    const card = await screen.findByTestId('alignment');
    expect(card.textContent).toContain(w.compare.verdict.failed);
    expect(card.textContent).toContain(w.compare.reason.FEW_PLACED);
    expect(screen.getAllByText(w.compare.failedNoOverlay).length).toBeGreaterThan(0);
    await act(async () => {});
    expect(stage.made).toBe(0);
    expect(stage.loads).toEqual([]);
    expect(document.querySelector('.rail-step.failed')).not.toBeNull();
  });

  it('a weak alignment is overlaid by its measured similarity, with its warning the whole time', async () => {
    ready(ALIGNMENT({ verdict: 'weak', reasons: ['PLACED_LOW'] }));
    await pickBoth();
    await waitFor(() => expect(stage.loads).toHaveLength(1));
    expect(stage.loads[0]).toEqual({
      ref: 'scene.spz', moved: 'scene.spz',
      pose: { quaternion: [0.1, 0.2, 0.3, 0.5], scale: 2, position: [1, 2, 3] },
      // The camera starts on a viewpoint BOTH videos filmed.
      start: [0, 0, 3],
    });
    expect(await screen.findByText(w.compare.weakBanner)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.compare.modeCurtain }));
    expect(screen.getByText(w.compare.weakBanner)).toBeInTheDocument();
    expect(document.querySelectorAll('.rail-step.done').length).toBe(3);
  });

  it('the differences are measured only from viewpoints both videos filmed', async () => {
    ready(ALIGNMENT());
    await pickBoth();
    await waitFor(() => expect(stage.loads).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: w.compare.modeDiff }));
    expect(stage.modes).toEqual(['diff']);
    await screen.findByText(/0 % of the compared area changed · 100 % of the image compared/);
    expect(stage.measures).toEqual(['near.jpg']);
    expect(screen.getByText(fill1(w.compare.diffView))).toBeInTheDocument();
  });

  it('when one date is an object alone, the map says it compares only where the object stands', async () => {
    ready(ALIGNMENT(), { scope: 'object' });
    await pickBoth();
    await waitFor(() => expect(stage.loads).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: w.compare.modeDiff }));
    expect(await screen.findByText(w.compare.diffObjectOnly)).toBeInTheDocument();
    cleanup(); localStorage.clear(); stage.loads = [];
    ready(ALIGNMENT());
    await pickBoth();
    await waitFor(() => expect(stage.loads).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: w.compare.modeDiff }));
    await screen.findByText(w.compare.diffWhat);
    expect(screen.queryByText(w.compare.diffObjectOnly)).not.toBeInTheDocument();
  });

  it('no viewpoint filmed by both: no difference is measured, and it is said', async () => {
    ready(ALIGNMENT({ views: [view('far.jpg', false)] }));
    await pickBoth();
    await waitFor(() => expect(stage.loads).toHaveLength(1));
    // No common viewpoint: the camera starts on the reference's own first one.
    expect((stage.loads[0] as { start: unknown }).start).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: w.compare.modeDiff }));
    expect(screen.getByText(w.compare.diffNoView)).toBeInTheDocument();
    await act(async () => {});
    expect(stage.measures).toEqual([]);
  });

  it('a place never pairs with an object: one kind on the timeline at a time, the switch remembered', async () => {
    const PLACE = '20261005-120000-flat';
    const PLACE_LATER = '20261009-120000-flat';
    host.list.mockResolvedValue({ objects: [
      obj(LATE, '2026-10-01T12:00:00'), obj(EARLY, '2026-03-01T12:00:00'),
      obj(PLACE, '2026-10-05T12:00:00', { scope: 'place' }), obj(PLACE_LATER, '2026-10-09T12:00:00', { scope: 'place' }),
    ] });
    host.alignStatus.mockResolvedValue(null);
    const first = render(<CompareTab w={w} lang="en" host={MNEMO} />);
    // The objects by default: the place is not on the timeline.
    expect(await screen.findByTestId('day-2026-10-01')).toBeInTheDocument();
    expect(screen.queryByTestId('day-2026-10-05')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: new RegExp(w.tabs.objects) })).toHaveAttribute('aria-checked', 'true');
    // A vase picked first stays out of a pair of places.
    fireEvent.click(screen.getByTestId('day-2026-10-01'));
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(w.tabs.places) }));
    expect(screen.getByTestId('day-2026-10-05')).toBeInTheDocument();
    expect(screen.queryByTestId('day-2026-10-01')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('day-2026-10-05'));
    expect(screen.queryByTestId('pair')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('day-2026-10-09'));
    expect(await screen.findByTestId('pair')).toHaveTextContent('flat');
    expect(screen.getByTestId('pair')).not.toHaveTextContent('garden');
    expect(localStorage.getItem('lab3d.compareKind')).toBe('places');
    first.unmount();
    render(<CompareTab w={w} lang="en" host={MNEMO} />);
    expect(await screen.findByTestId('day-2026-10-05')).toBeInTheDocument();
  });

  it('a day of several places is counted in places, never in objects', async () => {
    localStorage.setItem('lab3d.compareKind', 'places');
    host.list.mockResolvedValue({ objects: [
      obj(EARLY, '2026-03-01T12:00:00'),
      obj('20261005-120000-flat', '2026-10-05T12:00:00', { scope: 'place' }), obj('20261005-130000-flat', '2026-10-05T13:00:00', { scope: 'place' }),
    ] });
    host.alignStatus.mockResolvedValue(null);
    render(<CompareTab w={w} lang="en" host={MNEMO} />);
    expect(await screen.findByTestId('day-2026-10-05')).toHaveTextContent('2 places');
  });

  it('a remembered kind with nothing in it shows the other, and no switch when one kind exists', async () => {
    localStorage.setItem('lab3d.compareKind', 'places');
    ready(null);
    render(<CompareTab w={w} lang="en" host={MNEMO} />);
    expect(await screen.findByTestId('day-2026-10-01')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: w.objects.filter })).not.toBeInTheDocument();
  });

  it('an alignment file that cannot be read is said, with a way to read it again', async () => {
    ready(null, { alignedTo: [EARLY] });
    await pickBoth();
    expect(await screen.findByText(new RegExp(w.compare.readError.split(':')[0]!))).toBeInTheDocument();
    host.read.mockImplementation(piecesOf({ ...sceneFiles(EARLY), ...sceneFiles(LATE), [`${LATE}/align-${EARLY}.json`]: JSON.stringify(ALIGNMENT()) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.compare.retry) }));
    expect(await screen.findByTestId('alignment')).toBeInTheDocument();
  });
});

/** « Viewpoint 1 of 1 »: one comparable view of two. */
function fill1(text: string): string {
  return text.replace('{n}', '1').replace('{m}', '1');
}
