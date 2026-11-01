import { describe, expect, it, vi } from 'vitest';
import { DRIFT, PICTURE_FOV_DEG, flatSize } from './paintingModel';
import { BOB_SHARE, MASSES, WORLD_BACK, WORLD_FAR, WORLD_NEAR, bobOffset, boxBlur, colourMasses, lab8, layerDistance, levels, majority, planeHeight, workSize } from './worldModel';

/** A `w` × `h` RGBA picture painted by `paint(x, y)`. */
function picture(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = paint(x, y);
    p.set([r, g, b, 255], (y * w + x) * 4);
  }
  return p;
}

describe('levels', () => {
  it('stretches a dim photo to the full range, channel by channel, alpha untouched', () => {
    // Values from 40 to 140 in red, 20 to 60 in green.
    const p = picture(100, 1, (x) => [40 + x, 20 + Math.floor(x * 0.4), 90]);
    p[3] = 77;
    const out = levels(p);
    const reds = Array.from({ length: 100 }, (_, i) => out[i * 4]!);
    expect(Math.min(...reds)).toBe(0);
    expect(Math.max(...reds)).toBe(255);
    const greens = Array.from({ length: 100 }, (_, i) => out[i * 4 + 1]!);
    expect(Math.max(...greens)).toBe(255);
    expect(out[3]).toBe(77);
  });

  it('the gamma lifts the middle: half way up comes out above half', () => {
    const p = picture(101, 1, (x) => [x * 2, x * 2, x * 2]);
    const out = levels(p);
    expect(out[50 * 4]!).toBeGreaterThan(128);
  });
});

describe('lab8', () => {
  it('white, black and a pure red in 8-bit Lab units', () => {
    const [L, a, b] = lab8(255, 255, 255);
    expect(L).toBeCloseTo(255, 0); expect(a).toBeCloseTo(128, 0); expect(b).toBeCloseTo(128, 0);
    expect(lab8(0, 0, 0)[0]).toBeCloseTo(0, 5);
    const red = lab8(255, 0, 0);
    expect(red[0] / 2.55).toBeCloseTo(53.2, 0);
    expect(red[1] - 128).toBeCloseTo(80.1, 0);
  });
});

describe('the working pieces', () => {
  it('the blur keeps a flat picture flat and spreads a step', () => {
    const flat = boxBlur(new Float32Array(30).fill(7), 10, 3, 1, 2);
    for (const v of flat) expect(v).toBeCloseTo(7, 5);
    const step = new Float32Array(20).map((_, i) => (i < 10 ? 0 : 100));
    const s = boxBlur(step, 20, 1, 1, 2);
    expect(s[9]!).toBeGreaterThan(0);
    expect(s[9]!).toBeLessThan(100);
  });

  it('the majority filter takes a lone pixel into its surroundings', () => {
    const l = new Uint8Array(25).fill(1);
    l[12] = 0;
    expect(majority(l, 5, 5, 2, 3)[12]).toBe(1);
  });

  it('the working size is at most 320 tall, its shape kept', () => {
    expect(workSize(2000, 3200)).toEqual({ width: 200, height: 320 });
    expect(workSize(100, 50)).toEqual({ width: 100, height: 50 });
  });
});

describe('colourMasses', () => {
  // Four bands of colour, dark to light from left to right, on a 200 × 160 picture.
  const bands = picture(200, 160, (x) => [[30, 20, 60], [180, 40, 40], [60, 90, 200], [240, 230, 200]][Math.floor(x / 50)] as [number, number, number]);

  it('finds the bands as masses, ranked dark (far) to light (near)', () => {
    const m = colourMasses(bands, 200, 160, 4);
    const at = (x: number) => m.labels[80 * 200 + x]!;
    expect(m.count).toBe(4);
    expect(at(25)).toBe(0);
    expect(at(175)).toBe(3);
    // The red and the blue are close in lightness: only the darkest and the lightest are pinned.
    expect(new Set([at(75), at(125)])).toEqual(new Set([1, 2]));
  });

  it('gives the same masses every time: nothing random', () => {
    const rnd = vi.spyOn(Math, 'random');
    const a = colourMasses(bands, 200, 160);
    const b = colourMasses(bands, 200, 160);
    expect(a.labels).toEqual(b.labels);
    expect(rnd).not.toHaveBeenCalled();
    rnd.mockRestore();
  });

  it('fine strokes blur into one mass: alternating black and white lines are one grey, not two masses', () => {
    const p = picture(200, 160, (x, y) => (x < 100 ? (y % 2 ? [250, 250, 250] : [5, 5, 5]) : [60, 160, 60]));
    const m = colourMasses(p, 200, 160, 2);
    const left = new Set<number>();
    for (let y = 20; y < 140; y++) for (let x = 10; x < 80; x++) left.add(m.labels[y * 200 + x]!);
    expect(left.size).toBe(1);
    expect(m.labels[80 * 200 + 150]).not.toBe([...left][0]);
  });

  it('a stray stroke inside a mass does not make a mass of its own', () => {
    const p = picture(200, 160, (x, y) => (Math.abs(x - 100) < 2 && Math.abs(y - 80) < 2 ? [250, 250, 250] : x < 100 ? [30, 30, 30] : [200, 60, 40]));
    const m = colourMasses(p, 200, 160, 2);
    expect(m.labels[80 * 200 + 100]).toBe(m.labels[80 * 200 + 150]);
  });
});

describe('the world in space', () => {
  it('the layers spread from far to near, and the canvas stands behind them all', () => {
    expect(layerDistance(0)).toBe(WORLD_FAR);
    expect(layerDistance(MASSES - 1)).toBeCloseTo(WORLD_NEAR, 9);
    for (let r = 1; r < MASSES; r++) expect(layerDistance(r)).toBeLessThan(layerDistance(r - 1));
    expect(WORLD_BACK).toBeGreaterThan(WORLD_FAR);
  });

  it('from the anchor every layer covers exactly the picture: its height grows with its distance', () => {
    const at1 = flatSize(PICTURE_FOV_DEG, 1).height;
    for (const d of [WORLD_NEAR, 1, WORLD_FAR, WORLD_BACK]) expect(planeHeight(d) / d).toBeCloseTo(at1, 9);
  });

  it('the camera never goes through the nearest layer', () => {
    // The camera stands at distance 1 from the centre and comes forward by DRIFT.dolly at most.
    expect(WORLD_NEAR - DRIFT.dolly).toBeGreaterThan(0.4);
  });

  it('a layer bobs a little, nearer ones more, and not at all when the drift is still', () => {
    expect(bobOffset(1.3, 2, layerDistance(2), false)).toBe(0);
    let farMax = 0, nearMax = 0;
    for (let t = 0; t < 10; t += 0.05) {
      farMax = Math.max(farMax, Math.abs(bobOffset(t, 0, layerDistance(0), true)));
      nearMax = Math.max(nearMax, Math.abs(bobOffset(t, MASSES - 1, layerDistance(MASSES - 1), true)));
    }
    expect(nearMax / planeHeight(layerDistance(MASSES - 1))).toBeGreaterThan(farMax / planeHeight(layerDistance(0)));
    expect(nearMax).toBeLessThanOrEqual(BOB_SHARE * planeHeight(layerDistance(MASSES - 1)) * 1.4 + 1e-12);
  });
});
