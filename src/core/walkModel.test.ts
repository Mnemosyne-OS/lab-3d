import { describe, expect, it } from 'vitest';
import {
  MAX_PITCH, NO_HOLD, RUN_FACTOR, bestStart, clampToZone, easeStep, fromBasis, heldOf, lookDir, lookOf, pushOf, startPose, stepOf, toBasis,
  turnBy, walkBasis, walkKey, walkZone, type WalkKey,
} from './walkModel';
import type { Rig } from './stageModel';

type V = [number, number, number];
const close = (x: V, y: V, digits = 6) => x.forEach((v, i) => expect(v).toBeCloseTo(y[i]!, digits));
const dot = (x: V, y: V) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];

/** A scene leaning on its side: the vertical is x, not y. */
const tiltedUp: V = [1, 0, 0];

/** A walk along a corridor: 5 cameras every 1 unit along z, at height 1.6, filming a point ahead. */
const corridor: Rig = {
  target: [0, 1.6, 6],
  up: [0, 1, 0],
  cams: [[0, 1.6, 0], [0, 1.6, 1], [0, 1.6, 2], [0, 1.7, 3], [0, 1.5, 4]],
};

describe('walkBasis', () => {
  it('is orthonormal and right-handed (a × b = up), also for a tilted vertical', () => {
    for (const up of [[0, 1, 0], tiltedUp, [0.3, -0.9, 0.2]] as V[]) {
      const k = walkBasis(up)!;
      expect(Math.hypot(...k.up)).toBeCloseTo(1);
      expect(dot(k.a, k.b)).toBeCloseTo(0);
      expect(dot(k.a, k.up)).toBeCloseTo(0);
      const ab: V = [k.a[1] * k.b[2] - k.a[2] * k.b[1], k.a[2] * k.b[0] - k.a[0] * k.b[2], k.a[0] * k.b[1] - k.a[1] * k.b[0]];
      close(ab, k.up);
    }
    expect(walkBasis([0, 0, 0])).toBeNull();
  });

  it('goes to the basis and back without changing the point', () => {
    const k = walkBasis([0.3, -0.9, 0.2])!;
    close(fromBasis(k, toBasis(k, [1.5, -2, 7])), [1.5, -2, 7]);
  });
});

describe('walkZone', () => {
  it('holds the filmed path with a margin, and the eye within the filmed heights', () => {
    const z = walkZone(corridor)!;
    // Inside the path: unchanged.
    expect(clampToZone(z, [0, 1.6, 2])).toEqual([0, 1.6, 2]);
    // Far past the end of the corridor: brought back to the edge, not further than the margin.
    const past = toBasis(z.basis, clampToZone(z, [0, 1.6, 40]));
    const end = toBasis(z.basis, [0, 1.6, 4]);
    const along = Math.abs(past[0] - end[0]) + Math.abs(past[1] - end[1]);
    expect(along).toBeGreaterThan(0);
    expect(along).toBeLessThan(1.5);
    // Through the floor or the ceiling: back to the heights the cameras had (1.5 to 1.7), give or take 5 % of the scene.
    expect(z.scale).toBeCloseTo(4);
    expect(clampToZone(z, [0, -3, 2])[1]).toBeCloseTo(1.5 - 0.05 * z.scale);
    expect(clampToZone(z, [0, 9, 2])[1]).toBeCloseTo(1.7 + 0.05 * z.scale);
  });

  it('is measured in the scene frame: a scene on its side clamps its height along its own vertical', () => {
    const side: Rig = { target: [1.6, 0, 6], up: tiltedUp, cams: corridor.cams.map(([x, y, z]) => [y, -x, z] as V) };
    const z = walkZone(side)!;
    // x is the height here: a point at x = 9 is brought down, y is free along the path's width margin.
    expect(clampToZone(z, [9, 0, 2])[0]).toBeCloseTo(1.7 + 0.05 * z.scale);
    expect(clampToZone(z, [1.6, 0, 2])).toEqual([1.6, 0, 2]);
  });

  it('a turn on the spot still leaves room for a step, and a speed that moves', () => {
    const spot: Rig = { target: [0, 1.6, 3], up: [0, 1, 0], cams: [[0, 1.6, 0], [0, 1.6, 0], [0, 1.6, 0]] };
    const z = walkZone(spot)!;
    expect(z.max[0] - z.min[0]).toBeGreaterThan(0.5);
    expect(z.speed).toBeGreaterThan(0);
  });

  it('no cameras or no vertical: no zone', () => {
    expect(walkZone({ ...corridor, cams: [] })).toBeNull();
    expect(walkZone({ ...corridor, up: [0, 0, 0] })).toBeNull();
  });
});

describe('looking', () => {
  const k = walkBasis([0, 1, 0])!;

  it('a look turned into a direction and back is the same look', () => {
    const l = { yaw: 1.1, pitch: -0.4 };
    const back = lookOf(k, lookDir(k, l));
    expect(back.yaw).toBeCloseTo(1.1);
    expect(back.pitch).toBeCloseTo(-0.4);
  });

  it('starts on the first camera, facing what was filmed, as the orbit first view does', () => {
    const s = startPose(corridor, k);
    expect(s.position).toEqual([0, 1.6, 0]);
    close(lookDir(k, s.look), [0, 0, 1]);
  });

  it('any filmed camera can be a start, an index past the last is the first', () => {
    expect(startPose(corridor, k, 2).position).toEqual([0, 1.6, 2]);
    expect(startPose(corridor, k, 99).position).toEqual([0, 1.6, 0]);
  });

  it('a camera faces where it really looked when the host wrote it, not the middle of what was filmed', () => {
    // Walking down the corridor, filming the wall on the right (+x), the target ahead.
    const looks = corridor.cams.map(() => [1, 0, 0] as V);
    close(lookDir(k, startPose({ ...corridor, looks }, k).look), [1, 0, 0]);
    close(lookDir(k, startPose({ ...corridor, looks }, k, 3).look), [1, 0, 0]);
    // A look of zero length says nothing: the middle of what was filmed again.
    close(lookDir(k, startPose({ ...corridor, looks: looks.map(() => [0, 0, 0] as V) }, k).look), [0, 0, 1]);
  });

  it('a camera sitting on the filmed centre faces the way it went next', () => {
    const s = startPose({ target: [0, 1.6, 0], up: [0, 1, 0], cams: [[0, 1.6, 0], [2, 1.6, 0]] }, k);
    close(lookDir(k, s.look), [1, 0, 0]);
  });

  it('dragging right brings the left into view, dragging down raises the view', () => {
    const l = lookOf(k, [0, 0, 1]);
    const right = cross(lookDir(k, l), k.up);
    const afterRight = lookDir(k, turnBy(l, 100, 0));
    expect(dot(afterRight, right)).toBeLessThan(0);
    expect(lookDir(k, turnBy(l, 0, 100))[1]).toBeGreaterThan(0);
  });

  it('never looks past straight up or straight down', () => {
    const l = lookOf(k, [0, 0, 1]);
    expect(turnBy(l, 0, 1e6).pitch).toBeCloseTo(MAX_PITCH);
    expect(turnBy(l, 0, -1e6).pitch).toBeCloseTo(-MAX_PITCH);
    expect(lookOf(k, [0, 1, 0]).pitch).toBeCloseTo(MAX_PITCH);
  });
});

describe('moving', () => {
  const z = walkZone(corridor)!;
  const k = z.basis;

  it('forward walks along the floor even when looking down, at the zone speed', () => {
    const l = { ...lookOf(k, [0, 0, 1]), pitch: -1 };
    const s = stepOf(z, l, { ...NO_HOLD, forward: 1 }, 0.5);
    expect(s[1]).toBeCloseTo(0);
    expect(s[2]).toBeGreaterThan(0);
    expect(Math.hypot(...s)).toBeCloseTo(z.speed * 0.5);
  });

  it('right is on the right of the view, rising goes up, Shift runs, nothing held moves nothing', () => {
    const l = lookOf(k, [0, 0, 1]);
    const r = stepOf(z, l, { ...NO_HOLD, side: 1 }, 1);
    expect(dot(r, cross(lookDir(k, l), k.up))).toBeGreaterThan(0);
    expect(stepOf(z, l, { ...NO_HOLD, rise: 1 }, 1)[1]).toBeGreaterThan(0);
    expect(Math.hypot(...stepOf(z, l, { ...NO_HOLD, forward: 1 }, 1, true))).toBeCloseTo(z.speed * RUN_FACTOR);
    expect(stepOf(z, l, NO_HOLD, 1)).toEqual([0, 0, 0]);
  });

  it('two keys at once do not walk faster than one', () => {
    const l = lookOf(k, [0, 0, 1]);
    expect(Math.hypot(...stepOf(z, l, { ...NO_HOLD, forward: 1, side: 1 }, 1))).toBeCloseTo(z.speed);
  });

  it('the wheel goes toward what the view faces, pitch included', () => {
    const l = { ...lookOf(k, [0, 0, 1]), pitch: 0.5 };
    const p = pushOf(z, l, 1);
    expect(p[1]).toBeGreaterThan(0);
    close(p.map((v) => v / Math.hypot(...p)) as V, lookDir(k, l));
  });
});

describe('bestStart', () => {
  it('starts where the most cameras stood looking the same way, never on the lonely first image', () => {
    // Camera 0 alone at the door, looking in; cameras 2 to 4 together, all looking at the window (+x).
    const rig: Rig = {
      target: [0, 1.6, 3], up: [0, 1, 0],
      cams: [[0, 1.6, -3], [0, 1.6, 0], [0.1, 1.6, 1], [0.2, 1.6, 1.1], [0, 1.6, 1.2]],
      looks: [[0, 0, 1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0]],
    };
    expect(bestStart(rig, 4)).toBe(2);
    // Together but looking every which way: no view is shared, so the first one, as before.
    expect(bestStart({ ...rig, looks: [[0, 0, 1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 0, -1]] }, 4)).toBe(0);
    // The same cameras on a scene eight times smaller: they are no longer near each other.
    expect(bestStart(rig, 0.5)).toBe(0);
  });

  it('without looks, or with looks that do not pair with the cameras, the first view as before', () => {
    expect(bestStart(corridor, 4)).toBe(0);
    expect(bestStart({ ...corridor, looks: [[1, 0, 0]] }, 4)).toBe(0);
  });
});

describe('easeStep', () => {
  it('reaches the move asked gradually, and a long frame never goes past it', () => {
    const half = easeStep([0, 0, 0], [1, 0, 0], 0.05);
    expect(half[0]).toBeCloseTo(0.5);
    expect(easeStep([0, 0, 0], [1, 0, 0], 3)).toEqual([1, 0, 0]);
    expect(easeStep([1, 0, 0], [0, 0, 0], 0)).toEqual([1, 0, 0]);
  });
});

describe('keys', () => {
  it('reads the place of a key, so WASD and ZQSD are the same keys', () => {
    expect(walkKey('KeyW')).toBe('forward');
    expect(walkKey('KeyA')).toBe('left');
    expect(walkKey('KeyS')).toBe('back');
    expect(walkKey('KeyD')).toBe('right');
    expect(walkKey('ArrowLeft')).toBe('turnLeft');
    expect(walkKey('KeyZ')).toBeNull();
  });

  it('opposite keys cancel out', () => {
    const held = heldOf(new Set<WalkKey>(['forward', 'back', 'right', 'turnLeft']));
    expect(held).toEqual({ forward: 0, side: 1, rise: 0, turn: 1 });
  });
});

function cross(x: V, y: V): V {
  return [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
}
