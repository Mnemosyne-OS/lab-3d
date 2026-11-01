import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fill, words } from '../../i18n/words';
import type { HostState } from '../../host/hostState';

const host = vi.hoisted(() => ({ selectImage: vi.fn(), readPicture: vi.fn(), depthStatus: vi.fn(), depth: vi.fn(), openSettings: vi.fn(), refreshPermission: vi.fn(), editPicture: vi.fn() }));
const phone = vi.hoisted(() => ({ status: vi.fn(), start: vi.fn(), stop: vi.fn(), destinations: vi.fn(), deliver: vi.fn(), deliverToNewVault: vi.fn(), deliverToFolder: vi.fn(), discard: vi.fn() }));
vi.mock('../../host/phoneDoors', async (orig) => {
  const real = await orig<typeof import('../../host/phoneDoors')>();
  return { ...real, phoneDoors: phone };
});
// The QR code is drawn on a canvas jsdom has not.
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,QR' } }));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, ...host } };
});
// Decoding a depth picture needs a real browser: the grid it gives is stood in for.
const decode = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../engine/relief', () => ({ readDepthPicture: (url: string) => decode.fn(url) }));

// Straightening draws on a 2D canvas jsdom has not: a stand-in that records the corners it was given.
const straight = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../engine/straighten', () => ({ straightened: (url: string, quad: unknown) => straight.fn(url, quad) }));

// The upright picture, the retouch and the world's layers draw on 2D canvases jsdom has not: stand-ins
// that say what they were given.
const canvases = vi.hoisted(() => ({ upright: vi.fn(), retouched: vi.fn(), world: vi.fn() }));
vi.mock('../../engine/uprightPicture', () => ({ uprightPicture: (url: string) => canvases.upright(url) }));
vi.mock('../../engine/worldCanvases', () => ({ retouched: (c: unknown) => canvases.retouched(c), worldPictures: (c: unknown) => canvases.world(c) }));

// The stage draws with WebGL, which jsdom has not: a stand-in that keeps the contract.
const stage = vi.hoisted(() => ({ made: 0, disposed: 0, shown: [] as unknown[], depths: [] as unknown[], worlds: [] as unknown[], moving: [] as boolean[], build: true }));
vi.mock('../../engine/PaintingStage', () => ({
  PaintingStage: class {
    constructor() { stage.made++; }
    async show(source: unknown) { stage.shown.push(source); return true; }
    setDepth(d: unknown) { stage.depths.push(d); return stage.build; }
    setWorld(layers: unknown) { stage.worlds.push(layers); return stage.build; }
    setMoving(on: boolean) { stage.moving.push(on); }
    dispose() { stage.disposed++; }
  },
}));

// The dive draws on a 2D canvas jsdom has not: a stand-in that shows what it was given and hands its gestures back.
vi.mock('./DiveView', () => ({
  DiveView: (p: { levels: unknown[]; source: { kind: string }; busy: boolean; note: string | null; error: string | null;
    onDive: (win: object, url: string) => void; onForget: () => void; onClose: () => void }) => (
    <div data-testid="dive">
      <span>{`levels:${p.levels.length}`}</span><span>{`source:${p.source.kind}`}</span>
      <button onClick={() => p.onDive({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 'data:image/jpeg;base64,WIN')}>dive-now</button>
      <button onClick={p.onForget}>forget-now</button><button onClick={p.onClose}>close-now</button>
      {p.note && <p>{p.note}</p>}{p.error && <p>{p.error}</p>}
    </div>
  ),
}));

import { PaintingTab } from './PaintingTab';
import { DIVE_MODEL, DIVE_PROMPT } from './diveModel';
import { formatUsd } from '../../core/decorModel';

const w = words('en');
const MNEMO: HostState = { kind: 'mnemosyne', capabilities: [], platform: 'win32' };
const WITH_PHONE: HostState = { kind: 'mnemosyne', capabilities: ['phone.photos'], platform: 'win32' };
const SERIES_DIR = 'C:\\App\\capture\\series\\s7';
const idle = (over: object = {}) => ({ active: false, url: null, address: null, seriesId: null, count: 0, phoneSeen: false, startedAt: null, lastPhotoAt: null, addresses: [{ name: 'Wi-Fi', address: '192.168.1.20' }], series: [], ...over });
const GREY = { grey: new Uint8Array([0, 255, 128, 64]), width: 2, height: 2 };
/** A 400 × 320 depth: a wall, and a board standing off it from (80,40) to (320,280). */
const BOARD = (() => {
  const w = 400, h = 320, g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x >= 80 && x < 320 && y >= 40 && y < 280 ? 170 : 40 + Math.round(y * 0.2);
  return { grey: g, width: w, height: h };
})();
let n = 0;
/** A path per test: the décor store keeps pictures and depths per path for the window's life. */
const fresh = (name: string) => `C:/Users/t/Peintures/${name}-${++n}.jpg`;

describe('PaintingTab', () => {
  beforeEach(() => {
    host.readPicture.mockImplementation(async (p: string) => `data:image/png;base64,${p}`);
    host.depthStatus.mockResolvedValue({ engine: true, weights: true, downloadBytes: 99_000_000 });
    host.depth.mockImplementation(async (p: string) => ({ path: p.replace('.jpg', '-depth.png') }));
    decode.fn.mockResolvedValue(GREY);
    host.openSettings.mockResolvedValue(undefined);
    host.refreshPermission.mockResolvedValue(true);
    canvases.upright.mockImplementation(async (url: string) => ({ kind: 'upright', url }));
    canvases.retouched.mockImplementation((c: object) => ({ kind: 'retouched', of: c }));
    canvases.world.mockImplementation((c: object) => ({ layers: [{ layer: 0, of: c }, { layer: 1, of: c }], count: 2, ms: 3 }));
    // The relief and the crop are told on the photo as it is: the world and the retouch have their own tests.
    localStorage.setItem('lab3d.paintingMode', 'relief');
    localStorage.setItem('lab3d.paintingRetouch', 'off');
  });
  afterEach(() => {
    cleanup(); localStorage.clear(); vi.restoreAllMocks();
    for (const f of Object.values(host)) f.mockReset();
    for (const f of Object.values(phone)) f.mockReset();
    decode.fn.mockReset();
    straight.fn.mockReset();
    for (const f of Object.values(canvases)) f.mockReset();
    Object.assign(stage, { made: 0, disposed: 0, shown: [], depths: [], worlds: [], moving: [], build: true });
  });

  it('makes no WebGL context before the tab is opened', () => {
    render(<PaintingTab w={w} host={MNEMO} active={false} />);
    expect(stage.made).toBe(0);
  });

  it('outside Mnemosyne it says what it needs, and makes no stage', () => {
    render(<PaintingTab w={w} host={{ kind: 'standalone' }} />);
    expect(screen.getByText(w.locked.title)).toBeInTheDocument();
    expect(stage.made).toBe(0);
  });

  it('a chosen painting is shown, then laid on the depth read on this machine', async () => {
    const p = fresh('coquelicots');
    host.selectImage.mockResolvedValue(p);
    render(<PaintingTab w={w} host={MNEMO} />);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(w.painting.choose) })[0]!);
    await waitFor(() => expect(stage.depths).toEqual([GREY]));
    expect(stage.shown).toEqual([`data:image/png;base64,${p}`]);
    expect(host.depth).toHaveBeenCalledWith(p);
    expect(await screen.findByText(w.painting.reliefOn)).toBeInTheDocument();
    // Remembered for the next opening, first in the list.
    expect(JSON.parse(localStorage.getItem('lab3d.paintings')!)).toEqual([p]);
  });

  it('opens on the last painting, and a removed one leaves the list, not the disk', async () => {
    const a = fresh('a'), b = fresh('b');
    localStorage.setItem('lab3d.paintings', JSON.stringify([a, b]));
    render(<PaintingTab w={w} host={MNEMO} />);
    await waitFor(() => expect(stage.shown).toEqual([`data:image/png;base64,${a}`]));
    fireEvent.click(screen.getAllByRole('button', { name: w.painting.forget })[0]!);
    await waitFor(() => expect(stage.shown.at(-1)).toBe(`data:image/png;base64,${b}`));
    expect(JSON.parse(localStorage.getItem('lab3d.paintings')!)).toEqual([b]);
  });

  it('without the depth model the painting stays flat and says where to get it, never downloading it', async () => {
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('nu')]));
    host.depthStatus.mockResolvedValue({ engine: true, weights: false, downloadBytes: 99_000_000 });
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(/99 MB/)).toBeInTheDocument();
    expect(host.depth).not.toHaveBeenCalled();
    expect(stage.depths).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: w.decor.openImageSettings }));
    expect(host.openSettings).toHaveBeenCalledWith('theia');
  });

  it('a host from before the relief: flat, and nothing said about a door it lacks', async () => {
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('vieux')]));
    host.depthStatus.mockRejectedValue(new Error('Unknown action image.depthStatus'));
    render(<PaintingTab w={w} host={MNEMO} />);
    await waitFor(() => expect(stage.shown).toHaveLength(1));
    await waitFor(() => expect(host.depthStatus).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(host.depth).not.toHaveBeenCalled();
  });

  it('a depth that fails is said with the host’s reason, the painting staying on stage', async () => {
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('grand')]));
    host.depth.mockRejectedValue(new Error('IMAGE_TOO_LARGE'));
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(new RegExp(w.decor.reliefErrors.IMAGE_TOO_LARGE!))).toBeInTheDocument();
    expect(stage.shown).toHaveLength(1);
  });

  it('a relief that cannot be built is said, not shown as on', async () => {
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('plat')]));
    stage.build = false;
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(new RegExp(w.decor.reliefErrors.RELIEF_NOT_BUILT!))).toBeInTheDocument();
    expect(screen.queryByText(w.painting.reliefOn)).toBeNull();
  });

  it('a closed dialog adds nothing and says nothing', async () => {
    host.selectImage.mockResolvedValue(null);
    render(<PaintingTab w={w} host={MNEMO} />);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(w.painting.choose) })[0]!);
    await waitFor(() => expect(host.selectImage).toHaveBeenCalled());
    expect(stage.shown).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('without the host’s phone capture, no phone button', () => {
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(screen.queryByRole('button', { name: new RegExp(w.painting.phone) })).toBeNull();
  });

  it('a painting taken with the phone: QR, Done, then its last photo on stage and the series shown', async () => {
    let st = idle();
    phone.status.mockImplementation(async () => st);
    phone.start.mockImplementation(async () => { st = idle({ active: true, url: 'https://192.168.1.20:5555/c/t', address: '192.168.1.20', seriesId: 's7', count: 0 }); return st; });
    render(<PaintingTab w={w} host={WITH_PHONE} />);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(w.painting.phone) })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.open }));
    await waitFor(() => expect(phone.start).toHaveBeenCalledWith('192.168.1.20'));
    // Done waits for a photo.
    const done = await screen.findByRole('button', { name: w.phone.done });
    expect(done).toBeDisabled();
    st = { ...st, count: 3, phoneSeen: true };
    await waitFor(() => expect(screen.getByRole('button', { name: w.phone.done })).toBeEnabled(), { timeout: 3000 });
    phone.stop.mockImplementation(async () => { st = idle({ series: [{ id: 's7', photos: 3, startedAt: 1, dir: SERIES_DIR }] }); return { id: 's7', photos: 3, startedAt: 1 }; });
    fireEvent.click(screen.getByRole('button', { name: w.phone.done }));
    const last = `${SERIES_DIR}\\003.jpg`;
    await waitFor(() => expect(stage.shown).toEqual([`data:image/png;base64,${last}`]));
    expect(screen.getByText(fill(w.painting.fromPhone, { n: 3 }))).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('lab3d.paintings')!)).toEqual([last]);
  });

  it('putting the photos away follows them: the painting on stage is read from where they went', async () => {
    let st = idle({ active: true, url: 'https://x/c/t', address: '192.168.1.20', seriesId: 's7', count: 1, phoneSeen: true });
    phone.status.mockImplementation(async () => st);
    phone.stop.mockImplementation(async () => { st = idle({ series: [{ id: 's7', photos: 1, startedAt: 1, dir: SERIES_DIR }] }); return { id: 's7', photos: 1, startedAt: 1 }; });
    phone.destinations.mockResolvedValue({ vaults: [] });
    phone.deliverToFolder.mockResolvedValue({ dir: 'D:\\Peintures\\Maman', photos: 1 });
    render(<PaintingTab w={w} host={WITH_PHONE} />);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(w.painting.phone) })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.done }));
    await waitFor(() => expect(stage.shown).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: w.painting.putAway }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(w.phone.folderSub) }));
    const moved = 'D:\\Peintures\\Maman\\001.jpg';
    await waitFor(() => expect(stage.shown.at(-1)).toBe(`data:image/png;base64,${moved}`));
    expect(JSON.parse(localStorage.getItem('lab3d.paintings')!)).toEqual([moved]);
    expect(screen.queryByText(fill(w.painting.fromPhone, { n: 1 }))).toBeNull();
  });

  it('the canvas found in its depth is cut out, straightened, and shown flat', async () => {
    const p = fresh('mur');
    localStorage.setItem('lab3d.paintings', JSON.stringify([p]));
    decode.fn.mockResolvedValue(BOARD);
    const flat = { width: 60, height: 60, kind: 'straightened' };
    straight.fn.mockResolvedValue(flat);
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(w.painting.canvasNote)).toBeInTheDocument();
    expect(stage.shown).toEqual([`data:image/png;base64,${p}`, flat]);
    const [, quad] = straight.fn.mock.calls[0]!;
    expect((quad as Array<{ x: number }>)[0]!.x).toBeGreaterThan(0.2);
    expect((quad as Array<{ x: number }>)[0]!.x).toBeLessThan(0.23);
    // Flat: no relief laid on a canvas.
    expect(stage.depths).toEqual([]);
    expect(screen.getByText(w.painting.cropped)).toBeInTheDocument();
  });

  it('the crop switched off: the photo goes on its relief, and the choice is remembered', async () => {
    const p = fresh('mur2');
    localStorage.setItem('lab3d.paintings', JSON.stringify([p]));
    decode.fn.mockResolvedValue(BOARD);
    straight.fn.mockResolvedValue({ width: 60, height: 60 });
    render(<PaintingTab w={w} host={MNEMO} />);
    await screen.findByText(w.painting.canvasNote);
    fireEvent.click(screen.getByRole('button', { name: w.painting.crop }));
    await waitFor(() => expect(stage.depths).toHaveLength(1));
    expect(localStorage.getItem('lab3d.paintingCrop')).toBe('off');
    expect(await screen.findByText(w.painting.reliefOn)).toBeInTheDocument();
    expect(straight.fn).toHaveBeenCalledTimes(1);
  });

  it('no canvas in the depth: said, and the photo goes on its relief', async () => {
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('scan')]));
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(w.painting.notFound)).toBeInTheDocument();
    expect(stage.depths).toEqual([GREY]);
    expect(straight.fn).not.toHaveBeenCalled();
  });

  it('a depth the host read upright is not turned again; one read as stored is', async () => {
    // A phone photo stored sideways: EXIF orientation 6.
    const tiff = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const jpeg = [0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xda, 0, 2];
    const photo = `data:image/jpeg;base64,${btoa(String.fromCharCode(...jpeg))}`;
    host.readPicture.mockImplementation(async (p: string) => (p.endsWith('-depth.png') ? 'data:image/png;base64,D' : photo));
    const stored = { grey: new Uint8Array([1, 2, 3, 4, 5, 6]), width: 3, height: 2 };
    decode.fn.mockResolvedValue(stored);

    host.depth.mockImplementation(async (p: string) => ({ path: p.replace('.jpg', '-depth.png'), upright: true }));
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('droite')]));
    const first = render(<PaintingTab w={w} host={MNEMO} />);
    await waitFor(() => expect(stage.depths).toEqual([stored]));
    first.unmount();

    stage.depths = [];
    host.depth.mockImplementation(async (p: string) => ({ path: p.replace('.jpg', '-depth.png') }));
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('couchee')]));
    render(<PaintingTab w={w} host={MNEMO} />);
    await waitFor(() => expect(stage.depths).toEqual([{ grey: new Uint8Array([4, 1, 5, 2, 6, 3]), width: 2, height: 3 }]));
  });

  it('by default: the canvas cut out, retouched, and cut into its world of colour masses', async () => {
    localStorage.removeItem('lab3d.paintingMode');
    localStorage.removeItem('lab3d.paintingRetouch');
    const p = fresh('monde');
    localStorage.setItem('lab3d.paintings', JSON.stringify([p]));
    decode.fn.mockResolvedValue(BOARD);
    const flat = { kind: 'straightened' };
    straight.fn.mockResolvedValue(flat);
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(fill(w.painting.worldNote, { n: 2 }))).toBeInTheDocument();
    const shown = { kind: 'retouched', of: flat };
    expect(stage.shown).toEqual([`data:image/png;base64,${p}`, shown]);
    expect(canvases.world).toHaveBeenCalledWith(shown);
    expect(stage.worlds).toEqual([[{ layer: 0, of: shown }, { layer: 1, of: shown }]]);
    // Not laid on a relief as well.
    expect(stage.depths).toEqual([]);
    expect(screen.getByText(w.painting.world)).toBeInTheDocument();
  });

  it('the world needs no depth: without the depth model it is made from the whole photo, and the model is still asked for', async () => {
    localStorage.setItem('lab3d.paintingMode', 'world');
    const p = fresh('sansprofondeur');
    localStorage.setItem('lab3d.paintings', JSON.stringify([p]));
    host.depthStatus.mockResolvedValue({ engine: true, weights: false, downloadBytes: 99_000_000 });
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(fill(w.painting.worldNote, { n: 2 }))).toBeInTheDocument();
    expect(canvases.world).toHaveBeenCalledWith({ kind: 'upright', url: `data:image/png;base64,${p}` });
    expect(screen.getByText(/99 MB/)).toBeInTheDocument();
    expect(straight.fn).not.toHaveBeenCalled();
  });

  it('switching to the relief and the retouch off is remembered, and the photo goes on its relief as it is', async () => {
    localStorage.setItem('lab3d.paintingMode', 'world');
    localStorage.setItem('lab3d.paintingRetouch', 'on');
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('bascule')]));
    render(<PaintingTab w={w} host={MNEMO} />);
    await screen.findByText(fill(w.painting.worldNote, { n: 2 }));
    fireEvent.click(screen.getByRole('button', { name: w.painting.worldMode }));
    await waitFor(() => expect(stage.depths).toEqual([GREY]));
    expect(localStorage.getItem('lab3d.paintingMode')).toBe('relief');
    fireEvent.click(screen.getByRole('button', { name: w.painting.retouch }));
    await waitFor(() => expect(stage.depths).toHaveLength(2));
    expect(localStorage.getItem('lab3d.paintingRetouch')).toBe('off');
    // Retouch off, relief, nothing cut: the photo stays the one shown first, no canvas made.
    expect(stage.shown.at(-1)).toEqual(expect.stringMatching(/^data:image/));
  });

  it('a world that cannot be built is said, not shown as one', async () => {
    localStorage.setItem('lab3d.paintingMode', 'world');
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('rate')]));
    stage.build = false;
    render(<PaintingTab w={w} host={MNEMO} />);
    expect(await screen.findByText(new RegExp(w.decor.reliefErrors.WORLD_NOT_BUILT!))).toBeInTheDocument();
    expect(screen.queryByText(fill(w.painting.worldNote, { n: 2 }))).toBeNull();
  });

  it('the drift pauses on a click, starts paused for less motion, and the stage is freed on leaving', async () => {
    const mm = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('calme')]));
    const { unmount } = render(<PaintingTab w={w} host={MNEMO} />);
    await waitFor(() => expect(stage.moving.at(-1)).toBe(false));
    fireEvent.click(await screen.findByRole('button', { name: w.painting.motion }));
    expect(stage.moving.at(-1)).toBe(true);
    mm.mockRestore();
    unmount();
    expect(stage.disposed).toBe(1);
  });
  it('dives one level per click, on the credits, keeps it for this painting, and forgets it on demand (doc 166 §15.5)', async () => {
    const p = fresh('plongee');
    localStorage.setItem('lab3d.paintings', JSON.stringify([p]));
    host.editPicture.mockResolvedValue({ path: 'C:/gen/level-1.png', model: DIVE_MODEL, billedUsdMicro: 61_000 });
    render(<PaintingTab w={w} lang="en" host={MNEMO} />);
    await waitFor(() => expect(stage.depths).toEqual([GREY]));
    fireEvent.click(screen.getByRole('button', { name: w.painting.diveMode }));
    // Shown as stored: the dive reads the painting upright itself.
    expect(await screen.findByText('source:upright')).toBeInTheDocument();
    expect(screen.getByText('levels:0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'dive-now' }));
    expect(await screen.findByText('levels:1')).toBeInTheDocument();
    expect(host.editPicture).toHaveBeenCalledWith(DIVE_PROMPT, '3:4', DIVE_MODEL, 'data:image/jpeg;base64,WIN');
    expect(screen.getByText(fill(w.painting.diveNote, { n: 1, usd: formatUsd(61_000, 'en')! }))).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('lab3d.paintingDives')!)).toEqual({ [`${p}|whole`]: [{ path: 'C:/gen/level-1.png', x: 0.25, y: 0.25, w: 0.5, h: 0.5 }] });
    fireEvent.click(screen.getByRole('button', { name: 'forget-now' }));
    expect(await screen.findByText('levels:0')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('lab3d.paintingDives')!)).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: 'close-now' }));
    await waitFor(() => expect(screen.queryByTestId('dive')).toBeNull());
  });

  it('a level not paid says why and keeps nothing; a permission added since is asked again, not painted behind', async () => {
    localStorage.setItem('lab3d.paintings', JSON.stringify([fresh('sans-credit')]));
    host.editPicture.mockRejectedValueOnce(new Error('CREDITS_EXHAUSTED'));
    render(<PaintingTab w={w} lang="en" host={MNEMO} />);
    await waitFor(() => expect(stage.depths).toEqual([GREY]));
    fireEvent.click(screen.getByRole('button', { name: w.painting.diveMode }));
    fireEvent.click(await screen.findByRole('button', { name: 'dive-now' }));
    expect(await screen.findByText(fill(w.painting.diveError, { error: w.decor.errors.CREDITS_EXHAUSTED! }))).toBeInTheDocument();
    expect(screen.getByText('levels:0')).toBeInTheDocument();
    expect(localStorage.getItem('lab3d.paintingDives')).toBeNull();
    host.editPicture.mockRejectedValueOnce(new Error('Unauthorized: This cartridge does not have the "image:generate" permission.'));
    fireEvent.click(screen.getByRole('button', { name: 'dive-now' }));
    expect(await screen.findByText(w.painting.diveAllowed)).toBeInTheDocument();
    expect(host.refreshPermission).toHaveBeenCalledWith('image:generate');
    expect(host.editPicture).toHaveBeenCalledTimes(2);
  });
});
