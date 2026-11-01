import { describe, expect, it } from 'vitest';
import { RELIEF_NEAR } from '../../core/reliefModel';
import { DRIFT, DRIFT_PERIODS, PICTURE_FOV_DEG, RECENT_MAX, addRecent, cameraFovToContain, driftPosition, flatSize, movedPaths, paintingName, parseRecent, seriesPhotos } from './paintingModel';

const halfTan = (deg: number) => Math.tan((deg * Math.PI) / 360);

describe('driftPosition', () => {
  it('starts at the anchor, at rest', () => {
    expect(driftPosition(0, null, true)).toEqual([0, 0, 1]);
  });

  it('drifts within its bounds and never reaches the nearest stroke', () => {
    let minZ = 1;
    for (let t = 0; t < 400; t += 0.37) {
      const [x, y, z] = driftPosition(t, { x: 1, y: -1 }, true);
      expect(Math.abs(x)).toBeLessThanOrEqual(DRIFT.sway + DRIFT.pointer + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(DRIFT.rise + DRIFT.pointer + 1e-9);
      minZ = Math.min(minZ, z);
    }
    // Forward by up to DRIFT.dolly, and the nearest stroke (1 - RELIEF_NEAR from the centre) stays well ahead.
    expect(minZ).toBeCloseTo(1 - DRIFT.dolly, 2);
    expect(minZ - (1 - RELIEF_NEAR)).toBeGreaterThan(0.2);
  });

  it('moves forward half way through the dolly cycle, back at its end', () => {
    expect(driftPosition(DRIFT_PERIODS.dolly / 2, null, true)[2]).toBeCloseTo(1 - DRIFT.dolly, 6);
    expect(driftPosition(DRIFT_PERIODS.dolly, null, true)[2]).toBeCloseTo(1, 6);
  });

  it('still: only the pointer moves the camera', () => {
    expect(driftPosition(5, null, false)).toEqual([0, 0, 1]);
    expect(driftPosition(5, { x: 1, y: 0.5 }, false)).toEqual([DRIFT.pointer, DRIFT.pointer * 0.5, 1]);
  });

  it('goes toward the pointer, and a pointer out of range is held to its edge', () => {
    const [x, y] = driftPosition(0, { x: 4, y: -9 }, false);
    expect(x).toBeCloseTo(DRIFT.pointer);
    expect(y).toBeCloseTo(-DRIFT.pointer);
    expect(driftPosition(0, { x: Number.NaN, y: 0 }, false)).toEqual([0, 0, 1]);
  });
});

describe('cameraFovToContain', () => {
  it('a view wider than the picture fits it by height, with the margin around', () => {
    const fov = cameraFovToContain(PICTURE_FOV_DEG, 2, 1, 0.9);
    expect(halfTan(fov)).toBeCloseTo(halfTan(PICTURE_FOV_DEG) / 0.9, 9);
  });

  it('a view narrower than the picture fits it by width', () => {
    const fov = cameraFovToContain(PICTURE_FOV_DEG, 0.5, 1.5, 1);
    // The picture's half width (tan · 1.5) equals the view's (tan(fov/2) · 0.5).
    expect(halfTan(fov) * 0.5).toBeCloseTo(halfTan(PICTURE_FOV_DEG) * 1.5, 9);
  });

  it('the flat picture at distance 1 spans exactly the picture field', () => {
    const { width, height } = flatSize(PICTURE_FOV_DEG, 1.25);
    expect(height / 2).toBeCloseTo(halfTan(PICTURE_FOV_DEG), 9);
    expect(width / height).toBeCloseTo(1.25, 9);
  });
});

describe('recent paintings', () => {
  it('puts the chosen one first, once, and keeps at most RECENT_MAX', () => {
    expect(addRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    const many = Array.from({ length: RECENT_MAX }, (_, i) => `p${i}`);
    const next = addRecent(many, 'new');
    expect(next).toHaveLength(RECENT_MAX);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`p${RECENT_MAX - 1}`);
  });

  it('reads back only strings, without duplicates; anything else is an empty list', () => {
    expect(parseRecent(['a', 3, '', 'a', 'b'])).toEqual(['a', 'b']);
    expect(parseRecent({ a: 1 })).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });

  it('names a phone series’ photos as the host writes them, in the folder’s separator', () => {
    expect(seriesPhotos('C:\\App\\s1\\', 2)).toEqual(['C:\\App\\s1\\001.jpg', 'C:\\App\\s1\\002.jpg']);
    expect(seriesPhotos('/home/t/s1', 1)).toEqual(['/home/t/s1/001.jpg']);
    expect(seriesPhotos('/home/t/s1', 0)).toEqual([]);
  });

  it('follows the photos of a series put away, and only them', () => {
    const list = ['C:\\App\\s1\\002.jpg', 'C:\\App\\s10\\001.jpg', 'C:\\App\\s1\\sub\\001.jpg', 'D:\\x.jpg'];
    expect(movedPaths(list, 'C:\\App\\s1', 'D:\\Peintures')).toEqual(['D:\\Peintures\\002.jpg', 'C:\\App\\s10\\001.jpg', 'C:\\App\\s1\\sub\\001.jpg', 'D:\\x.jpg']);
    expect(movedPaths(['/a/s1/001.jpg'], '/a/s1/', '/b')).toEqual(['/b/001.jpg']);
  });

  it('names a painting by its file', () => {
    expect(paintingName('C:\\Users\\t\\Peintures\\Les coquelicots.jpg')).toBe('Les coquelicots');
    expect(paintingName('/home/t/atelier/nu.bleu.png')).toBe('nu.bleu');
  });
});
