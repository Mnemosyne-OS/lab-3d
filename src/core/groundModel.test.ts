import { describe, expect, it } from 'vitest';
import { DECOR_FILL, DECOR_LIFT, DECOR_POLAR, MIN_POINTS, decorFraming, maxPolarAboveFloor, measureGround, type Vec3 } from './groundModel';

/** COLMAP is y-down: the cameras' up points along -y, the way real rigs come. */
const RIG = { target: [0.5, 2, -1] as Vec3, up: [0, -1, 0] as Vec3 };

interface Cloud { centers: number[]; opacity: number[] }

/** A column of splats from `low` to `high` above the target (along up), `radius` wide, seeded so runs agree. */
function column(n: number, low: number, high: number, radius: number, opacity = 0.9, seed = 1): Cloud {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const centers: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = low + (high - low) * rand();
    const a = rand() * Math.PI * 2;
    const r = radius * Math.sqrt(rand());
    // up = -y: a height h is y = target.y - h; across it, x and z.
    centers.push(RIG.target[0] + r * Math.cos(a), RIG.target[1] - h, RIG.target[2] + r * Math.sin(a));
  }
  return { centers, opacity: new Array<number>(n).fill(opacity) };
}

function join(...clouds: Cloud[]): Cloud {
  return { centers: clouds.flatMap((c) => c.centers), opacity: clouds.flatMap((c) => c.opacity) };
}

describe('measureGround', () => {
  it('finds the base and the top of an object along the cameras\' up', () => {
    const g = measureGround(...args(column(5000, -1.2, 0.8, 0.3)), RIG)!;
    expect(g.base).toBeGreaterThan(-1.2);
    expect(g.base).toBeLessThan(-1.18);
    expect(g.top).toBeGreaterThan(0.78);
    expect(g.up).toEqual([0, -1, 0]);
    // The foot is on the floor under the target: y = target.y - base.
    expect(g.foot[1]).toBeCloseTo(RIG.target[1] - g.base, 6);
    expect(Math.hypot(g.foot[0] - RIG.target[0], g.foot[2] - RIG.target[2])).toBeLessThan(0.03);
    expect(g.footRadius).toBeGreaterThan(0.2);
    expect(g.footRadius).toBeLessThan(0.31);
  });

  it('a sparse cloud far below, past a gap, is not taken for the floor (the boots of 21/10)', () => {
    const body = column(6000, -1.4, 1.8, 1);
    const below = column(120, -9, -6, 1, 0.9, 7);
    const g = measureGround(...args(join(body, below)), RIG)!;
    expect(g.base).toBeGreaterThan(-1.45);
    expect(g.base).toBeLessThan(-1.35);
  });

  it('a DENSE cloud below a gap is not the floor either: the walk stops at the gap', () => {
    // Dense enough to pass the 4 % share on its own (about a third of a body bin),
    // so only the stop on more than 2 empty bins keeps it out.
    const body = column(6000, -1.4, 1.8, 1);
    const below = column(300, -6, -5.5, 1, 0.9, 11);
    const g = measureGround(...args(join(body, below)), RIG)!;
    expect(g.base).toBeGreaterThan(-1.45);
  });

  it('a thin waist (one or two empty bins) inside the object does not cut it', () => {
    // A foot, a narrow gap of ~1.5 bins, then the denser body above it.
    const foot = column(1500, -1.4, -0.5, 0.3, 0.9, 13);
    const body = column(6000, -0.42, 1.8, 0.3, 0.9, 17);
    const g = measureGround(...args(join(foot, body)), RIG)!;
    expect(g.base).toBeLessThan(-1.3);
  });

  it('a few stray splats just under the base do not lower it: the base is a low share, not the lowest', () => {
    const body = column(6000, -1.2, 0.8, 0.3);
    const strays = column(20, -1.24, -1.24, 0.3, 0.9, 19);
    const g = measureGround(...args(join(body, strays)), RIG)!;
    expect(g.base).toBeGreaterThan(-1.21);
  });

  it('floaters far off the axis are left out even when they sit right under the object', () => {
    const body = column(4000, -1, 1, 0.3);
    // Dense, and less than two bins below the body: only the distance to the axis removes them.
    const far = column(150, -1.08, -1.02, 0.2, 0.9, 3);
    for (let i = 0; i < far.centers.length; i += 3) far.centers[i]! += 20;
    const g = measureGround(...args(join(body, far)), RIG)!;
    expect(g.base).toBeGreaterThan(-1.01);
  });

  it('a haze under the object (splats almost transparent) does not lower the floor', () => {
    // Many of them, right under the base: counted by weight they would pass the 4 % share.
    const body = column(4000, -1, 1, 0.3);
    const haze = column(6000, -1.5, -1, 0.3, 0.05, 5);
    const g = measureGround(...args(join(body, haze)), RIG)!;
    expect(g.base).toBeGreaterThan(-1.02);
  });

  it('says nothing rather than guess: too few splats, an unreadable up, a flat object', () => {
    // 199, written out: a test that follows MIN_POINTS would follow it to 1.
    expect(MIN_POINTS).toBe(200);
    expect(measureGround(...args(column(199, -1, 1, 0.3)), RIG)).toBeNull();
    expect(measureGround(...args(column(MIN_POINTS - 1, -1, 1, 0.3)), RIG)).toBeNull();
    expect(measureGround(...args(column(2000, -1, 1, 0.3)), { target: RIG.target, up: [0, 0, 0] })).toBeNull();
    expect(measureGround(...args(column(2000, 0, 0, 0.3)), RIG)).toBeNull();
  });

  it('a centre that is not a number is skipped, not counted', () => {
    const c = column(3000, -1, 1, 0.3);
    c.centers.push(NaN, 0, 0);
    c.opacity.push(1);
    const g = measureGround(...args(c), RIG)!;
    expect(g.kept).toBeLessThan(3001);
    expect(g.total).toBe(3001);
    expect(Number.isFinite(g.base)).toBe(true);
  });
});

describe('maxPolarAboveFloor', () => {
  it('lets the camera down to the floor, never under it', () => {
    // 2 from a target 1 above the floor: cos φ = -1/2, 120°.
    expect(maxPolarAboveFloor(2, 1, 0)).toBeCloseTo((2 * Math.PI) / 3, 6);
    // With air kept under the camera, a little less.
    expect(maxPolarAboveFloor(2, 1, 0.1)).toBeLessThan((2 * Math.PI) / 3);
    // A target on the floor: the horizon.
    expect(maxPolarAboveFloor(2, 0, 0)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('a camera too close to reach the floor turns freely; a target under the floor keeps it overhead', () => {
    expect(maxPolarAboveFloor(0.5, 1, 0)).toBe(Math.PI);
    expect(maxPolarAboveFloor(1, -2, 0)).toBe(0);
    expect(maxPolarAboveFloor(0, 1, 0)).toBe(Math.PI);
  });
});

describe('decorFraming', () => {
  const g = measureGround(...args(column(5000, -1.2, 0.8, 0.3)), RIG)!;

  it('turns around a point above the object, from the side the video started on, looking down', () => {
    const from: Vec3 = [RIG.target[0] + 3, RIG.target[1] - 2, RIG.target[2]];
    const f = decorFraming(g, from, 60);
    const height = g.top - g.base;
    // The orbit's centre: DECOR_LIFT object heights above the floor, on the object's axis.
    expect(f.target[1]).toBeCloseTo(g.foot[1] - height * DECOR_LIFT, 6);
    const v = [f.position[0] - f.target[0], f.position[1] - f.target[1], f.position[2] - f.target[2]];
    const d = Math.hypot(v[0]!, v[1]!, v[2]!);
    expect(d).toBeCloseTo(height / (DECOR_FILL * 2 * Math.tan(Math.PI / 6)), 6);
    // The angle from the vertical (up = -y).
    expect(Math.acos(-v[1]! / d)).toBeCloseTo(DECOR_POLAR, 6);
    // On the first camera's side (+x).
    expect(v[0]!).toBeGreaterThan(0);
    // The foot sits a hair off the target (it is the footprint's mean), so the side is the camera's to within that.
    expect(Math.abs(v[2]!)).toBeLessThan(0.01 * v[0]!);
  });

  it('a first camera straight overhead still gives a side to look from', () => {
    const f = decorFraming(g, [g.foot[0], g.foot[1] - 5, g.foot[2]], 60);
    expect(f.position.every(Number.isFinite)).toBe(true);
  });
});

function args(c: Cloud): [number[], number[]] {
  return [c.centers, c.opacity];
}
