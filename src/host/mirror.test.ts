import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ stateGet: vi.fn(), stateSet: vi.fn() }));
vi.mock('./doors', () => ({ doors: host }));

import { writeMirrorKey } from './mirror';

describe('mirror', () => {
  beforeEach(() => { host.stateGet.mockReset(); host.stateSet.mockReset(); });

  it('changes its own key and keeps the others the host has', async () => {
    host.stateGet.mockResolvedValue({ state: { decor: { decors: [1] }, other: 2 } });
    host.stateSet.mockResolvedValue({ ok: true });
    await writeMirrorKey('days', { days: [] });
    expect(host.stateSet).toHaveBeenCalledWith({ decor: { decors: [1] }, other: 2, days: { days: [] } });
  });

  it('writes one after the other: the second write reads what the first wrote', async () => {
    let blob: Record<string, unknown> = {};
    host.stateGet.mockImplementation(async () => ({ state: { ...blob } }));
    host.stateSet.mockImplementation(async (s: Record<string, unknown>) => { await new Promise((r) => setTimeout(r, 5)); blob = s; });
    await Promise.all([writeMirrorKey('decor', 'a'), writeMirrorKey('days', 'b')]);
    expect(blob).toEqual({ decor: 'a', days: 'b' });
  });

  it('a blob that could not be read is never written over, and the next write still runs', async () => {
    host.stateGet.mockRejectedValueOnce(new Error('TIMEOUT')).mockResolvedValue({ state: null });
    await expect(writeMirrorKey('days', 1)).rejects.toThrow('TIMEOUT');
    expect(host.stateSet).not.toHaveBeenCalled();
    await writeMirrorKey('days', 2);
    expect(host.stateSet).toHaveBeenCalledWith({ days: 2 });
  });
});
