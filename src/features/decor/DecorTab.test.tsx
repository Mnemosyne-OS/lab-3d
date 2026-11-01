import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { words } from '../../i18n/words';
import type { ObjectEntry } from '../../core/model';
import type { HostState } from '../../host/hostState';
import { RIG, piecesOf } from '../objects/fakeHost.test-util';

const host = vi.hoisted(() => ({
  list: vi.fn(), read: vi.fn(), stateGet: vi.fn(), stateSet: vi.fn(), selectImage: vi.fn(), readPicture: vi.fn(), drawPicture: vi.fn(), refreshPermission: vi.fn(),
  depthStatus: vi.fn(), depth: vi.fn(), openSettings: vi.fn(),
}));
// Decoding a depth picture needs a real browser: the grid it gives is stood in for.
const depthPic = vi.hoisted(() => ({ grey: new Uint8Array([0, 255, 128, 64]), width: 2, height: 2 }));
const decode = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../engine/relief', () => ({ readDepthPicture: (url: string) => decode.fn(url) }));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, ...host } };
});

// The stage draws with WebGL, which jsdom has not: a stand-in that keeps the contract.
const stage = vi.hoisted(() => ({
  grounded: true,
  loads: [] as unknown[],
  backdrops: [] as Array<[string | null, unknown]>,
  listener: null as ((f: unknown) => void) | null,
  reliefs: [] as unknown[],
}));
vi.mock('../../engine/SplatStage', () => ({
  SplatStage: class {
    async load(_b: Uint8Array, _n: string, opts: { rig?: unknown; floor?: boolean; onDecoded?: () => void }) {
      stage.loads.push({ floor: opts.floor ?? false });
      opts.onDecoded?.();
      return { splats: 4321, grounded: !!opts.floor && stage.grounded, viewpoints: 3 };
    }
    async setBackdrop(url: string | null, framing: unknown) { stage.backdrops.push([url, framing]); return true; }
    setViewListener(cb: ((f: unknown) => void) | null) { stage.listener = cb; }
    setRelief(depth: unknown) { stage.reliefs.push(depth); return true; }
    setAutoRotate() {} resetView() {} close() {} dispose() {}
  },
}));

import { DecorTab } from './DecorTab';

const w = words('en');
const MNEMO: HostState = { kind: 'mnemosyne', capabilities: [], platform: 'win32' };
const obj = (id: string, scope: ObjectEntry['scope']): ObjectEntry => ({
  id, createdAt: null, quality: 'full', scope, framesKept: 100, posesPlaced: 100, coverageDeg: 334, sceneBytes: 4096, thumb: null,
});
const BOOTS = '20261021-183627-boots';
const LIST = [obj(BOOTS, 'object'), obj('20261021-110000-salon', 'scene')];
const OAK = 'C:/Users/t/.mnemosyne/generations/oak.png';
const files = piecesOf({
  [`${BOOTS}/cameras.json`]: JSON.stringify(RIG),
  [`${BOOTS}/manifest.json`]: JSON.stringify({ scope: 'object', files: { scene: 'scene.spz' } }),
  [`${BOOTS}/scene.spz`]: new Uint8Array([1, 2]),
});

async function openBoots() {
  render(<DecorTab w={w} lang="en" host={MNEMO} />);
  fireEvent.click(await screen.findByRole('radio', { name: /boots/ }));
  await waitFor(() => expect(screen.getAllByText('4,321').length).toBeGreaterThan(0));
}

describe('DecorTab', () => {
  afterEach(() => {
    cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks();
    for (const f of Object.values(host)) f.mockReset();
    stage.grounded = true; stage.loads = []; stage.backdrops = []; stage.listener = null; stage.reliefs = [];
    decode.fn.mockReset();
  });

  function ready() {
    host.list.mockResolvedValue({ objects: LIST });
    host.read.mockImplementation(files);
    host.stateGet.mockResolvedValue({ state: null });
    host.stateSet.mockResolvedValue({ ok: true });
    host.readPicture.mockResolvedValue('data:image/png;base64,AAAA');
  }

  it('outside Mnemosyne says what it needs and asks the host nothing', () => {
    render(<DecorTab w={w} lang="en" host={{ kind: 'standalone' }} />);
    expect(screen.getByText(w.locked.title)).toBeInTheDocument();
    expect(host.list).not.toHaveBeenCalled();
    expect(host.stateGet).not.toHaveBeenCalled();
  });

  it('offers only objects alone, and puts the chosen one on its floor', async () => {
    ready();
    await openBoots();
    expect(screen.queryByRole('radio', { name: /salon/ })).not.toBeInTheDocument();
    expect(stage.loads).toEqual([{ floor: true }]);
    expect(localStorage.getItem('lab3d.decorObject')).toBe(BOOTS);
  });

  it('a picture chosen on disk goes behind the object, is kept, and lights the décor step', async () => {
    ready();
    host.selectImage.mockResolvedValue(OAK);
    await openBoots();
    await act(async () => { screen.getByRole('button', { name: new RegExp(w.decor.choosePicture) }).click(); });
    await waitFor(() => expect(stage.backdrops.at(-1)).toEqual(['data:image/png;base64,AAAA', null]));
    expect(host.selectImage).toHaveBeenCalledWith(w.decor.pictures, '.mnemosyne/generations');
    const kept = host.stateSet.mock.calls.at(-1)![0].decor;
    expect(kept.decors[0]).toMatchObject({ path: OAK, billedUsdMicro: null });
    expect(kept.chosen[BOOTS]).toBe(OAK);
    expect(document.querySelectorAll('.rail-step.done').length).toBe(2);
  });

  it('a file dialog closed adds nothing and says nothing', async () => {
    ready();
    host.selectImage.mockResolvedValue(null);
    await openBoots();
    await act(async () => { screen.getByRole('button', { name: new RegExp(w.decor.choosePicture) }).click(); });
    expect(host.stateSet).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('kept décors that could not be read are never written over', async () => {
    ready();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.stateGet.mockRejectedValue(new Error('TIMEOUT'));
    await openBoots();
    expect(await screen.findByText(/The kept decors could not be read/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(w.decor.choosePicture) })).not.toBeInTheDocument();
    expect(host.stateSet).not.toHaveBeenCalled();
  });

  it('where the camera is left in a décor is kept for this object in this décor', async () => {
    ready();
    host.stateGet.mockResolvedValue({ state: { decor: { decors: [{ path: OAK, place: '', at: '' }], chosen: { [BOOTS]: OAK } } } });
    await openBoots();
    await waitFor(() => expect(stage.listener).not.toBeNull());
    vi.useFakeTimers();
    const f = { position: [1, 2, 3], target: [0, 0, 0] };
    act(() => { stage.listener!(f); });
    expect(host.stateSet).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(host.stateSet.mock.calls.at(-1)![0].decor.framing[`${BOOTS}\n${OAK}`]).toEqual(f);
  });

  it('an object without a measured floor gets no décor, and says why', async () => {
    ready();
    stage.grounded = false;
    await openBoots();
    expect(screen.getByText(w.decor.noFloor)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: w.decor.draw })).not.toBeInTheDocument();
    expect(stage.backdrops).toEqual([]);
  });

  it('a hidden tab asks and loads nothing until it is opened once', async () => {
    ready();
    localStorage.setItem('lab3d.decorObject', BOOTS);
    const { rerender } = render(<DecorTab w={w} lang="en" host={MNEMO} active={false} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(host.list).not.toHaveBeenCalled();
    expect(host.stateGet).not.toHaveBeenCalled();
    expect(stage.loads).toEqual([]);
    rerender(<DecorTab w={w} lang="en" host={MNEMO} active />);
    await waitFor(() => expect(stage.loads).toHaveLength(1));
    rerender(<DecorTab w={w} lang="en" host={MNEMO} active={false} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(stage.loads).toHaveLength(1);
  });

  it('the readout names the décor on screen, never one only remembered', async () => {
    ready();
    stage.grounded = false;
    host.stateGet.mockResolvedValue({ state: { decor: { decors: [{ path: OAK, place: '', at: '' }], chosen: { [BOOTS]: OAK } } } });
    await openBoots();
    const readout = document.querySelector('.readout')!;
    expect(readout).toHaveTextContent(w.decor.none);
    expect(readout).not.toHaveTextContent(w.decor.picked);
  });

  it('moving from an object in its décor to one without a floor, the readout stops naming the décor', async () => {
    const VASE = '20261021-185340-vase';
    ready();
    host.list.mockResolvedValue({ objects: [...LIST, obj(VASE, 'object')] });
    host.read.mockImplementation(piecesOf({
      [`${BOOTS}/cameras.json`]: JSON.stringify(RIG),
      [`${BOOTS}/scene.spz`]: new Uint8Array([1]),
      [`${VASE}/cameras.json`]: JSON.stringify(RIG),
      [`${VASE}/scene.spz`]: new Uint8Array([1]),
    }));
    host.stateGet.mockResolvedValue({ state: { decor: { decors: [{ path: OAK, place: '', at: '' }], chosen: { [BOOTS]: OAK, [VASE]: OAK } } } });
    await openBoots();
    await waitFor(() => expect(document.querySelector('.readout')).toHaveTextContent(w.decor.picked));
    stage.grounded = false;
    fireEvent.click(screen.getByRole('radio', { name: /vase/ }));
    await waitFor(() => expect(stage.loads).toHaveLength(2));
    await waitFor(() => expect(screen.getByText(w.decor.noFloor)).toBeInTheDocument());
    expect(document.querySelector('.readout')).not.toHaveTextContent(w.decor.picked);
  });

  it('a décor drawn on credits is asked in the view\'s shape and put behind the object', async () => {
    ready();
    host.drawPicture.mockResolvedValue({ path: OAK, model: 'gemini-3.1-flash-lite-image', billedUsdMicro: 39000 });
    await openBoots();
    await act(async () => { screen.getByRole('button', { name: w.decor.draw }).click(); });
    expect(host.drawPicture).toHaveBeenCalledTimes(1);
    expect(host.drawPicture.mock.calls[0]![1]).toBe('16:9');
    expect(host.drawPicture.mock.calls[0]![2]).toBe('gemini-3.1-flash-lite-image');
    await waitFor(() => expect(stage.backdrops.at(-1)![0]).toBe('data:image/png;base64,AAAA'));
    expect(screen.getByText('Billed $0.039')).toBeInTheDocument();
  });

  describe('the relief', () => {
    /** A décor already chosen for the boots (a path of its own per test: the depth is cached per path). */
    function inDecor(path: string) {
      ready();
      host.stateGet.mockResolvedValue({ state: { decor: { decors: [{ path, place: '', at: '' }], chosen: { [BOOTS]: path } } } });
      host.depthStatus.mockResolvedValue({ engine: true, weights: true, downloadBytes: 99173660 });
      host.depth.mockImplementation(async (p: string) => ({ path: p.replace(/\.png$/, '-depth.png') }));
      decode.fn.mockResolvedValue(depthPic);
    }
    const readoutRelief = () => document.querySelector('.readout')!.textContent ?? '';

    it('lays the décor on its depth when the model is here, read once beside the décor', async () => {
      inDecor('C:/u/r1.png');
      await openBoots();
      await waitFor(() => expect(stage.reliefs).toEqual([depthPic]));
      expect(host.depth).toHaveBeenCalledWith('C:/u/r1.png');
      expect(host.readPicture).toHaveBeenCalledWith('C:/u/r1-depth.png');
      expect(readoutRelief()).toContain('± 25°');
      expect(screen.getByText(/the room moves as the object turns, up to 25°/)).toBeInTheDocument();
    });

    it('the switch puts it flat, remembered, and back in relief', async () => {
      inDecor('C:/u/r2.png');
      await openBoots();
      await waitFor(() => expect(stage.reliefs).toHaveLength(1));
      fireEvent.click(screen.getByRole('button', { name: w.decor.relief }));
      await waitFor(() => expect(stage.reliefs.at(-1)).toBeNull());
      expect(localStorage.getItem('lab3d.relief')).toBe('off');
      expect(readoutRelief()).toContain(w.decor.flat);
      fireEvent.click(screen.getByRole('button', { name: w.decor.relief }));
      await waitFor(() => expect(stage.reliefs.at(-1)).toEqual(depthPic));
    });

    it('switched off before, it reads no depth at all', async () => {
      inDecor('C:/u/r3.png');
      localStorage.setItem('lab3d.relief', 'off');
      await openBoots();
      await waitFor(() => expect(stage.reliefs).toEqual([null]));
      expect(host.depthStatus).not.toHaveBeenCalled();
      expect(host.depth).not.toHaveBeenCalled();
    });

    it('a depth model not on this machine is said with its size and where it downloads; nothing is drawn', async () => {
      inDecor('C:/u/r4.png');
      host.depthStatus.mockResolvedValue({ engine: true, weights: false, downloadBytes: 99173660 });
      host.openSettings.mockResolvedValue({ page: 'theia' });
      await openBoots();
      expect(await screen.findByText(/the depth model \(99 MB\) downloads in Settings/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: w.decor.openImageSettings }));
      expect(host.openSettings).toHaveBeenCalledWith('theia');
      expect(host.depth).not.toHaveBeenCalled();
      expect(stage.reliefs).toEqual([]);
    });

    it('a host that cannot say whether it reads depths leaves the décor flat and says nothing', async () => {
      inDecor('C:/u/r5.png');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      host.depthStatus.mockRejectedValue(new Error('mock host: image.depthStatus not mocked'));
      await openBoots();
      await waitFor(() => expect(host.depthStatus).toHaveBeenCalled());
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.querySelector('.decor-note.relief-on')).toBeNull();
      expect(readoutRelief()).toContain(w.decor.flat);
    });

    it('a depth that could not be read keeps the décor flat and says why in words', async () => {
      inDecor('C:/u/r6.png');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      host.depth.mockRejectedValue(new Error('DEPTH_FLAT'));
      await openBoots();
      expect(await screen.findByRole('alert')).toHaveTextContent('The decor stays flat: this picture has no depth to read');
      expect(stage.reliefs).toEqual([]);
    });
  });
});
