/**
 * canvasCrop — the painted canvas found in a photo and straightened (doc 166
 * §15.2). Pure: plain arrays in, plain arrays out, no DOM.
 *
 * The canvas is found in the DEPTH picture, not in its colours: a canvas is a
 * flat board standing off the wall, so its depth is continuous inside and
 * jumps at its edges, whatever is painted on it (measured on Tony's first
 * photo, 24/10: steps of 15 to 40 grey levels at the edges, under 0.2 per
 * pixel inside). The region is grown from the centre while the depth stays
 * continuous AND no edge is near: the step from pixel to pixel alone leaked
 * through one-pixel ramps along the edge (the model's map is upsampled 8 times,
 * its jumps are soft), and the region spread over the whole wall (the upright
 * depth of the same photo, 24/10). Its four corners are the extremes along the
 * two diagonals, and the photo is warped from that quadrilateral into a
 * rectangle.
 *
 * A phone stores a photo sideways with an EXIF « orientation » tag; the
 * browser shows it upright, the host's depth model reads it as stored. The
 * depth is turned like the photo before anything is read from it.
 *
 * @module features/painting/canvasCrop
 */

/** Normalised point, 0..1 across the picture's width and height. */
export interface Pt { x: number; y: number }
/** The canvas's corners: top left, top right, bottom right, bottom left. */
export type Quad = [Pt, Pt, Pt, Pt];

/** Two neighbouring depth pixels differing by more than this are on two sides of an edge. */
export const EDGE_STEP = 2;
/**
 * A pixel is ON an edge when the depth changes by this much or more across
 * EDGE_SPAN pixels on either side of it, along a row or a column. Measured on
 * the upright depth: inside the canvas and on the wall at most 3 (95 % under
 * 5), across the canvas's edges 25 and more; the region found is the same for
 * any value from 6 to 10.
 */
export const EDGE_STRENGTH = 8;
export const EDGE_SPAN = 3;
/** A canvas smaller than this share of the photo is not one (a detail, a shadow). */
export const MIN_AREA = 0.08;
/** Larger than this, the photo is already the canvas alone (a scan, a crop): nothing to do. */
export const MAX_AREA = 0.97;
/**
 * The region must fill its quadrilateral this much, and spill out of it no
 * more than the inverse: a ragged region, or one reaching past its corners
 * (a cross, a star), is not a board.
 */
export const MIN_FILL = 0.85;
/** Each side is trimmed by this share, so the frame's shadow and the wall stay out. */
export const EDGE_TRIM = 0.008;

/**
 * The EXIF orientation of a JPEG (1 to 8), read from its first bytes; 1 when
 * there is none or the bytes are not a JPEG. Only the APP1 « Exif » segment's
 * first directory is read, where the tag lives.
 */
export function jpegOrientation(b: Uint8Array): number {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return 1;
    const type = b[i + 1]!;
    // Start of the picture data: no more headers.
    if (type === 0xda || type === 0xd9) return 1;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (type === 0xe1 && i + 10 <= b.length && String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!) === 'Exif') {
      const t = i + 10;
      const le = b[t] === 0x49 && b[t + 1] === 0x49;
      const u16 = (o: number) => (le ? b[o]! | (b[o + 1]! << 8) : (b[o]! << 8) | b[o + 1]!);
      const u32 = (o: number) => (le ? (u16(o) | (u16(o + 2) << 16)) >>> 0 : ((u16(o) << 16) | u16(o + 2)) >>> 0);
      if (t + 8 > b.length) return 1;
      const ifd = t + u32(t + 4);
      if (ifd + 2 > b.length) return 1;
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + 12 * k;
        if (e + 12 > b.length) return 1;
        if (u16(e) === 0x0112) {
          const o = u16(e + 8);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    i += 2 + len;
  }
  return 1;
}

/** The first `bytes` of a base64 data URL, decoded; empty for anything else. */
export function dataUrlHead(url: string, bytes = 131_072): Uint8Array {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0 || !url.slice(0, comma).endsWith(';base64')) return new Uint8Array(0);
  // 4 base64 characters carry 3 bytes.
  const chars = Math.ceil(bytes / 3) * 4;
  try {
    const bin = atob(url.slice(comma + 1, comma + 1 + chars));
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out;
  } catch (err) {
    console.warn('[lab-3d] picture header unreadable, read as upright:', err);
    return new Uint8Array(0);
  }
}

/**
 * A grey picture as stored, turned the way EXIF `orientation` shows it
 * (1 to 8, the EXIF meanings; anything else leaves it as it is).
 */
export function orientGrey(grey: Uint8Array, width: number, height: number, orientation: number): { grey: Uint8Array; width: number; height: number } {
  if (orientation < 2 || orientation > 8) return { grey, width, height };
  const swap = orientation >= 5;
  const ow = swap ? height : width;
  const oh = swap ? width : height;
  const out = new Uint8Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let sx: number, sy: number;
      switch (orientation) {
        case 2: sx = width - 1 - x; sy = y; break;
        case 3: sx = width - 1 - x; sy = height - 1 - y; break;
        case 4: sx = x; sy = height - 1 - y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = y; sy = height - 1 - x; break;
        case 7: sx = width - 1 - y; sy = height - 1 - x; break;
        default: sx = width - 1 - y; sy = x; break; // 8
      }
      out[y * ow + x] = grey[sy * width + sx]!;
    }
  }
  return { grey: out, width: ow, height: oh };
}

/**
 * The canvas in an upright depth picture, or null when there is none to crop:
 * the region around the centre too small, nearly the whole photo already, or
 * too ragged to be a board.
 */
export function findCanvasQuad(grey: Uint8Array, width: number, height: number): Quad | null {
  if (width < 8 || height < 8 || grey.length !== width * height) return null;
  const strength = (k: number): number => {
    const x = k % width, y = (k - x) / width;
    const at = (xx: number, yy: number) => grey[Math.min(height - 1, Math.max(0, yy)) * width + Math.min(width - 1, Math.max(0, xx))]!;
    return Math.max(Math.abs(at(x + EDGE_SPAN, y) - at(x - EDGE_SPAN, y)), Math.abs(at(x, y + EDGE_SPAN) - at(x, y - EDGE_SPAN)));
  };
  const inside = new Uint8Array(width * height);
  const start = (height >> 1) * width + (width >> 1);
  inside[start] = 1;
  const stack = [start];
  let count = 0;
  let tl = start, tr = start, br = start, bl = start;
  const sum = (k: number) => (k % width) + Math.floor(k / width);
  const diff = (k: number) => (k % width) - Math.floor(k / width);
  while (stack.length) {
    const k = stack.pop()!;
    count++;
    if (sum(k) < sum(tl)) tl = k;
    if (sum(k) > sum(br)) br = k;
    if (diff(k) > diff(tr)) tr = k;
    if (diff(k) < diff(bl)) bl = k;
    const x = k % width;
    const v = grey[k]!;
    const next = [x > 0 ? k - 1 : -1, x < width - 1 ? k + 1 : -1, k - width, k + width];
    for (const m of next) {
      if (m < 0 || m >= grey.length || inside[m] || Math.abs(grey[m]! - v) > EDGE_STEP || strength(m) >= EDGE_STRENGTH) continue;
      inside[m] = 1;
      stack.push(m);
    }
  }
  const share = count / (width * height);
  if (share < MIN_AREA || share > MAX_AREA) return null;
  const pt = (k: number): Pt => ({ x: (k % width + 0.5) / width, y: (Math.floor(k / width) + 0.5) / height });
  const quad: Quad = [pt(tl), pt(tr), pt(br), pt(bl)];
  const area = quadArea(quad) * width * height;
  if (!(area > 0) || count / area < MIN_FILL || count / area > 1 / MIN_FILL) return null;
  return trimQuad(quad, EDGE_TRIM);
}

/** The quadrilateral's area (shoelace), in the same units as its points squared. */
export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i]!, n = q[(i + 1) % 4]!;
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Each corner moved toward the opposite one by `t` of the diagonal. */
function trimQuad(q: Quad, t: number): Quad {
  return q.map((p, i) => {
    const o = q[(i + 2) % 4]!;
    return { x: p.x + (o.x - p.x) * t, y: p.y + (o.y - p.y) * t };
  }) as Quad;
}

/**
 * The size of the straightened canvas for a source of `w` × `h` pixels: its
 * sides measured on the photo, the longer one at most `maxSide`.
 */
export function cropSize(q: Quad, w: number, h: number, maxSide: number): { width: number; height: number } {
  const len = (a: Pt, b: Pt) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
  const cw = Math.max(len(q[0], q[1]), len(q[3], q[2]));
  const ch = Math.max(len(q[0], q[3]), len(q[1], q[2]));
  const k = Math.min(1, maxSide / Math.max(cw, ch, 1));
  return { width: Math.max(1, Math.round(cw * k)), height: Math.max(1, Math.round(ch * k)) };
}

/**
 * The homography taking the output rectangle (0,0)-(ow,oh) onto the quad in
 * source pixels: the 3×3 matrix, row by row, its last entry 1. Null when the
 * quad is degenerate.
 */
export function rectToQuad(ow: number, oh: number, q: Quad, sw: number, sh: number): number[] | null {
  const src: Array<[number, number]> = [[0, 0], [ow, 0], [ow, oh], [0, oh]];
  const dst = q.map((p) => [p.x * sw, p.y * sh] as [number, number]);
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const s = solve8(A);
  return s ? [...s, 1] : null;
}

/** Gaussian elimination with partial pivoting on an 8 × 9 augmented matrix. */
function solve8(A: number[][]): number[] | null {
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12) return null;
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k <= n; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  return A.map((row, i) => row[n]! / row[i]!);
}

/**
 * The straightened canvas: each output pixel read from the source (RGBA,
 * `sw` × `sh`) through the homography `H` (from rectToQuad), bilinear.
 */
export function warpRgba(src: Uint8ClampedArray, sw: number, sh: number, H: number[], ow: number, oh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const X = x + 0.5, Y = y + 0.5;
      const d = H[6]! * X + H[7]! * Y + H[8]!;
      const u = (H[0]! * X + H[1]! * Y + H[2]!) / d - 0.5;
      const v = (H[3]! * X + H[4]! * Y + H[5]!) / d - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(u)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(v)));
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, u - x0)), fy = Math.max(0, Math.min(1, v - y0));
      const o = (y * ow + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c]!, b = src[(y0 * sw + x1) * 4 + c]!;
        const e = src[(y1 * sw + x0) * 4 + c]!, f = src[(y1 * sw + x1) * 4 + c]!;
        out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
      }
    }
  }
  return out;
}

/** A depth picture as the host made it (from the photo as stored), turned like the photo is shown. */
export function uprightDepth<T extends { grey: Uint8Array; width: number; height: number }>(pictureUrl: string, depth: T): { grey: Uint8Array; width: number; height: number } {
  return orientGrey(depth.grey, depth.width, depth.height, jpegOrientation(dataUrlHead(pictureUrl)));
}
