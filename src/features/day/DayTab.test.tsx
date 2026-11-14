import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { fill, words } from '../../i18n/words';
import type { ObjectEntry } from '../../core/model';
import type { HostState } from '../../host/hostState';
import { RIG, piecesOf } from '../objects/fakeHost.test-util';

const host = vi.hoisted(() => ({
  list: vi.fn(), read: vi.fn(), stateGet: vi.fn(), stateSet: vi.fn(), selectFolder: vi.fn(), readDir: vi.fn(), readPicture: vi.fn(), refreshPermission: vi.fn(),
  placePhotos: vi.fn(), placeStatus: vi.fn(), complete: vi.fn(),
}));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, ...host } };
});
// The host's waiting phone series, read by the guide to pick up one closed without « Done ».
const phone = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('../../host/phoneDoors', async (orig) => {
  const real = await orig<typeof import('../../host/phoneDoors')>();
  return { ...real, phoneDoors: { ...real.phoneDoors, ...phone } };
});

// The stage draws with WebGL, which jsdom has not: a stand-in that keeps the contract.
const stage = vi.hoisted(() => ({
  loads: [] as Array<{ walk: boolean }>,
  eye: { position: [1, 2, 3], dir: [0, 0, -1] } as { position: number[]; dir: number[] } | null,
  flights: [] as unknown[],
  arrive: true,
  /** The place's size the walk measures; null: the scene cannot be walked. */
  scale: 4 as number | null,
  stops: 0,
  frame: null as (() => void) | null,
}));
vi.mock('../../engine/SplatStage', () => ({
  SplatStage: class {
    async load(_b: Uint8Array, _n: string, opts: { walk?: boolean; onDecoded?: () => void }) {
      stage.loads.push({ walk: opts.walk ?? false });
      opts.onDecoded?.();
      return { splats: 10, grounded: false, viewpoints: 3, walkable: true, mode: 'walk', viewAt: 0 };
    }
    eye() { return stage.eye; }
    placeScale() { return stage.scale; }
    async flyTo(p: unknown) { stage.flights.push(p); return stage.arrive; }
    stopFlight() { stage.stops++; }
    project(pts: unknown[]) { return pts.map(() => ({ x: 10, y: 10, inFront: true, distance: 3 })); }
    setFrameListener(cb: (() => void) | null) { stage.frame = cb; }
    setPad() {} resetView() {} setAutoRotate() {} close() {} dispose() {}
  },
}));

// The phone screen (doc 176) is the paintings' one, tested there: here it hands over a closed series.
const SERIES = vi.hoisted(() => ({ id: '2026-11-14_11-20-00', photos: 2, startedAt: new Date(2026, 10, 14, 11, 20).getTime(), dir: 'C:\\app\\series\\2026-11-14_11-20-00' }));
vi.mock('../painting/PaintingPhone', async () => {
  const { createElement } = await import('react');
  return {
    PaintingPhone: ({ texts, onTaken }: { texts?: { title: string }; onTaken: (s: typeof SERIES) => void }) =>
      createElement('button', { onClick: () => onTaken(SERIES) }, texts?.title ?? 'painting'),
  };
});

import { DayTab } from './DayTab';
import { DAYS_KEY } from './dayStore';

const w = words('en');
const MNEMO: HostState = { kind: 'mnemosyne', capabilities: ['phone.photos'], platform: 'win32' };
const HALL = '20261114-080512-salle';
const place = (id: string): ObjectEntry => ({
  id, createdAt: null, quality: 'preview', scope: 'place', framesKept: 100, posesPlaced: 100, coverageDeg: null, sceneBytes: 4096, thumb: null,
});
const files = piecesOf({
  [`${HALL}/cameras.json`]: JSON.stringify(RIG),
  [`${HALL}/manifest.json`]: JSON.stringify({ scope: 'place', files: { scene: 'scene.spz' } }),
  [`${HALL}/scene.spz`]: new Uint8Array([1, 2]),
});
const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m).getTime();
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function ready() {
  host.list.mockResolvedValue({ objects: [place(HALL)] });
  host.read.mockImplementation(files);
  host.stateGet.mockResolvedValue({ state: { decor: { decors: ['kept'] } } });
  host.stateSet.mockResolvedValue({ ok: true });
  host.readPicture.mockResolvedValue(PNG);
  phone.status.mockResolvedValue({ series: [] });
  // A host without the placement of photos (older than doc 166 §16): the day works by hand.
  host.placePhotos.mockRejectedValue(new Error('Unknown action: splat.placePhotos'));
}

/** A day kept and open last: its place, its spots, its moments. */
function storeDay(spots: unknown[], moments: unknown[], current = true) {
  const day = { id: 'd1', placeId: HALL, placeName: 'salle', createdAt: at(8), spots, moments };
  localStorage.setItem(DAYS_KEY, JSON.stringify({ days: [day] }));
  if (current) localStorage.setItem('lab3d.day.current', 'd1');
}
const SPOT_A = { id: 'sA', name: 'Stand A', pose: { position: [0, 0, 0], dir: [1, 0, 0] }, createdAt: 0 };
const SPOT_B = { id: 'sB', name: 'Stand B', pose: { position: [5, 0, 0], dir: [0, 0, 1] }, createdAt: 0 };
const momentAt = (id: string, t: number, spotId: string | null) => ({ id, at: t, atFrom: 'exif', spotId, dir: 'C:/p', names: [`${id}.jpg`], source: 'folder' });

async function openDay() {
  render(<DayTab w={w} lang="en" host={MNEMO} />);
  fireEvent.click(await screen.findByRole('button', { name: /salle/ }));
  await screen.findByRole('slider', { name: w.day.timeline });
  openPanel();
}

/** The panel of spots is closed until asked (the guide does the day's steps). */
function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: w.day.panel }));
}

/** The last days blob the host was given. */
function savedDays() {
  return host.stateSet.mock.calls.at(-1)![0] as { decor: unknown; days: { days: Array<{ spots: unknown[]; moments: Array<{ at: number; spotId: string | null; names: string[] }> }> } };
}

describe('DayTab', () => {
  beforeEach(() => {
    // Only the clock is fixed: the tab's own timers and the host's promises run for real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 15, 0));
  });
  afterEach(() => {
    cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks();
    for (const f of [...Object.values(host), ...Object.values(phone)]) f.mockReset();
    stage.loads = []; stage.eye = { position: [1, 2, 3], dir: [0, 0, -1] }; stage.flights = []; stage.arrive = true; stage.scale = 4; stage.stops = 0; stage.frame = null;
  });

  it('a day started on a place paused then resumed shows the newest version, and is resumed, never doubled', async () => {
    ready();
    const NEW = '20261114-120000-salle';
    host.list.mockResolvedValue({ objects: [
      { ...place(HALL), versionOf: HALL, main: false, paused: { step: 4_000, of: 60_000 } },
      { ...place(NEW), versionOf: HALL, main: true, redoOf: HALL },
    ] });
    const both = piecesOf({
      [`${HALL}/cameras.json`]: JSON.stringify(RIG), [`${HALL}/manifest.json`]: JSON.stringify({ scope: 'place', files: { scene: 'scene.spz' } }), [`${HALL}/scene.spz`]: new Uint8Array([1, 2]),
      [`${NEW}/cameras.json`]: JSON.stringify(RIG), [`${NEW}/manifest.json`]: JSON.stringify({ scope: 'place', files: { scene: 'scene.spz' } }), [`${NEW}/scene.spz`]: new Uint8Array([3, 4]),
    });
    host.read.mockImplementation(both);
    storeDay([SPOT_A], [], false);
    render(<DayTab w={w} lang="en" host={MNEMO} />);
    // The guide offers to resume the day kept on the older version: it is the same place.
    fireEvent.click(await screen.findByRole('button', { name: w.day.guide.resumeGo }));
    await screen.findByRole('slider', { name: w.day.timeline });
    const ids = host.read.mock.calls.map((c) => c[0]);
    expect(ids).toContain(NEW);
    expect(ids).not.toContain(HALL);
  });

  it('outside Mnemosyne says what it needs and asks the host nothing', () => {
    render(<DayTab w={w} lang="en" host={{ kind: 'standalone' }} />);
    expect(screen.getByText(w.locked.title)).toBeInTheDocument();
    expect(host.list).not.toHaveBeenCalled();
    expect(host.stateGet).not.toHaveBeenCalled();
  });

  it('a place chosen opens the day inside it, walking, and the day is kept beside the décors', async () => {
    ready();
    await openDay();
    expect(stage.loads).toEqual([{ walk: true }]);
    await waitFor(() => expect(host.stateSet).toHaveBeenCalled(), { timeout: 2000 });
    const blob = savedDays();
    expect(blob.decor).toEqual({ decors: ['kept'] });
    expect(blob.days.days).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(DAYS_KEY)!).days).toHaveLength(1);
  });

  it('a spot is pinned where the eye stands', async () => {
    ready();
    await openDay();
    fireEvent.click(screen.getByRole('button', { name: w.day.addSpot }));
    expect(screen.getByRole('textbox', { name: w.day.rename })).toHaveValue('Spot 1');
    await waitFor(() => expect(savedDays().days.days[0]!.spots).toHaveLength(1), { timeout: 2000 });
    expect(savedDays().days.days[0]!.spots[0]).toMatchObject({ pose: { position: [1, 2, 3], dir: [0, 0, -1] } });
  });

  it('nothing on stage to stand on: no spot, and it says why', async () => {
    ready();
    await openDay();
    stage.eye = null;
    fireEvent.click(screen.getByRole('button', { name: w.day.addSpot }));
    expect(screen.getByRole('alert')).toHaveTextContent(w.day.noEye);
    expect(screen.queryByRole('textbox', { name: w.day.rename })).not.toBeInTheDocument();
  });

  it('a folder at a spot becomes its moments, cut by time, and the spot shows the latest at the hour', async () => {
    ready();
    host.selectFolder.mockResolvedValue('C:/Users/p/convention');
    host.readDir.mockResolvedValue([
      { name: 'c.jpg', isDirectory: false, path: 'C:/Users/p/convention/c.jpg', mtime: at(11) },
      { name: 'a.jpg', isDirectory: false, path: 'C:/Users/p/convention/a.jpg', mtime: at(10) },
      { name: 'b.jpg', isDirectory: false, path: 'C:/Users/p/convention/b.jpg', mtime: at(10, 5) },
      { name: 'notes.txt', isDirectory: false, path: 'C:/Users/p/convention/notes.txt', mtime: at(10) },
    ]);
    await openDay();
    fireEvent.click(screen.getByRole('button', { name: w.day.addSpot }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${w.day.addFolder} · Spot 1` })); });
    const photo = await screen.findByRole('dialog', { name: 'Spot 1' });
    // The hour moved to the latest moment: the second of the spot's two.
    expect(within(photo).getByText('2 / 2')).toBeInTheDocument();
    expect(host.readPicture).toHaveBeenCalledWith('C:/Users/p/convention/c.jpg');
    // The timeline back to its start: the first moment, two photos.
    fireEvent.keyDown(screen.getByRole('slider', { name: w.day.timeline }), { key: 'Home' });
    expect(within(screen.getByRole('dialog', { name: 'Spot 1' })).getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Photo 1 of 2')).toBeInTheDocument();
    await waitFor(() => expect(savedDays().days.days[0]!.moments).toHaveLength(2), { timeout: 2000 });
    expect(savedDays().days.days[0]!.moments.map((m) => [m.at, m.names])).toEqual([[at(10), ['a.jpg', 'b.jpg']], [at(11), ['c.jpg']]]);
  });

  it('a phone series taken at a spot becomes its moment, at the hour the series opened when its photo says none', async () => {
    ready();
    await openDay();
    fireEvent.click(screen.getByRole('button', { name: w.day.addSpot }));
    fireEvent.click(screen.getByRole('button', { name: `${w.day.addPhone} · Spot 1` }));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: w.day.phoneTitle })); });
    expect(await screen.findByRole('dialog', { name: 'Spot 1' })).toBeInTheDocument();
    expect(host.readPicture).toHaveBeenCalledWith('C:\\app\\series\\2026-11-14_11-20-00\\001.jpg');
    await waitFor(() => expect(savedDays().days.days[0]!.moments).toHaveLength(1), { timeout: 2000 });
    const kept = savedDays().days.days[0]! as unknown as { spots: Array<{ id: string }>; moments: unknown[] };
    expect(kept.moments[0]).toMatchObject({ spotId: kept.spots[0]!.id, names: ['001.jpg', '002.jpg'], at: at(11, 20), atFrom: 'series', source: 'phone' });
  });

  it('a host without the phone capture greys the phone and says why, once', async () => {
    ready();
    render(<DayTab w={w} lang="en" host={{ ...MNEMO, capabilities: [] }} />);
    fireEvent.click(await screen.findByRole('button', { name: /salle/ }));
    await screen.findByRole('slider', { name: w.day.timeline });
    openPanel();
    expect(screen.getByRole('button', { name: `${w.day.addPhone} · ${w.day.unplaced}` })).toBeDisabled();
    expect(screen.getByText(w.day.phoneMissing)).toBeInTheDocument();
  });

  it('a folder with no photo adds nothing and says so', async () => {
    ready();
    host.selectFolder.mockResolvedValue('C:/Users/p/empty');
    host.readDir.mockResolvedValue([{ name: 'readme.md', isDirectory: false, path: 'C:/Users/p/empty/readme.md', mtime: at(9) }]);
    await openDay();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${w.day.addFolder} · ${w.day.unplaced}` })); });
    expect(await screen.findByRole('alert')).toHaveTextContent(w.day.folderEmpty);
  });

  it('photos without a spot wait to be placed, then are pinned where the eye stands', async () => {
    ready();
    host.selectFolder.mockResolvedValue('C:/Users/p/day');
    host.readDir.mockResolvedValue([{ name: 'x.jpg', isDirectory: false, path: 'C:/Users/p/day/x.jpg', mtime: at(13, 30) }]);
    await openDay();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${w.day.addFolder} · ${w.day.unplaced}` })); });
    fireEvent.click(await screen.findByRole('button', { name: w.day.placeHere }));
    expect(screen.queryByRole('button', { name: w.day.placeHere })).not.toBeInTheDocument();
    await waitFor(() => expect(savedDays().days.days[0]!.moments[0]!.spotId).not.toBeNull(), { timeout: 2000 });
  });

  describe('the photos placed by the host', () => {
    const DIR = 'C:/Users/p/day';
    const asked = async () => {
      host.selectFolder.mockResolvedValue(DIR);
      host.readDir.mockResolvedValue([
        { name: 'x.jpg', isDirectory: false, path: `${DIR}/x.jpg`, mtime: at(13, 30) },
        { name: 'y.jpg', isDirectory: false, path: `${DIR}/y.jpg`, mtime: at(13, 31) },
      ]);
      await openDay();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${w.day.addFolder} · ${w.day.unplaced}` })); });
    };
    const done = (placed: unknown[]) => ({ placeId: HALL, photos: [`${DIR}/x.jpg`, `${DIR}/y.jpg`], step: 'done', placed, error: null });

    it('photos without a spot are placed where they were taken: a spot is made there, and each photo keeps its viewpoint', async () => {
      ready();
      host.placePhotos.mockResolvedValue({ step: 'preparing' });
      host.placeStatus.mockResolvedValue(done([{ photo: `${DIR}/y.jpg`, centre: [2, 0, 1], look: [0, 0, 1], up: [0, 1, 0] }]));
      await asked();
      await waitFor(() => expect(host.placePhotos).toHaveBeenCalledWith(HALL, [`${DIR}/x.jpg`, `${DIR}/y.jpg`]));
      expect(await screen.findByText(fill(w.day.placedN, { n: 1, total: 2 }), {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => {
        const d = savedDays().days.days[0] as unknown as { spots: Array<{ id: string; pose: unknown }>; moments: Array<{ spotId: string | null; poses: unknown; placeTried: boolean }> };
        expect(d.spots).toHaveLength(1);
        expect(d.spots[0]!.pose).toEqual({ position: [2, 0, 1], dir: [0, 0, 1] });
        expect(d.moments[0]!.spotId).toBe(d.spots[0]!.id);
        expect(d.moments[0]!.poses).toEqual([{ name: 'y.jpg', pose: { position: [2, 0, 1], dir: [0, 0, 1] } }]);
        expect(d.moments[0]!.placeTried).toBe(true);
      }, { timeout: 3000 });
      // Asked once: a moment tried is not asked again by itself.
      expect(host.placePhotos).toHaveBeenCalledTimes(1);
    }, 15_000);

    it('photos the host cannot place keep the moment waiting for a spot, said in the guide', async () => {
      ready();
      host.placePhotos.mockResolvedValue({ step: 'preparing' });
      host.placeStatus.mockResolvedValue(done([]));
      await asked();
      expect(await screen.findByText(w.day.placedNone, {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => {
        const m = savedDays().days.days[0]!.moments[0] as unknown as { spotId: string | null; placeTried: boolean };
        expect(m.spotId).toBeNull();
        expect(m.placeTried).toBe(true);
      }, { timeout: 3000 });
      expect(savedDays().days.days[0]!.spots).toEqual([]);
    }, 15_000);

    it('replaying flies to where a placed photo was taken, not to its spot', async () => {
      ready();
      const spotA = { id: 'sA', name: 'Stand A', pose: { position: [0, 0, 0], dir: [1, 0, 0] }, createdAt: 0 };
      const day = {
        id: 'd1', placeId: HALL, placeName: 'salle', createdAt: at(8), spots: [spotA],
        moments: [{ id: 'm1', at: at(12), atFrom: 'exif', spotId: 'sA', dir: 'C:/p', names: ['1.jpg'], source: 'folder', placeTried: true,
          poses: [{ name: '1.jpg', pose: { position: [3, 0, 3], dir: [0, 0, -1] } }] }],
      };
      localStorage.setItem(DAYS_KEY, JSON.stringify({ days: [day] }));
      localStorage.setItem('lab3d.day.current', 'd1');
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: w.day.play })); });
      expect(stage.flights[0]).toEqual({ position: [3, 0, 3], dir: [0, 0, -1] });
      expect(host.placePhotos).not.toHaveBeenCalled();
    });
  });

  it('playing the day flies to the spots in the order of their moments, and Stop gives the eye back', async () => {
    ready();
    const spotA = { id: 'sA', name: 'Stand A', pose: { position: [0, 0, 0], dir: [1, 0, 0] }, createdAt: 0 };
    const spotB = { id: 'sB', name: 'Stand B', pose: { position: [5, 0, 0], dir: [0, 0, 1] }, createdAt: 0 };
    const day = {
      id: 'd1', placeId: HALL, placeName: 'salle', createdAt: at(8), spots: [spotA, spotB],
      moments: [
        { id: 'm1', at: at(12), atFrom: 'exif', spotId: 'sA', dir: 'C:/p', names: ['1.jpg'], source: 'folder' },
        { id: 'm2', at: at(10), atFrom: 'exif', spotId: 'sB', dir: 'C:/p', names: ['2.jpg'], source: 'folder' },
      ],
    };
    localStorage.setItem(DAYS_KEY, JSON.stringify({ days: [day] }));
    localStorage.setItem('lab3d.day.current', 'd1');
    render(<DayTab w={w} lang="en" host={MNEMO} />);
    await screen.findByRole('slider', { name: w.day.timeline });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: w.day.play })); });
    // The earlier moment first: Stand B at 10:00.
    expect(stage.flights[0]).toEqual(spotB.pose);
    expect(await screen.findByRole('dialog', { name: 'Stand B' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.day.stop }));
    expect(stage.stops).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: w.day.play })).toBeInTheDocument();
  });

  it('a flight the person interrupts opens no photo', async () => {
    ready();
    const day = {
      id: 'd1', placeId: HALL, placeName: 'salle', createdAt: at(8),
      spots: [{ id: 'sA', name: 'Stand A', pose: { position: [0, 0, 0], dir: [1, 0, 0] }, createdAt: 0 }],
      moments: [{ id: 'm1', at: at(12), atFrom: 'exif', spotId: 'sA', dir: 'C:/p', names: ['1.jpg'], source: 'folder' }],
    };
    localStorage.setItem(DAYS_KEY, JSON.stringify({ days: [day] }));
    localStorage.setItem('lab3d.day.current', 'd1');
    render(<DayTab w={w} lang="en" host={MNEMO} />);
    await screen.findByRole('slider', { name: w.day.timeline });
    openPanel();
    stage.arrive = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: w.day.goTo })); });
    expect(stage.flights).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('days that could not be read are never written over', async () => {
    ready();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.stateGet.mockRejectedValue(new Error('TIMEOUT'));
    render(<DayTab w={w} lang="en" host={MNEMO} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/TIMEOUT/);
    expect(screen.queryByRole('button', { name: /salle/ })).not.toBeInTheDocument();
    expect(host.stateSet).not.toHaveBeenCalled();
  });

  describe('the guide', () => {
    const g = w.day.guide;

    it('no place yet: one button, to film it', async () => {
      ready();
      host.list.mockResolvedValue({ objects: [] });
      const film = vi.fn();
      render(<DayTab w={w} lang="en" host={MNEMO} onCreatePlace={film} />);
      expect(await screen.findByText(g.placeTitle)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: g.placeGo }));
      expect(film).toHaveBeenCalled();
    });

    it('a place being built: it says so, and its button shows the job', async () => {
      ready();
      host.list.mockResolvedValue({ objects: [] });
      const see = vi.fn();
      render(<DayTab w={w} lang="en" host={MNEMO} onCreatePlace={see} placeBuilding />);
      expect(await screen.findByText(g.buildingTitle)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: g.buildingGo }));
      expect(see).toHaveBeenCalled();
    });

    it('walks the day: start on the newest place, pin the spot, take a moment there, then says one is due', async () => {
      ready();
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      expect(await screen.findByText(g.readyTitle)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: g.readyGo }));
      await screen.findByRole('slider', { name: w.day.timeline });
      expect(stage.loads).toEqual([{ walk: true }]);
      // Step 2: the spot, where the eye stands.
      fireEvent.click(screen.getByRole('button', { name: g.spotGo }));
      await waitFor(() => expect(savedDays().days.days[0]!.spots).toHaveLength(1), { timeout: 2000 });
      // Step 3: a moment, from the phone, at that spot.
      fireEvent.click(screen.getByRole('button', { name: g.momentGo }));
      await act(async () => { fireEvent.click(await screen.findByRole('button', { name: w.day.phoneTitle })); });
      expect(await screen.findByRole('dialog', { name: 'Spot 1' })).toBeInTheDocument();
      // The photo open hides the guide; closed, the guide says the moment (11:20) is long past at 15:00.
      expect(screen.queryByText(g.due)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: w.day.closePhoto }));
      expect(screen.getByText(g.due)).toBeInTheDocument();
      await waitFor(() => expect(savedDays().days.days[0]!.moments).toHaveLength(1), { timeout: 2000 });
      const kept = savedDays().days.days[0]! as unknown as { spots: Array<{ id: string }>; moments: Array<{ spotId: string }> };
      expect(kept.moments[0]!.spotId).toBe(kept.spots[0]!.id);
    });

    it('« End of day » offers the 3D scan of the tattoo, and the way back', async () => {
      ready();
      const scan = vi.fn();
      const day = {
        id: 'd1', placeId: HALL, placeName: 'salle', createdAt: at(8),
        spots: [{ id: 'sA', name: 'Stand A', pose: { position: [0, 0, 0], dir: [1, 0, 0] }, createdAt: 0 }], moments: [],
      };
      localStorage.setItem(DAYS_KEY, JSON.stringify({ days: [day] }));
      localStorage.setItem('lab3d.day.current', 'd1');
      render(<DayTab w={w} lang="en" host={MNEMO} onCreateObject={scan} />);
      fireEvent.click(await screen.findByRole('button', { name: g.endDay }));
      fireEvent.click(screen.getByRole('button', { name: g.scanTattoo }));
      expect(scan).toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: g.backToMoments }));
      expect(screen.getByRole('button', { name: g.momentGo })).toBeInTheDocument();
    });

    it('« End of day » completes the place with the photos the host placed, then shows the build', async () => {
      ready();
      host.complete.mockResolvedValue({ id: 'job' });
      const see = vi.fn();
      const pose = { position: [0, 0, 0], dir: [1, 0, 0] };
      const day = {
        id: 'd1', placeId: HALL, placeName: 'salle', createdAt: at(8), spots: [SPOT_A],
        moments: [
          { id: 'm1', at: at(12), atFrom: 'exif', spotId: 'sA', dir: 'C:/p', names: ['1.jpg', '2.jpg'], source: 'folder', placeTried: true, poses: [{ name: '2.jpg', pose }] },
          { id: 'm2', at: at(14), atFrom: 'exif', spotId: 'sA', dir: 'C:/p', names: ['3.jpg'], source: 'folder', placeTried: true, poses: [{ name: '3.jpg', pose }] },
        ],
      };
      localStorage.setItem(DAYS_KEY, JSON.stringify({ days: [day] }));
      localStorage.setItem('lab3d.day.current', 'd1');
      render(<DayTab w={w} lang="en" host={MNEMO} onCreatePlace={see} />);
      fireEvent.click(await screen.findByRole('button', { name: g.endDay }));
      // Two of the three photos were placed: those two complete the place.
      fireEvent.click(screen.getByRole('button', { name: fill(g.complete, { n: 2 }) }));
      expect(screen.getByText(fill(g.completeLine, { n: 2 }))).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: g.completeQuick }));
      await waitFor(() => expect(host.complete).toHaveBeenCalledWith(HALL, ['C:/p/2.jpg', 'C:/p/3.jpg'], 'preview'));
      await waitFor(() => expect(see).toHaveBeenCalled());
    });

    it('while a place is being built, « Complete the place » waits, without saying « One moment » for hours', async () => {
      ready();
      const pose = { position: [0, 0, 0], dir: [1, 0, 0] };
      storeDay([SPOT_A], [{ ...momentAt('m1', at(12), 'sA'), placeTried: true, poses: [{ name: 'm1.jpg', pose }] }]);
      render(<DayTab w={w} lang="en" host={MNEMO} placeBuilding />);
      fireEvent.click(await screen.findByRole('button', { name: g.endDay }));
      expect(screen.getByRole('button', { name: fill(g.complete, { n: 1 }) })).toBeDisabled();
      expect(screen.queryByText(w.create.acting)).not.toBeInTheDocument();
    });

    it('with no photo placed by the host, « End of day » offers no completion', async () => {
      ready();
      storeDay([SPOT_A], [momentAt('m1', at(12), 'sA')]);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      fireEvent.click(await screen.findByRole('button', { name: g.endDay }));
      expect(screen.queryByRole('button', { name: new RegExp(g.complete.replace('({n} photos)', '')) })).not.toBeInTheDocument();
      expect(host.complete).not.toHaveBeenCalled();
    });

    it('a completion the host refuses is said, and nothing is shown as started', async () => {
      ready();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      host.complete.mockRejectedValue(new Error('NO_PHOTO_PLACED'));
      const see = vi.fn();
      const pose = { position: [0, 0, 0], dir: [1, 0, 0] };
      storeDay([SPOT_A], [{ ...momentAt('m1', at(12), 'sA'), placeTried: true, poses: [{ name: 'm1.jpg', pose }] }]);
      render(<DayTab w={w} lang="en" host={MNEMO} onCreatePlace={see} />);
      fireEvent.click(await screen.findByRole('button', { name: g.endDay }));
      fireEvent.click(screen.getByRole('button', { name: fill(g.complete, { n: 1 }) }));
      fireEvent.click(screen.getByRole('button', { name: g.completeFull }));
      expect(await screen.findByText(w.create.errors.NO_PHOTO_PLACED)).toBeInTheDocument();
      expect(host.complete).toHaveBeenCalledWith(HALL, ['C:/p/m1.jpg'], 'full');
      expect(see).not.toHaveBeenCalled();
    });

    it('hides on its button and stays hidden', async () => {
      ready();
      await openDay();
      fireEvent.click(screen.getByRole('button', { name: g.show }));
      expect(screen.queryByRole('button', { name: g.spotGo })).not.toBeInTheDocument();
      expect(localStorage.getItem('lab3d.day.guide')).toBe('off');
    });

    it('hidden once, it stays hidden when the tab opens again', async () => {
      ready();
      localStorage.setItem('lab3d.day.guide', 'off');
      storeDay([], []);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      expect(screen.queryByRole('button', { name: g.spotGo })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: g.show })).toHaveAttribute('aria-pressed', 'false');
    });

    it('a day already on the newest place is resumed, never doubled by an empty one', async () => {
      ready();
      storeDay([SPOT_A], [momentAt('m1', at(10), 'sA')], false);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      expect(await screen.findByText(g.resumeTitle)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: g.resumeGo }));
      await screen.findByRole('slider', { name: w.day.timeline });
      // The kept day, with its spot: the guide is at the moments.
      expect(screen.getByRole('button', { name: g.momentGo })).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem(DAYS_KEY)!).days).toHaveLength(1);
    });

    it('the open day can be deleted from the guide, asked once: the tab goes back to the choice of the place', async () => {
      ready();
      storeDay([SPOT_A], [momentAt('m1', at(10), 'sA')]);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      fireEvent.click(screen.getByRole('button', { name: g.removeDay }));
      fireEvent.click(within(screen.getByRole('group', { name: w.day.removeSure })).getByRole('button', { name: w.day.keep }));
      expect(JSON.parse(localStorage.getItem(DAYS_KEY)!).days).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: g.removeDay }));
      fireEvent.click(within(screen.getByRole('group', { name: w.day.removeSure })).getByRole('button', { name: w.day.removeYes }));
      // Back on the choice of the place, with nothing to resume.
      expect(await screen.findByText(g.readyTitle)).toBeInTheDocument();
      expect(localStorage.getItem('lab3d.day.current')).toBeNull();
      await waitFor(() => expect(savedDays().days.days).toEqual([]), { timeout: 2000 });
    });

    it('what fails through the guide is said in the guide, the panel being closed', async () => {
      ready();
      storeDay([], []);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      stage.eye = null;
      fireEvent.click(screen.getByRole('button', { name: g.spotGo }));
      expect(screen.getByRole('alert')).toHaveTextContent(w.day.noEye);
    });

    it('the guide hidden and the panel closed, what fails is still said over the scene', async () => {
      ready();
      localStorage.setItem('lab3d.day.guide', 'off');
      storeDay([SPOT_A], [momentAt('m1', at(12), 'sA')]);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      // A spot this scene cannot reach: its moment is clicked on the timeline.
      stage.arrive = false;
      stage.scale = null;
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Stand A/ })); });
      expect(screen.getByRole('alert')).toHaveTextContent(w.day.flyFailed);
    });

    it('a folder the host refuses says why, through the guide', async () => {
      ready();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      storeDay([SPOT_A], []);
      host.selectFolder.mockResolvedValue('D:/DCIM');
      host.readDir.mockRejectedValue(new Error('Access denied: path outside user home directory'));
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: g.fromFolder })); });
      expect(await screen.findByRole('alert')).toHaveTextContent(/Access denied/);
    });

    it('a phone series the host closed without « Done » is offered, and becomes the spot\'s moment', async () => {
      ready();
      // The day already holds the series « used » as a phone moment.
      storeDay([SPOT_A], [{ ...momentAt('m0', at(12), 'sA'), source: 'phone', dir: 'C:\\app\\series\\used' }]);
      phone.status.mockResolvedValue({ series: [
        { id: 'old', photos: 9, startedAt: at(7), dir: 'C:\\app\\series\\old' },
        { id: 'used', photos: 4, startedAt: at(12), dir: 'C:\\app\\series\\used' },
        { id: 's9', photos: 6, startedAt: at(11), dir: 'C:\\app\\series\\s9' },
      ] });
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      // Only a series opened since the day began (8:00) and used by no day: six photos, not nine, not four.
      expect(await screen.findByText(fill(g.waitingLine, { n: 6 }), {}, { timeout: 4000 })).toBeInTheDocument();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: g.waitingGo })); });
      expect(await screen.findByRole('dialog', { name: 'Stand A' })).toBeInTheDocument();
      await waitFor(() => expect(savedDays().days.days[0]!.moments).toHaveLength(2), { timeout: 2000 });
      expect(savedDays().days.days[0]!.moments.find((m) => m.names.length === 6)).toMatchObject({ spotId: 'sA', names: ['001.jpg', '002.jpg', '003.jpg', '004.jpg', '005.jpg', '006.jpg'] });
    });

    it('with two spots, the tile chosen decides where the moment goes', async () => {
      ready();
      storeDay([SPOT_A, SPOT_B], [momentAt('m1', at(10), 'sA')]);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      expect(screen.getByRole('radio', { name: 'Stand A' })).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(screen.getByRole('radio', { name: 'Stand B' }));
      fireEvent.click(screen.getByRole('button', { name: g.momentGo }));
      await act(async () => { fireEvent.click(await screen.findByRole('button', { name: w.day.phoneTitle })); });
      await waitFor(() => expect(savedDays().days.days[0]!.moments).toHaveLength(2), { timeout: 2000 });
      expect(savedDays().days.days[0]!.moments.find((m) => m.names[0] === '001.jpg')?.spotId).toBe('sB');
    });

    it('« Play the day » waits for a placed moment, like the timeline', async () => {
      ready();
      storeDay([SPOT_A], [momentAt('m1', at(10), null)]);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      fireEvent.click(await screen.findByRole('button', { name: g.endDay }));
      // The guide's and the timeline's: both wait.
      const plays = screen.getAllByRole('button', { name: g.replay });
      expect(plays).toHaveLength(2);
      for (const b of plays) expect(b).toBeDisabled();
    });
  });

  describe('a moment once taken', () => {
    it('is corrected and removed where it is seen, its photo; removing asks twice', async () => {
      ready();
      storeDay([SPOT_A], [momentAt('m1', at(12), 'sA')]);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Stand A/ })); });
      const photo = await screen.findByRole('dialog', { name: 'Stand A' });
      // Later than the hour on the timeline: without the hour following it, the spot would show nothing yet.
      fireEvent.change(within(photo).getByLabelText(w.day.momentTime), { target: { value: '15:30' } });
      await waitFor(() => expect(savedDays().days.days[0]!.moments[0]!.at).toBe(at(15, 30)), { timeout: 2000 });
      // The hour followed the moment: the photo shown is still this one.
      expect(within(screen.getByRole('dialog', { name: 'Stand A' })).getByText('1 / 1')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: w.day.removeMoment }));
      // Asked once: the moment is still on screen.
      expect(within(screen.getByRole('dialog', { name: 'Stand A' })).getByText('1 / 1')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: w.day.removeMomentSure }));
      await waitFor(() => expect(savedDays().days.days[0]!.moments).toHaveLength(0), { timeout: 2000 });
    });

    it('still to place, it is removed only on the second click', async () => {
      ready();
      storeDay([], [momentAt('m1', at(12), null)]);
      render(<DayTab w={w} lang="en" host={MNEMO} />);
      await screen.findByRole('slider', { name: w.day.timeline });
      openPanel();
      fireEvent.click(screen.getByRole('button', { name: w.day.removeMoment }));
      expect(screen.getByRole('button', { name: w.day.placeHere })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: w.day.removeMomentSure }));
      expect(screen.queryByRole('button', { name: w.day.placeHere })).not.toBeInTheDocument();
    });
  });

  it('a playback whose flight the person interrupts stops, and opens no photo', async () => {
    ready();
    storeDay([SPOT_A], [momentAt('m1', at(12), 'sA')]);
    render(<DayTab w={w} lang="en" host={MNEMO} />);
    await screen.findByRole('slider', { name: w.day.timeline });
    stage.arrive = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: w.day.play })); });
    expect(stage.flights).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.day.play })).toBeInTheDocument();
  });

  it('a change still waiting to be written is written when the tab goes away', async () => {
    ready();
    const { unmount } = render(<DayTab w={w} lang="en" host={MNEMO} />);
    fireEvent.click(await screen.findByRole('button', { name: /salle/ }));
    await screen.findByRole('slider', { name: w.day.timeline });
    // The day itself was written already; the spot is the change still waiting.
    await waitFor(() => expect(host.stateSet).toHaveBeenCalled(), { timeout: 2000 });
    host.stateSet.mockClear();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: w.day.addSpot }));
    unmount();
    // Well before the 400 ms the write waits otherwise.
    await waitFor(() => expect(host.stateSet).toHaveBeenCalled(), { timeout: 150 });
    expect(savedDays().days.days[0]!.spots).toHaveLength(1);
  });
});
