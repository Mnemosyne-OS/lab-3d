import { describe, expect, it } from 'vitest';
import { EDGE_TRIM, cropSize, dataUrlHead, findCanvasQuad, jpegOrientation, orientGrey, quadArea, rectToQuad, uprightDepth, warpRgba, type Quad } from './canvasCrop';

/** A JPEG's first bytes: SOI, an APP0, then an APP1 « Exif » whose first directory holds the orientation. */
function jpegWith(orientation: number | null, littleEndian = true): Uint8Array {
  const u16 = (v: number) => (littleEndian ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (littleEndian ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const entries = orientation === null ? [] : [...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0];
  const tiff = [...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(orientation === null ? 0 : 1), ...entries, ...u32(0)];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app0 = [0xff, 0xe0, 0, 6, 0x4a, 0x46, 0x49, 0x46];
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif, 0xff, 0xda, 0, 2]);
}

/** A wall (a soft gradient) with a board standing off it from (x0,y0) to (x1,y1): continuous inside, a jump at its edges. */
function wallWithBoard(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const board = x >= x0 && x < x1 && y >= y0 && y < y1;
      g[y * w + x] = Math.round(board ? 170 + x * 0.1 : 40 + y * 0.2);
    }
  }
  return g;
}

describe('jpegOrientation', () => {
  it('reads the tag in either byte order, after another header', () => {
    expect(jpegOrientation(jpegWith(6))).toBe(6);
    expect(jpegOrientation(jpegWith(8, false))).toBe(8);
  });

  it('upright when there is no tag, no Exif, or no JPEG at all', () => {
    expect(jpegOrientation(jpegWith(null))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(jpegOrientation(jpegWith(42))).toBe(1);
  });

  it('is read from the head of a data URL', () => {
    const bytes = jpegWith(6);
    const url = `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
    expect(jpegOrientation(dataUrlHead(url))).toBe(6);
    expect(dataUrlHead('C:/not/a/url.jpg')).toHaveLength(0);
  });
});

describe('orientGrey', () => {
  // 3 wide, 2 high:  1 2 3
  //                  4 5 6
  const g = new Uint8Array([1, 2, 3, 4, 5, 6]);
  it('6: turned a quarter clockwise, the stored top-left at the top right', () => {
    expect(orientGrey(g, 3, 2, 6)).toEqual({ grey: new Uint8Array([4, 1, 5, 2, 6, 3]), width: 2, height: 3 });
  });
  it('8: a quarter the other way; 3: upside down', () => {
    expect(orientGrey(g, 3, 2, 8)).toEqual({ grey: new Uint8Array([3, 6, 2, 5, 1, 4]), width: 2, height: 3 });
    expect(orientGrey(g, 3, 2, 3).grey).toEqual(new Uint8Array([6, 5, 4, 3, 2, 1]));
  });
  it('1 or an unknown value leaves it as it is', () => {
    expect(orientGrey(g, 3, 2, 1).grey).toBe(g);
    expect(orientGrey(g, 3, 2, 0).grey).toBe(g);
  });
  it('a depth is turned like the photo it was made from', () => {
    const url = `data:image/jpeg;base64,${btoa(String.fromCharCode(...jpegWith(6)))}`;
    expect(uprightDepth(url, { grey: g, width: 3, height: 2 })).toEqual({ grey: new Uint8Array([4, 1, 5, 2, 6, 3]), width: 2, height: 3 });
  });
});

describe('findCanvasQuad', () => {
  it('finds the board on its wall, corners just inside its edges', () => {
    // At the scale of a real depth (640 wide): the band an edge stops is a few pixels, under 1 %.
    const q = findCanvasQuad(wallWithBoard(400, 320, 80, 40, 320, 280), 400, 320)!;
    expect(q).not.toBeNull();
    const near = (v: number, want: number) => expect(Math.abs(v - want)).toBeLessThan(0.025);
    near(q[0].x, 0.2); near(q[0].y, 40 / 320);
    near(q[1].x, 0.8); near(q[1].y, 40 / 320);
    near(q[2].x, 0.8); near(q[2].y, 280 / 320);
    near(q[3].x, 0.2); near(q[3].y, 280 / 320);
    // Trimmed inward from the edge pixels' centres (80.5/400, 279.5/320): never on the wall.
    expect(q[0].x).toBeGreaterThan(80.5 / 400 + 0.004);
    expect(q[2].y).toBeLessThan(279.5 / 320 - 0.004);
    expect(EDGE_TRIM).toBeGreaterThan(0);
  });

  it('nothing to crop: a board too small, or the photo already the canvas alone', () => {
    // 80 × 64 of 400 × 320: 4 % of the photo, a clean board otherwise.
    expect(findCanvasQuad(wallWithBoard(400, 320, 160, 128, 240, 192), 400, 320)).toBeNull();
    expect(findCanvasQuad(wallWithBoard(400, 320, 0, 0, 400, 320), 400, 320)).toBeNull();
  });

  it('does not leak onto the wall through a soft ramp along an edge (the upright depth of 24/10)', () => {
    const w = 400, h = 320;
    const g = wallWithBoard(w, h, 80, 40, 320, 240);
    // One column under the board falls to the wall by 2 levels a pixel: each step is small,
    // the slope is not. Step by step alone, the region walked down it onto the whole wall.
    for (let y = 240; y <= 286; y++) g[y * w + 200] = 190 - 2 * (y - 240);
    const q = findCanvasQuad(g, w, h)!;
    expect(q).not.toBeNull();
    expect(q[2].y).toBeLessThan(240 / 320);
  });

  it('a ragged region is not a board', () => {
    const w = 400, h = 320;
    const g = wallWithBoard(w, h, 0, 0, 0, 0);
    // A thick cross through the centre, standing off the wall.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - 200) < 32 || Math.abs(y - 160) < 32) g[y * w + x] = 200;
    expect(findCanvasQuad(g, w, h)).toBeNull();
  });

  it('refuses a grid that is not the size it says', () => {
    expect(findCanvasQuad(new Uint8Array(10), 100, 80)).toBeNull();
  });
});

describe('straightening', () => {
  it('the size follows the sides measured on the photo, capped', () => {
    const q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.9 }, { x: 0.1, y: 0.9 }];
    expect(cropSize(q, 1000, 1000, 4000)).toEqual({ width: 500, height: 800 });
    expect(cropSize(q, 1000, 1000, 400)).toEqual({ width: 250, height: 400 });
    expect(quadArea(q)).toBeCloseTo(0.4, 9);
  });

  it('warps the quadrilateral onto the rectangle: what was inside fills it', () => {
    const sw = 40, sh = 30;
    const src = new Uint8ClampedArray(sw * sh * 4);
    // A red board from (10,5) to (30,25) on a blue wall.
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const o = (y * sw + x) * 4;
        const board = x >= 10 && x < 30 && y >= 5 && y < 25;
        src[o] = board ? 220 : 10; src[o + 2] = board ? 10 : 220; src[o + 3] = 255;
      }
    }
    const q: Quad = [{ x: 11 / sw, y: 6 / sh }, { x: 29 / sw, y: 6 / sh }, { x: 29 / sw, y: 24 / sh }, { x: 11 / sw, y: 24 / sh }];
    const H = rectToQuad(18, 18, q, sw, sh)!;
    const out = warpRgba(src, sw, sh, H, 18, 18);
    for (let i = 0; i < 18 * 18; i++) {
      expect(out[i * 4]).toBe(220);
      expect(out[i * 4 + 2]).toBe(10);
    }
  });

  it('a slanted quadrilateral lands its corners on the rectangle’s corners', () => {
    const q: Quad = [{ x: 0.2, y: 0.1 }, { x: 0.9, y: 0.2 }, { x: 0.8, y: 0.9 }, { x: 0.1, y: 0.8 }];
    const H = rectToQuad(50, 70, q, 200, 100)!;
    const map = (x: number, y: number) => {
      const d = H[6]! * x + H[7]! * y + H[8]!;
      return [(H[0]! * x + H[1]! * y + H[2]!) / d, (H[3]! * x + H[4]! * y + H[5]!) / d];
    };
    expect(map(0, 0)[0]).toBeCloseTo(40, 6); expect(map(0, 0)[1]).toBeCloseTo(10, 6);
    expect(map(50, 0)[0]).toBeCloseTo(180, 6); expect(map(50, 0)[1]).toBeCloseTo(20, 6);
    expect(map(50, 70)[0]).toBeCloseTo(160, 6); expect(map(50, 70)[1]).toBeCloseTo(90, 6);
    expect(map(0, 70)[0]).toBeCloseTo(20, 6); expect(map(0, 70)[1]).toBeCloseTo(80, 6);
  });

  it('a degenerate quadrilateral has no straightening', () => {
    const p = { x: 0.5, y: 0.5 };
    expect(rectToQuad(10, 10, [p, p, p, p], 100, 100)).toBeNull();
  });
});
