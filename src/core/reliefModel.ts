/**
 * The décor in relief (doc 163, « le décor en relief »): the décor's picture
 * laid on a surface shaped by its depth, so turning the object shows the room
 * move behind it, nearer things more than the far wall. Pure: the depth
 * file's encoding, the grid read from it, and where each point of the grid
 * sits. No three.js, tested with plain numbers.
 *
 * The depth is a guess of one picture (Depth Anything V2 Small, on this
 * machine): RELATIVE, not in metres. The surface is built from the camera the
 * décor was first framed from (its « anchor »), so from there it shows the
 * picture exactly; it is believable only near that view, hence the turn is
 * bounded (RELIEF_TURN_DEG) where a décor in relief is shown.
 */
import type { Vec3 } from './groundModel';

/**
 * The depth file is an 8-bit grey PNG of the relative nearness (1 = nearest),
 * stored as its SQUARE ROOT: in a room the far half of the picture holds a few
 * percent of the range, and a square root gives it four times more grey levels.
 */
export function nearnessFromGrey(grey: number): number {
  const g = Math.min(255, Math.max(0, grey)) / 255;
  return g * g;
}

/** The nearest point of the décor, in distances from the anchor camera to its centre of turn. */
export const RELIEF_NEAR = 0.45;
/** The farthest point (the back wall, a window): beyond it things barely move. */
export const RELIEF_FAR = 4;
/** How far the camera may turn from the anchor, each side, before the surface shows its seams. */
export const RELIEF_TURN_DEG = 25;
/** Grid cells across the picture's width (the height follows its shape). */
export const RELIEF_COLS = 160;
/**
 * A triangle whose corners' nearness spreads more than this spans a depth
 * JUMP (the edge of a table against the far wall), not a surface: it is moved
 * back to its farthest corner's depth, on the same rays, so turning moves it
 * with the wall instead of stretching one sheet from the table to the wall.
 * Measured on a real décor (doc 163): smooth surfaces stay under 0.03, the
 * table's outline is above 0.1, and at 0.05 the cut starts eating the table's
 * front edge. Left OUT, such a triangle was a hole even from the anchor: the
 * blurred copy behind showed through as a staircase along every edge, seen on
 * screen (doc 166 §12) after every test was green.
 */
export const RELIEF_CUT = 0.1;

/**
 * Distance along the view axis for a nearness `n` (0 = farthest, 1 =
 * nearest): interpolated in INVERSE depth, which is what a monocular model's
 * output is proportional to; a straight line in distance would flatten the
 * room into its first metre.
 */
export function reliefDepth(n: number, near: number, far: number): number {
  const t = Math.min(1, Math.max(0, n));
  return 1 / (t / near + (1 - t) / far);
}

/**
 * The nearness at each node of a `cols` × `rows` grid (one more node than
 * cells each way), read from the depth picture (`grey`, width × height, one
 * byte per pixel) by the MEDIAN over each node's neighbourhood: one stray pixel
 * must not pull the surface into a spike, and a depth jump must stay a jump.
 * A mean spread the table's edge over two cells, each half-jump stayed under
 * RELIEF_CUT, and a band of stretched surface was left along the edge.
 */
export function sampleGrid(grey: ArrayLike<number>, width: number, height: number, cols: number, rows: number): Float32Array {
  const out = new Float32Array((cols + 1) * (rows + 1));
  const rx = Math.max(1, Math.floor(width / cols / 2));
  const ry = Math.max(1, Math.floor(height / rows / 2));
  const values = new Float64Array((2 * rx + 1) * (2 * ry + 1));
  for (let j = 0; j <= rows; j++) {
    const cy = Math.round((j / rows) * (height - 1));
    for (let i = 0; i <= cols; i++) {
      const cx = Math.round((i / cols) * (width - 1));
      let count = 0;
      for (let y = Math.max(0, cy - ry); y <= Math.min(height - 1, cy + ry); y++) {
        for (let x = Math.max(0, cx - rx); x <= Math.min(width - 1, cx + rx); x++) {
          values[count++] = nearnessFromGrey(grey[y * width + x]!);
        }
      }
      // The lower middle when the count is even (a border): always a value that is there.
      out[j * (cols + 1) + i] = count ? values.subarray(0, count).sort()[(count - 1) >> 1]! : 0;
    }
  }
  return out;
}

export interface ReliefMesh {
  /** x, y, z per node, relative to the centre of turn the anchor looked at. */
  positions: Float32Array;
  /** u, v per node (v = 1 at the top, three.js's way). */
  uvs: Float32Array;
  /** Two triangles per cell, always: those at a depth jump on their own corners, set back (after the grid's nodes). */
  index: Uint32Array;
  /** Triangles set back at a depth jump. */
  cut: number;
}

/**
 * The surface: each node of the grid placed along the ray it was seen on from
 * the anchor camera, at its depth. The anchor camera stands at `offset` from
 * the centre of turn and looks at it, `up` its vertical, `fovDeg` its
 * vertical field and `aspect` the picture's width over height. From the
 * anchor, the surface covers the picture exactly; the depths are in units of
 * the anchor's distance. A triangle spanning a depth jump (`cut`, in
 * nearness) gets corners of its own, on the same rays with the same picture
 * coordinates, at its farthest corner's depth: from the anchor it still lands
 * on its own pixels, so the picture stays whole there.
 */
export function buildRelief(nearness: Float32Array, cols: number, rows: number, anchor: { offset: Vec3; up: Vec3 }, fovDeg: number, aspect: number, cut = RELIEF_CUT): ReliefMesh | null {
  const dist = Math.hypot(...anchor.offset);
  if (!(dist > 0) || !(aspect > 0) || nearness.length !== (cols + 1) * (rows + 1)) return null;
  const fwd: Vec3 = [-anchor.offset[0] / dist, -anchor.offset[1] / dist, -anchor.offset[2] / dist];
  const right = unit(cross(fwd, anchor.up));
  if (!right) return null;
  const camUp = cross(right, fwd);
  const ty = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const tx = ty * aspect;
  const nodes = (cols + 1) * (rows + 1);
  // The ray through each node's pixel, its component along the view axis being 1: times the depth is the point.
  const rays = new Float32Array(nodes * 3);
  for (let j = 0; j <= rows; j++) {
    const y = 1 - (2 * j) / rows;
    for (let i = 0; i <= cols; i++) {
      const x = (2 * i) / cols - 1;
      const k = j * (cols + 1) + i;
      for (let a = 0; a < 3; a++) rays[3 * k + a] = fwd[a]! + right[a]! * x * tx + camUp[a]! * y * ty;
    }
  }
  const index = new Uint32Array(cols * rows * 6);
  let n = 0;
  let dropped = 0;
  // The corners of the triangles set back: their node, and the nearness they are placed at.
  const backNode: number[] = [];
  const backNear: number[] = [];
  // Nearness is linear in inverse depth, so its spread measures a jump the
  // same way at the front of the room and at the back.
  const spread = (p: number, q: number, r: number) => {
    const np = nearness[p]!, nq = nearness[q]!, nr = nearness[r]!;
    return Math.max(np, nq, nr) - Math.min(np, nq, nr);
  };
  const keep = (p: number, q: number, r: number) => {
    if (spread(p, q, r) > cut) {
      dropped++;
      const far = Math.min(nearness[p]!, nearness[q]!, nearness[r]!);
      for (const v of [p, q, r]) {
        index[n++] = nodes + backNode.length;
        backNode.push(v);
        backNear.push(far);
      }
      return;
    }
    index[n++] = p; index[n++] = q; index[n++] = r;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      // Each cell splits along the diagonal that follows a jump: an edge crossing
      // it then costs one triangle instead of two, and a slanted edge reads as a
      // fine line rather than a staircase of whole cells.
      const s1 = spread(a, c, b), s2 = spread(b, c, d), s3 = spread(a, c, d), s4 = spread(a, d, b);
      const cuts12 = Number(s1 > cut) + Number(s2 > cut), cuts34 = Number(s3 > cut) + Number(s4 > cut);
      if (cuts34 < cuts12 || (cuts34 === cuts12 && s3 + s4 < s1 + s2)) {
        keep(a, c, d);
        keep(a, d, b);
      } else {
        keep(a, c, b);
        keep(b, c, d);
      }
    }
  }
  const total = nodes + backNode.length;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  for (let m = 0; m < total; m++) {
    const k = m < nodes ? m : backNode[m - nodes]!;
    const z = reliefDepth(m < nodes ? nearness[k]! : backNear[m - nodes]!, RELIEF_NEAR, RELIEF_FAR) * dist;
    for (let a = 0; a < 3; a++) positions[3 * m + a] = anchor.offset[a]! + rays[3 * k + a]! * z;
    uvs[2 * m] = (k % (cols + 1)) / cols;
    uvs[2 * m + 1] = 1 - Math.floor(k / (cols + 1)) / rows;
  }
  return { positions, uvs, index, cut: dropped };
}

/** The vertical field the whole picture spans when it is cropped to cover a view (both aspects width over height). */
export function pictureFov(cameraFovDeg: number, viewAspect: number, pictureAspect: number): number {
  const t = Math.tan((cameraFovDeg * Math.PI) / 360) * Math.max(1, viewAspect / Math.max(1e-6, pictureAspect));
  return (Math.atan(t) * 360) / Math.PI;
}

/** Rows for `cols` columns on a picture of this shape (at least 2). */
export function rowsFor(cols: number, aspect: number): number {
  return Math.max(2, Math.round(cols / Math.max(0.1, aspect)));
}

/**
 * OrbitControls' azimuth of a camera offset (radians, its own convention: the
 * offset turned so `up` is +y, then atan2(x, z)). The relief's turn is bounded
 * around the anchor's azimuth.
 */
export function orbitAzimuth(offset: Vec3, up: Vec3): number {
  const u = unit(up);
  if (!u) return 0;
  // Rotation taking u onto +y (Rodrigues), applied to the offset: only x and z are needed.
  const y: Vec3 = [0, 1, 0];
  const axis = cross(u, y);
  const s = Math.hypot(...axis);
  const c = u[1];
  let v: Vec3 = offset;
  if (s > 1e-9) {
    const k: Vec3 = [axis[0] / s, axis[1] / s, axis[2] / s];
    const kv = cross(k, offset);
    const kd = k[0] * offset[0] + k[1] * offset[1] + k[2] * offset[2];
    v = [0, 1, 2].map((i) => offset[i]! * c + kv[i]! * s + k[i]! * kd * (1 - c)) as Vec3;
  } else if (c < 0) {
    v = [-offset[0], -offset[1], offset[2]];
  }
  return Math.atan2(v[0], v[2]);
}

/** An angle brought into [-π, π] (OrbitControls' azimuth bounds are read in that range). */
export function wrapAngle(a: number): number {
  const two = 2 * Math.PI;
  let x = ((a % two) + two) % two;
  if (x > Math.PI) x -= two;
  return x;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): Vec3 | null {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null;
}
