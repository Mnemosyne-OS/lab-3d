import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DECOR_STATE } from '../../core/decorModel';

const host = vi.hoisted(() => ({ stateGet: vi.fn(), stateSet: vi.fn(), drawPicture: vi.fn(), readPicture: vi.fn() }));
vi.mock('../../host/doors', () => ({ doors: host }));

import { DECOR_KEY, drawDecor, pickedDecor, readDecorState, writeDecorState } from './decorStore';

const entry = { path: 'C:/u/.mnemosyne/generations/oak.png', place: 'oak', at: '2026-10-22T20:00:00Z', model: 'm', billedUsdMicro: 40000 };

describe('decorStore', () => {
  afterEach(() => { localStorage.clear(); for (const f of Object.values(host)) f.mockReset(); vi.restoreAllMocks(); });

  it('reads the window copy first, the host copy behind it', async () => {
    localStorage.setItem(DECOR_KEY, JSON.stringify({ decors: [entry], chosen: {}, framing: {} }));
    expect(await readDecorState()).toMatchObject({ ok: true, state: { decors: [{ path: entry.path }] } });
    expect(host.stateGet).not.toHaveBeenCalled();
    localStorage.clear();
    host.stateGet.mockResolvedValue({ state: { decor: { decors: [entry] } } });
    expect(await readDecorState()).toMatchObject({ ok: true, state: { decors: [{ path: entry.path }] } });
  });

  it('a host copy that could not be asked is a failure, never an empty list', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.stateGet.mockRejectedValue(new Error('TIMEOUT'));
    expect(await readDecorState()).toEqual({ ok: false, error: 'TIMEOUT' });
    host.stateGet.mockResolvedValue({ state: null });
    expect(await readDecorState()).toEqual({ ok: true, state: EMPTY_DECOR_STATE });
  });

  it('writes both copies', async () => {
    host.stateSet.mockResolvedValue({ ok: true });
    await writeDecorState({ decors: [entry], chosen: {}, framing: {} });
    expect(JSON.parse(localStorage.getItem(DECOR_KEY)!).decors[0].path).toBe(entry.path);
    expect(host.stateSet).toHaveBeenCalledWith({ decor: { decors: [entry], chosen: {}, framing: {} } });
  });

  it('a drawn décor records what the host said it billed, and nothing when it said nothing', async () => {
    host.drawPicture.mockResolvedValueOnce({ path: 'a.png', model: 'flash', billedUsdMicro: 39000 }).mockResolvedValueOnce({ path: 'b.png' });
    expect(await drawDecor('oak', 'wood', 'fast', { width: 1600, height: 900 })).toMatchObject({ path: 'a.png', preset: 'wood', model: 'flash', billedUsdMicro: 39000 });
    expect(host.drawPicture.mock.calls[0]![1]).toBe('16:9');
    expect(await drawDecor('oak', null, 'fast', { width: 900, height: 1600 })).toMatchObject({ model: '', billedUsdMicro: null });
    host.drawPicture.mockResolvedValueOnce({});
    await expect(drawDecor('oak', null, 'fast', { width: 1, height: 1 })).rejects.toThrow('NO_PICTURE_RETURNED');
  });

  it('a picture chosen on disk is free: no model, no debit recorded', () => {
    expect(pickedDecor('C:/x.png')).toMatchObject({ path: 'C:/x.png', place: '', model: '', billedUsdMicro: null });
  });
});
