import { afterEach, describe, expect, it, vi } from 'vitest';
import { RIG, piecesOf } from './fakeHost.test-util';

const host = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../host/doors', () => ({ doors: { read: host.read } }));

import { loadScene } from './sceneLoad';

const ID = '20261021-192953-vase';

describe('loadScene', () => {
  afterEach(() => { host.read.mockReset(); vi.restoreAllMocks(); });

  it('reads the cameras, the scope and the scene the manifest names', async () => {
    host.read.mockImplementation(piecesOf({
      [`${ID}/cameras.json`]: JSON.stringify(RIG),
      [`${ID}/manifest.json`]: JSON.stringify({ scope: 'object', files: { scene: 'scene.spz' } }),
      [`${ID}/scene.spz`]: new Uint8Array([9, 8, 7]),
    }));
    const shares: number[] = [];
    const r = await loadScene(ID, (s) => shares.push(s));
    expect(r).toMatchObject({ ok: true, fileName: 'scene.spz', scope: 'object', rig: RIG });
    expect(r.ok && Array.from(r.bytes)).toEqual([9, 8, 7]);
    expect(shares.at(-1)).toBe(1);
  });

  it('a missing named scene opens from the other file, an object without cameras is framed from its points', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.read.mockImplementation(piecesOf({
      [`${ID}/manifest.json`]: JSON.stringify({ files: { scene: 'scene.spz' } }),
      [`${ID}/scene.ply`]: new Uint8Array([1]),
    }));
    const r = await loadScene(ID);
    expect(r).toMatchObject({ ok: true, fileName: 'scene.ply', rig: null, scope: null });
  });

  it('cameras that are not a rig count as none, never as a broken view', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withCams = (cams: unknown) => piecesOf({
      [`${ID}/cameras.json`]: JSON.stringify(cams),
      [`${ID}/scene.ply`]: new Uint8Array([1]),
    });
    host.read.mockImplementation(withCams({ target: [0, 0], up: [0, 1, 0], cams: [[0, 0, 3]] }));
    expect(await loadScene(ID)).toMatchObject({ ok: true, rig: null });
    host.read.mockImplementation(withCams({ target: [0, 0, 0], up: [0, 1, 0], cams: [] }));
    expect(await loadScene(ID)).toMatchObject({ ok: true, rig: null });
  });

  it('an error other than a missing file is said, and the other file is not tried', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files = piecesOf({ [`${ID}/manifest.json`]: JSON.stringify({ files: { scene: 'scene.spz' } }), [`${ID}/scene.ply`]: new Uint8Array([1]) });
    host.read.mockImplementation(async (id: string, file: string, offset: number) => {
      if (file === 'scene.spz') throw new Error('Unauthorized: dialog:open');
      return files(id, file, offset);
    });
    const r = await loadScene(ID);
    expect(r).toEqual({ ok: false, error: 'Unauthorized: dialog:open' });
    expect(host.read.mock.calls.map((c) => c[1])).not.toContain('scene.ply');
  });
});
