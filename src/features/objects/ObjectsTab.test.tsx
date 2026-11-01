import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { words } from '../../i18n/words';
import type { ObjectEntry } from '../../core/model';
import type { HostState } from '../../host/hostState';
import { RIG, piecesOf } from './fakeHost.test-util';

const host = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));
vi.mock('../../host/doors', () => ({
  doors: { list: host.list, read: host.read },
  isPermissionRefusal: (e: unknown) => /Unauthorized/.test(String(e)),
}));

// The stage draws with WebGL, which jsdom has not: a stand-in that keeps the contract.
const stage = vi.hoisted(() => ({ loads: [] as unknown[], at: 0, start: 0, modes: [] as string[], pads: [] as unknown[] }));
vi.mock('../../engine/SplatStage', () => ({
  SplatStage: class {
    async load(_b: Uint8Array, _n: string, opts: { rig?: { cams: unknown[] } | null; floor?: boolean; walk?: boolean; onDecoded?: () => void }) {
      stage.loads.push({ rig: opts.rig ?? null, floor: opts.floor ?? false, walk: opts.walk ?? false });
      opts.onDecoded?.();
      // A visit opens on a view other than the first (the best-covered one).
      stage.start = opts.walk && opts.rig ? 2 : 0;
      stage.at = stage.start;
      return { splats: 4321, grounded: !!opts.floor, viewpoints: opts.rig?.cams.length ?? 0, walkable: !!opts.rig, mode: opts.walk && opts.rig ? 'walk' : 'orbit', viewAt: stage.at };
    }
    stepViewpoint(d: number) { stage.at = (stage.at + d + 3) % 3; return stage.at; }
    setMode(m: string) { stage.modes.push(m); return m; }
    get viewIndex() { return stage.at; }
    setPad(h: unknown) { stage.pads.push(h); }
    setAutoRotate() {} resetView() { stage.at = stage.start; } close() {} dispose() {}
  },
}));

import { ObjectsTab } from './ObjectsTab';

const w = words('en');
const MNEMO: HostState = { kind: 'mnemosyne', capabilities: [], platform: 'win32' };
const obj = (id: string, scope: ObjectEntry['scope']): ObjectEntry => ({
  id, createdAt: null, quality: 'full', scope, framesKept: 100, posesPlaced: 100, coverageDeg: 334, sceneBytes: 4096, thumb: null,
});
const VASE = '20261021-192953-vase';
const LIST = [obj(VASE, 'object'), obj('20261021-110000-salon', 'scene'), obj('20261021-120000-bottines', 'object')];

describe('ObjectsTab', () => {
  afterEach(() => {
    cleanup(); localStorage.clear(); host.list.mockReset(); host.read.mockReset();
    stage.loads = []; stage.at = 0; stage.start = 0; stage.modes = []; stage.pads = []; vi.restoreAllMocks();
  });

  it('waits for the host without a lock, then outside Mnemosyne says what it needs and asks nothing', () => {
    const { rerender } = render(<ObjectsTab w={w} lang="en" host={null} />);
    expect(screen.getByText(w.host.pending)).toBeInTheDocument();
    rerender(<ObjectsTab w={w} lang="en" host={{ kind: 'standalone' }} />);
    expect(screen.getByText(w.locked.title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: w.locked.get })).toHaveAttribute('href', 'https://mnemosyne-os.io');
    expect(host.list).not.toHaveBeenCalled();
  });

  it('lists the objects as tiles and filters them by what was made, remembering the choice', async () => {
    host.list.mockResolvedValue({ objects: LIST });
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    await screen.findByText('vase');
    expect(screen.getAllByRole('button', { name: /vase|salon|bottines/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: /Whole scene/ }));
    expect(screen.queryByText('vase')).not.toBeInTheDocument();
    expect(screen.getByText('salon')).toBeInTheDocument();
    expect(localStorage.getItem('lab3d.objectsFilter')).toBe('scene');
  });

  it('a refused permission is said as such, and a retry asks again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.list.mockRejectedValueOnce(new Error('Unauthorized: dialog:open')).mockResolvedValueOnce({ objects: [] });
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(w.objects.refused);
    fireEvent.click(screen.getByRole('button', { name: w.objects.retry }));
    expect(await screen.findByText(w.objects.empty)).toBeInTheDocument();
    expect(host.list).toHaveBeenCalledTimes(2);
  });

  it('opens an object on its filmed viewpoints, standing on its floor, and steps through them', async () => {
    host.list.mockResolvedValue({ objects: LIST });
    host.read.mockImplementation(piecesOf({
      [`${VASE}/cameras.json`]: JSON.stringify(RIG),
      [`${VASE}/manifest.json`]: JSON.stringify({ scope: 'object', files: { scene: 'scene.spz' } }),
      [`${VASE}/scene.spz`]: new Uint8Array([1, 2, 3]),
    }));
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    fireEvent.click(await screen.findByRole('button', { name: /vase/ }));
    await screen.findByText('4,321');
    expect(stage.loads).toEqual([{ rig: RIG, floor: true, walk: false }]);
    // Walking around an object alone shows nothing more than turning it.
    expect(screen.queryByRole('button', { name: w.stage.walk })).not.toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.objects.nextView }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.stage.close }));
    await waitFor(() => expect(screen.getByText('salon')).toBeInTheDocument());
  });

  it('a whole filmed scene has its own floor: none is drawn under it', async () => {
    const SALON = '20261021-110000-salon';
    host.list.mockResolvedValue({ objects: LIST });
    host.read.mockImplementation(piecesOf({
      [`${SALON}/cameras.json`]: JSON.stringify(RIG),
      [`${SALON}/manifest.json`]: JSON.stringify({ scope: 'scene', files: { scene: 'scene.spz' } }),
      [`${SALON}/scene.spz`]: new Uint8Array([1]),
    }));
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    fireEvent.click(await screen.findByRole('button', { name: /salon/ }));
    await screen.findByText('4,321');
    expect(stage.loads).toEqual([{ rig: RIG, floor: false, walk: false }]);
  });

  it('a scene can be walked through: the switch shows the pad and its hint, and goes back to turning', async () => {
    const SALON = '20261021-110000-salon';
    host.list.mockResolvedValue({ objects: LIST });
    host.read.mockImplementation(piecesOf({
      [`${SALON}/cameras.json`]: JSON.stringify(RIG),
      [`${SALON}/manifest.json`]: JSON.stringify({ scope: 'scene', files: { scene: 'scene.spz' } }),
      [`${SALON}/scene.spz`]: new Uint8Array([1]),
    }));
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    fireEvent.click(await screen.findByRole('button', { name: /salon/ }));
    await screen.findByText('4,321');
    expect(screen.getByText(w.stage.hint)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: w.stage.pad })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.stage.walk }));
    expect(stage.modes).toEqual(['walk']);
    expect(screen.getByRole('button', { name: w.stage.walk })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(w.stage.walkHint)).toBeInTheDocument();
    // Turning by itself means nothing inside a scene.
    expect(screen.queryByRole('button', { name: w.stage.rotate })).not.toBeInTheDocument();
    // An arrow held walks, let go it stops.
    const forward = screen.getByRole('button', { name: w.stage.padForward });
    fireEvent.pointerDown(forward, { pointerId: 1 });
    fireEvent.pointerUp(forward, { pointerId: 1 });
    expect(stage.pads).toEqual([{ forward: 1, side: 0, rise: 0, turn: 0 }, { forward: 0, side: 0, rise: 0, turn: 0 }]);
    fireEvent.click(screen.getByRole('button', { name: w.stage.walk }));
    expect(stage.modes).toEqual(['walk', 'orbit']);
    expect(screen.queryByRole('group', { name: w.stage.pad })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.stage.rotate })).toBeInTheDocument();
  });

  it('a place opens inside, with its pad, as its manifest says', async () => {
    const JARDIN = '20261022-090000-jardin';
    host.list.mockResolvedValue({ objects: [...LIST, obj(JARDIN, 'place')] });
    host.read.mockImplementation(piecesOf({
      [`${JARDIN}/cameras.json`]: JSON.stringify(RIG),
      [`${JARDIN}/manifest.json`]: JSON.stringify({ scope: 'place', files: { scene: 'scene.spz' } }),
      [`${JARDIN}/scene.spz`]: new Uint8Array([1]),
    }));
    render(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="places" />);
    fireEvent.click(await screen.findByRole('button', { name: /jardin/ }));
    await screen.findByText('4,321');
    expect(stage.loads).toEqual([{ rig: RIG, floor: false, walk: true }]);
    expect(screen.getByRole('group', { name: w.stage.pad })).toBeInTheDocument();
    // The view counter says the view the visit opened on, and « back to the start » is that view, not the first.
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.objects.nextView }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.stage.walkStart }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.stage.walk })).toHaveAttribute('aria-pressed', 'true');
    // The arc around the middle of a place is no measure of it.
    expect(screen.queryByText(w.objects.coverage)).not.toBeInTheDocument();
    // The readout names it a place, as its manifest says.
    expect(screen.getByText(w.objects.placeName)).toBeInTheDocument();
    expect(screen.queryByText(w.objects.name)).not.toBeInTheDocument();
    // On a phone only the key lines stay: the date, the size, the load time are minor.
    expect(screen.getByText(w.objects.date)).toHaveClass('minor');
    expect(screen.getByText(w.objects.viewpoint)).not.toHaveClass('minor');
  });

  it('the objects and the places are two galleries: each lists its own, under its own name', async () => {
    const all = [obj(VASE, 'object'), obj('20261021-110000-salon', 'scene'), obj('20261020-090000-ancien', null), obj('20261022-090000-jardin', 'place')];
    host.list.mockResolvedValue({ objects: all });
    const objects = render(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="objects" />);
    await screen.findByText('vase');
    // An object made before the choice existed is an object.
    expect(screen.getByText('ancien')).toBeInTheDocument();
    expect(screen.queryByText('jardin')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: w.tabs.objects })).toBeInTheDocument();
    // Two kinds here: a tile says which.
    expect(screen.getByRole('button', { name: /vase/ })).toHaveTextContent(w.objects.scopeObject);
    objects.unmount();
    render(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="places" />);
    await screen.findByText('jardin');
    expect(screen.queryByText('vase')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: w.tabs.places })).toBeInTheDocument();
    // One kind only: nothing to filter, and the arc around the middle of a place is no measure of it.
    expect(screen.queryByRole('radiogroup', { name: w.objects.filter })).not.toBeInTheDocument();
    expect(screen.queryByText('334°')).not.toBeInTheDocument();
    // Under « Places », a tile does not say « Place » again.
    expect(screen.getByRole('button', { name: /jardin/ })).not.toHaveTextContent(w.objects.scopePlace);
  });

  it('each gallery has its Create button, which says when its job is being made', async () => {
    host.list.mockResolvedValue({ objects: LIST });
    const onCreate = vi.fn();
    const { rerender } = render(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="objects" onCreate={onCreate} />);
    fireEvent.click(await screen.findByRole('button', { name: w.create.newObject }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    rerender(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="objects" onCreate={onCreate} jobLive />);
    fireEvent.click(screen.getByRole('button', { name: w.create.jobRunning }));
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it('an empty gallery says so, with its Create button', async () => {
    host.list.mockResolvedValue({ objects: LIST });
    const onCreate = vi.fn();
    render(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="places" onCreate={onCreate} />);
    expect(await screen.findByText(w.objects.emptyPlaces)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.create.newPlace }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('each gallery remembers its own tile size', async () => {
    host.list.mockResolvedValue({ objects: [...LIST, obj('20261022-090000-jardin', 'place')] });
    const first = render(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="places" />);
    await screen.findByText('jardin');
    fireEvent.click(screen.getByRole('radio', { name: w.objects.large }));
    expect(localStorage.getItem('lab3d.gridSize.places')).toBe('large');
    expect(localStorage.getItem('lab3d.gridSize')).toBeNull();
    first.unmount();
    render(<ObjectsTab w={w} lang="en" host={MNEMO} gallery="objects" />);
    await screen.findByText('vase');
    expect(screen.getByRole('radio', { name: w.objects.medium })).toHaveAttribute('aria-checked', 'true');
  });

  it('a scene without its cameras offers no walk: nothing says where the person filmed', async () => {
    const SALON = '20261021-110000-salon';
    host.list.mockResolvedValue({ objects: LIST });
    host.read.mockImplementation(piecesOf({
      [`${SALON}/manifest.json`]: JSON.stringify({ scope: 'place', files: { scene: 'scene.spz' } }),
      [`${SALON}/scene.spz`]: new Uint8Array([1]),
    }));
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    fireEvent.click(await screen.findByRole('button', { name: /salon/ }));
    await screen.findByText('4,321');
    expect(screen.queryByRole('button', { name: w.stage.walk })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: w.stage.pad })).not.toBeInTheDocument();
  });

  it('a remembered filter that no longer splits the library hides nothing', async () => {
    localStorage.setItem('lab3d.objectsFilter', 'scene');
    host.list.mockResolvedValue({ objects: [obj(VASE, 'object'), obj('20261021-120000-bottines', 'object')] });
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    expect(await screen.findByText('vase')).toBeInTheDocument();
    expect(screen.getByText('bottines')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: w.objects.filter })).not.toBeInTheDocument();
  });

  it('opens an object asked from outside once the library lists it, reading the list once more if needed', async () => {
    host.list.mockResolvedValueOnce({ objects: LIST.slice(1) }).mockResolvedValue({ objects: LIST });
    host.read.mockImplementation(piecesOf({
      [`${VASE}/cameras.json`]: JSON.stringify(RIG),
      [`${VASE}/manifest.json`]: JSON.stringify({ scope: 'object', files: { scene: 'scene.spz' } }),
      [`${VASE}/scene.spz`]: new Uint8Array([1]),
    }));
    const handled = vi.fn();
    render(<ObjectsTab w={w} lang="en" host={MNEMO} openId={VASE} onOpenHandled={handled} />);
    await screen.findByText('4,321');
    expect(host.list).toHaveBeenCalledTimes(2);
    expect(handled).toHaveBeenCalledTimes(1);
    expect(stage.loads).toHaveLength(1);
  });

  it('an object asked from outside that never shows is given up after one more read, not asked for ever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.list.mockResolvedValue({ objects: LIST.slice(1) });
    const handled = vi.fn();
    render(<ObjectsTab w={w} lang="en" host={MNEMO} openId="gone" onOpenHandled={handled} />);
    await waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
    expect(host.list).toHaveBeenCalledTimes(2);
  });

  it('a new object made elsewhere reads the library again', async () => {
    host.list.mockResolvedValue({ objects: LIST });
    const { rerender } = render(<ObjectsTab w={w} lang="en" host={MNEMO} refreshKey={0} />);
    await screen.findByText('vase');
    rerender(<ObjectsTab w={w} lang="en" host={MNEMO} refreshKey={1} />);
    await waitFor(() => expect(host.list).toHaveBeenCalledTimes(2));
  });

  it('an object that cannot be received says why and leads back to the library', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.list.mockResolvedValue({ objects: LIST });
    host.read.mockRejectedValue(new Error('NOT_FOUND'));
    render(<ObjectsTab w={w} lang="en" host={MNEMO} />);
    fireEvent.click(await screen.findByRole('button', { name: /vase/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The object could not be received: NOT_FOUND');
    expect(document.querySelector('.rail-step.failed')).toHaveTextContent(w.objects.stepFetch);
    fireEvent.click(screen.getByRole('button', { name: w.tabs.objects }));
    await screen.findByText('vase');
    expect(stage.loads).toHaveLength(0);
  });
});
