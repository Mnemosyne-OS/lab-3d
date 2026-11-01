/**
 * The dive's rules (doc 166 §15.5): each level sits inside the one before at
 * the window it was cut from, the window is 3:4 and half its parent's width,
 * the wheel zooms where the pointer is, a level shows only once it fills the
 * frame, and what is read back from storage is never guessed.
 */
import { describe, expect, it } from 'vitest';
import { DIVE_ASPECT, DIVE_PROMPT, DIVE_STEP, FADE_FULL, FADE_START, MAX_SHARPNESS, diveWindow, fitView, levelFade, levelRects, maxScale, onFrame, parseDives, zoomAt } from './diveModel';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('diveModel', () => {
  it('places each level inside the one before, at the window it was cut from', () => {
    const rects = levelRects({ width: 1000, height: 1200 }, [
      { path: 'a.png', x: 0.25, y: 0.5, w: 0.5, h: 0.25 },
      { path: 'b.png', x: 0.5, y: 0, w: 0.5, h: 0.5 },
    ]);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 1000, h: 1200 });
    expect(rects[1]).toEqual({ x: 250, y: 600, w: 500, h: 300 });
    expect(rects[2]).toEqual({ x: 500, y: 600, w: 250, h: 150 });
  });

  it('cuts a 3:4 window half as wide as its parent, around the point, kept inside', () => {
    const parent = { x: 0, y: 0, w: 900, h: 1200 };
    const mid = diveWindow(parent, 450, 600);
    close(mid.w * parent.w, DIVE_STEP * 900);
    close((mid.w * parent.w) / (mid.h * parent.h), DIVE_ASPECT);
    close(mid.x * parent.w + (mid.w * parent.w) / 2, 450);
    close(mid.y * parent.h + (mid.h * parent.h) / 2, 600);
    // A point in a corner: the window stays inside the parent.
    const corner = diveWindow(parent, 5, 1195);
    expect(corner.x).toBe(0);
    close(corner.y + corner.h, 1);
    // A flat parent: the height bounds the window, still 3:4.
    const flat = { x: 100, y: 50, w: 2000, h: 400 };
    const f = diveWindow(flat, 1100, 250);
    close(f.h * flat.h, DIVE_STEP * 400);
    close((f.w * flat.w) / (f.h * flat.h), DIVE_ASPECT);
  });

  it('fits the whole painting with a little room', () => {
    const v = fitView({ width: 1000, height: 500 }, { width: 800, height: 800 });
    expect(v).toEqual({ cx: 500, cy: 250, scale: 0.94 * 0.8 });
  });

  it('zooms where the pointer is: the painting point under it stays under it, within bounds', () => {
    const frame = { width: 800, height: 600 };
    const v = { cx: 500, cy: 400, scale: 1 };
    const under = (view: typeof v, fx: number, fy: number) => ({ x: view.cx + (fx - 400) / view.scale, y: view.cy + (fy - 300) / view.scale });
    const before = under(v, 600, 100);
    const z = zoomAt(v, 2, 600, 100, frame, 0.5, 10);
    expect(z.scale).toBe(2);
    const after = under(z, 600, 100);
    close(after.x, before.x);
    close(after.y, before.y);
    expect(zoomAt(v, 100, 0, 0, frame, 0.5, 10).scale).toBe(10);
    expect(zoomAt(v, 0.01, 0, 0, frame, 0.5, 10).scale).toBe(0.5);
  });

  it('goes no deeper than MAX_SHARPNESS screen pixels per pixel of the deepest picture', () => {
    expect(maxScale({ x: 0, y: 0, w: 100, h: 133 }, 896)).toBeCloseTo((MAX_SHARPNESS * 896) / 100, 9);
  });

  it('draws a level on the frame where the view puts it', () => {
    const r = onFrame({ x: 100, y: 200, w: 50, h: 40 }, { cx: 100, cy: 200, scale: 2 }, { width: 800, height: 600 });
    expect(r).toEqual({ x: 400, y: 300, w: 100, h: 80 });
  });

  it('shows a level only once it fills the frame, the painting always', () => {
    expect(levelFade(0, 1, 1000)).toBe(1);
    expect(levelFade(1, FADE_START * 1000, 1000)).toBe(0);
    expect(levelFade(1, 100, 1000)).toBe(0);
    close(levelFade(1, ((FADE_START + FADE_FULL) / 2) * 1000, 1000), 0.5);
    expect(levelFade(2, FADE_FULL * 1000, 1000)).toBe(1);
    expect(levelFade(2, 5000, 1000)).toBe(1);
  });

  it('reads back the kept levels, stopping at the first malformed one and never guessing', () => {
    const good = { path: 'a.png', x: 0.1, y: 0.2, w: 0.5, h: 0.5 };
    expect(parseDives({ p1: [good, { path: 'b.png', x: 2, y: 0, w: 0.5, h: 0.5 }, good], p2: [{ x: 0 }], p3: 'no' }))
      .toEqual({ p1: [good] });
    expect(parseDives(null)).toEqual({});
    expect(parseDives([good])).toEqual({});
  });

  it('keeps the shapes in place, invents the matter inside, and asks for no letters and no frame', () => {
    expect(DIVE_PROMPT).toMatch(/Keep the large shapes and colour zones exactly where they are/);
    expect(DIVE_PROMPT).toMatch(/INVENT a new, much richer layer of material/);
    expect(DIVE_PROMPT).toMatch(/No letters/);
    expect(DIVE_PROMPT).toMatch(/no frame/);
    expect(DIVE_PROMPT.length).toBeLessThanOrEqual(2000);
  });
});
