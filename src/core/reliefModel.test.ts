import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  RELIEF_CUT, RELIEF_FAR, RELIEF_NEAR, buildRelief, nearnessFromGrey, orbitAzimuth, pictureFov, reliefDepth, rowsFor, sampleGrid, wrapAngle,
} from './reliefModel';
import type { Vec3 } from './groundModel';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const node = (p: Float32Array, k: number): Vec3 => [p[3 * k]!, p[3 * k + 1]!, p[3 * k + 2]!];

describe('the depth file', () => {
  it('stores the nearness as its square root', () => {
    expect(nearnessFromGrey(0)).toBe(0);
    expect(nearnessFromGrey(255)).toBe(1);
    // Mid grey is a quarter of the range: the far half of a room gets the grey levels.
    expect(nearnessFromGrey(128)).toBeCloseTo((128 / 255) ** 2, 9);
    expect(nearnessFromGrey(-4)).toBe(0);
    expect(nearnessFromGrey(300)).toBe(1);
  });
});

describe('reliefDepth', () => {
  it('goes from the far wall to the nearest point, in inverse depth', () => {
    expect(reliefDepth(0, RELIEF_NEAR, RELIEF_FAR)).toBeCloseTo(RELIEF_FAR, 9);
    expect(reliefDepth(1, RELIEF_NEAR, RELIEF_FAR)).toBeCloseTo(RELIEF_NEAR, 9);
    // Halfway in nearness is the harmonic mean, much nearer than the straight-line middle.
    const mid = reliefDepth(0.5, RELIEF_NEAR, RELIEF_FAR);
    expect(mid).toBeCloseTo(1 / (0.5 / RELIEF_NEAR + 0.5 / RELIEF_FAR), 9);
    expect(mid).toBeLessThan((RELIEF_NEAR + RELIEF_FAR) / 2);
  });

  it('clamps a nearness outside [0, 1]', () => {
    expect(reliefDepth(-1, RELIEF_NEAR, RELIEF_FAR)).toBeCloseTo(RELIEF_FAR, 9);
    expect(reliefDepth(2, RELIEF_NEAR, RELIEF_FAR)).toBeCloseTo(RELIEF_NEAR, 9);
  });
});

describe('sampleGrid', () => {
  it('reads one value per node, a grid of (cols + 1) × (rows + 1)', () => {
    const grey = new Uint8Array(40 * 20).fill(255);
    const g = sampleGrid(grey, 40, 20, 8, 4);
    expect(g.length).toBe(9 * 5);
    expect([...g].every((v) => v === 1)).toBe(true);
  });

  it('reads a neighbourhood, so one stray pixel is not a spike', () => {
    const w = 40, h = 40;
    const grey = new Uint8Array(w * h);
    grey[20 * w + 20] = 255;
    const g = sampleGrid(grey, w, h, 4, 4);
    // The centre node sits on the stray pixel.
    expect(g[2 * 5 + 2]).toBe(0);
  });

  it('keeps a depth jump a jump: no node lands halfway', () => {
    const w = 64, h = 16;
    // Near on the left, far on the right, the edge between two node positions.
    const grey = new Uint8Array(w * h).map((_, p) => (p % w < 30 ? 255 : 0));
    const g = sampleGrid(grey, w, h, 16, 4);
    // A mean would put the node nearest the edge in between, splitting the jump over two cells.
    expect([...g].every((v) => v === 0 || v === 1)).toBe(true);
  });

  it('reads the top of the picture into the top row of the grid', () => {
    const w = 10, h = 10;
    const grey = new Uint8Array(w * h);
    // A band, not a one-pixel line: a line that thin is what the median drops as stray.
    for (let p = 0; p < 3 * w; p++) grey[p] = 255;
    const g = sampleGrid(grey, w, h, 2, 2);
    expect(g[0]).toBeGreaterThan(g[2 * 3]!);
  });
});

describe('buildRelief', () => {
  const anchor = { offset: [0, 0.3, 2] as Vec3, up: [0, 1, 0] as Vec3 };
  const cols = 4, rows = 2, fov = 50, aspect = 2;

  it('puts every node on the ray its pixel was seen on from the anchor', () => {
    const nearness = new Float32Array((cols + 1) * (rows + 1)).map((_, k) => (k % 3) / 2);
    const mesh = buildRelief(nearness, cols, rows, anchor, fov, aspect)!;
    const dist = Math.hypot(...anchor.offset);
    const fwd: Vec3 = [-anchor.offset[0] / dist, -anchor.offset[1] / dist, -anchor.offset[2] / dist];
    const ty = Math.tan((fov * Math.PI) / 360);
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const k = j * (cols + 1) + i;
        // The camera stands AT the offset from the centre of turn.
        const v = sub(node(mesh.positions, k), anchor.offset);
        const z = dot(v, fwd);
        expect(z).toBeCloseTo(reliefDepth(nearness[k]!, RELIEF_NEAR, RELIEF_FAR) * dist, 5);
        // Projected back, the node lands on its own pixel: the picture is shown exactly from there.
        const perp = sub(v, [fwd[0] * z, fwd[1] * z, fwd[2] * z]);
        const right = [1, 0, 0] as Vec3;
        expect(dot(perp, right) / (z * ty * aspect)).toBeCloseTo((2 * i) / cols - 1, 5);
      }
    }
  });

  it('puts the top of the picture up and its left on the left', () => {
    const mesh = buildRelief(new Float32Array((cols + 1) * (rows + 1)).fill(0.5), cols, rows, anchor, fov, aspect)!;
    const topLeft = node(mesh.positions, 0);
    const bottomRight = node(mesh.positions, (cols + 1) * (rows + 1) - 1);
    expect(topLeft[1]).toBeGreaterThan(bottomRight[1]);
    expect(topLeft[0]).toBeLessThan(bottomRight[0]);
    expect(mesh.uvs[0]).toBe(0);
    expect(mesh.uvs[1]).toBe(1);
  });

  it('nearer things stand nearer the camera', () => {
    const near = new Float32Array((cols + 1) * (rows + 1)).fill(1);
    const far = new Float32Array((cols + 1) * (rows + 1)).fill(0);
    const a = buildRelief(near, cols, rows, anchor, fov, aspect)!;
    const b = buildRelief(far, cols, rows, anchor, fov, aspect)!;
    const d = (m: typeof a) => Math.hypot(...sub(node(m.positions, 7), anchor.offset));
    expect(d(a)).toBeLessThan(d(b));
  });

  it('makes two triangles per cell, all inside the grid', () => {
    const mesh = buildRelief(new Float32Array((cols + 1) * (rows + 1)), cols, rows, anchor, fov, aspect)!;
    expect(mesh.index.length).toBe(cols * rows * 6);
    expect(mesh.cut).toBe(0);
    expect(Math.max(...mesh.index)).toBe((cols + 1) * (rows + 1) - 1);
  });

  // The table's edge against the far wall: one sheet stretched across it was the
  // « rubber » seen when turning (doc 163), and a triangle left out was a hole
  // even from the anchor (doc 166 §12).
  it('sets back the triangles that span a depth jump, and only those', () => {
    const c = 8, r = 3;
    const nodes = (c + 1) * (r + 1);
    // Near on the left (a table), far on the right (the wall), the jump between columns 3 and 4.
    const nearness = new Float32Array(nodes).map((_, k) => (k % (c + 1) <= 3 ? 0.9 : 0.2));
    const mesh = buildRelief(nearness, c, r, anchor, fov, aspect)!;
    // One column of cells straddles the jump: both its triangles, on every row.
    expect(mesh.cut).toBe(r * 2);
    // Nothing is left out: every cell keeps its two triangles.
    expect(mesh.index.length).toBe(c * r * 6);
    expect(mesh.positions.length).toBe((nodes + mesh.cut * 3) * 3);
    const dist = Math.hypot(...anchor.offset);
    let back = 0;
    for (let t = 0; t < mesh.index.length; t += 3) {
      const corners = [0, 1, 2].map((q) => mesh.index[t + q]!);
      if (corners.every((v) => v < nodes)) {
        const ns = corners.map((v) => nearness[v]!);
        expect(Math.max(...ns) - Math.min(...ns)).toBeLessThanOrEqual(RELIEF_CUT);
        continue;
      }
      back++;
      // A set-back triangle has corners of its own, all at the wall's depth.
      expect(corners.every((v) => v >= nodes)).toBe(true);
      for (const v of corners) {
        const fwd: Vec3 = [-anchor.offset[0] / dist, -anchor.offset[1] / dist, -anchor.offset[2] / dist];
        expect(dot(sub(node(mesh.positions, v), anchor.offset), fwd)).toBeCloseTo(reliefDepth(0.2, RELIEF_NEAR, RELIEF_FAR) * dist, 5);
      }
    }
    expect(back).toBe(mesh.cut);
  });

  it('from the anchor, every corner lands on the pixel its picture coordinates name, set-back ones included', () => {
    const c = 8, r = 3;
    const nodes = (c + 1) * (r + 1);
    const nearness = new Float32Array(nodes).map((_, k) => (k % (c + 1) <= 3 ? 0.9 : 0.2));
    const mesh = buildRelief(nearness, c, r, anchor, fov, aspect)!;
    const dist = Math.hypot(...anchor.offset);
    const fwd: Vec3 = [-anchor.offset[0] / dist, -anchor.offset[1] / dist, -anchor.offset[2] / dist];
    const right: Vec3 = [1, 0, 0];
    const ty = Math.tan((fov * Math.PI) / 360);
    const total = mesh.positions.length / 3;
    expect(total).toBeGreaterThan(nodes);
    for (let m = 0; m < total; m++) {
      const v = sub(node(mesh.positions, m), anchor.offset);
      const z = dot(v, fwd);
      // Seen from the anchor, x across the picture from -1 to 1: twice u less one.
      expect(dot(v, right) / (z * ty * aspect)).toBeCloseTo(2 * mesh.uvs[2 * m]! - 1, 5);
    }
  });

  it('a slanted edge costs one triangle per crossed cell, not the whole cell', () => {
    const c = 10, r = 6;
    // Near below the diagonal i <= j, far above it: an edge at 45°.
    const nearness = new Float32Array((c + 1) * (r + 1)).map((_, k) => (k % (c + 1) <= Math.floor(k / (c + 1)) ? 0.9 : 0.2));
    const mesh = buildRelief(nearness, c, r, anchor, fov, aspect)!;
    // Two cells per row touch the edge; split along it, each sets back one triangle (four per row otherwise).
    expect(mesh.cut).toBe(2 * r);
    const nodes = (c + 1) * (r + 1);
    for (let t = 0; t < mesh.index.length; t += 3) {
      // A set-back triangle has corners of its own, past the grid's nodes.
      if (mesh.index[t]! >= nodes) continue;
      const ns = [0, 1, 2].map((q) => nearness[mesh.index[t + q]!]!);
      expect(Math.max(...ns) - Math.min(...ns)).toBeLessThanOrEqual(RELIEF_CUT);
    }
  });

  it('keeps a surface that only recedes, however far it goes', () => {
    const c = 40, r = 4;
    // A floor going from the nearest point to the farthest across the picture.
    const ramp = new Float32Array((c + 1) * (r + 1)).map((_, k) => 1 - (k % (c + 1)) / c);
    expect(buildRelief(ramp, c, r, anchor, fov, aspect)!.cut).toBe(0);
  });

  it('cuts at the threshold it is given', () => {
    const c = 8, r = 3;
    const nearness = new Float32Array((c + 1) * (r + 1)).map((_, k) => (k % (c + 1) <= 3 ? 0.6 : 0.45));
    // A step of 0.15: a jump at the default threshold, a slope at a looser one.
    expect(buildRelief(nearness, c, r, anchor, fov, aspect)!.cut).toBe(r * 2);
    expect(buildRelief(nearness, c, r, anchor, fov, aspect, 0.2)!.cut).toBe(0);
  });

  it('refuses what it cannot place', () => {
    const n = new Float32Array((cols + 1) * (rows + 1));
    expect(buildRelief(n, cols, rows, { offset: [0, 0, 0], up: [0, 1, 0] }, fov, aspect)).toBeNull();
    expect(buildRelief(n, cols, rows, anchor, fov, 0)).toBeNull();
    expect(buildRelief(new Float32Array(3), cols, rows, anchor, fov, aspect)).toBeNull();
    // Looking straight along `up` has no right-hand side.
    expect(buildRelief(n, cols, rows, { offset: [0, 2, 0], up: [0, 1, 0] }, fov, aspect)).toBeNull();
  });
});

describe('pictureFov', () => {
  it('is the camera field when the picture is wider than the view (cropped at its sides)', () => {
    expect(pictureFov(60, 16 / 9, 21 / 9)).toBeCloseTo(60, 9);
  });

  it('opens up when the picture is narrower and is cropped top and bottom', () => {
    const f = pictureFov(60, 16 / 9, 4 / 3);
    expect(Math.tan((f * Math.PI) / 360)).toBeCloseTo(Math.tan(Math.PI / 6) * ((16 / 9) / (4 / 3)), 9);
  });
});

describe('rowsFor', () => {
  it('follows the shape of the picture, never under two', () => {
    expect(rowsFor(160, 16 / 9)).toBe(90);
    expect(rowsFor(160, 1000)).toBe(2);
  });
});

describe('orbitAzimuth', () => {
  it('reads OrbitControls convention with y up', () => {
    expect(orbitAzimuth([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.PI / 2, 9);
    expect(orbitAzimuth([0, 0, 1], [0, 1, 0])).toBeCloseTo(0, 9);
    expect(orbitAzimuth([0, 5, 1], [0, 1, 0])).toBeCloseTo(0, 9);
  });

  it('matches three.js turning `up` onto +y, for any up', () => {
    const ups: Vec3[] = [[0, 0, 1], [0.3, -0.9, 0.2], [-0.5, 0.1, -0.85], [0, -1, 0]];
    const offsets: Vec3[] = [[1, 2, 3], [-2, 0.5, 1], [0.1, -3, -2]];
    for (const up of ups) {
      const u = new Vector3(...up).normalize();
      const q = new Quaternion().setFromUnitVectors(u, new Vector3(0, 1, 0));
      for (const o of offsets) {
        const v = new Vector3(...o).applyQuaternion(q);
        expect(wrapAngle(orbitAzimuth(o, up) - Math.atan2(v.x, v.z))).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('wrapAngle', () => {
  it('brings any angle into [-π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2, 9);
    expect(wrapAngle((3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2, 9);
    expect(Math.abs(wrapAngle(5 * Math.PI))).toBeCloseTo(Math.PI, 9);
  });
});
