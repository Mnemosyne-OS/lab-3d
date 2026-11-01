import { describe, expect, it } from 'vitest';
import { asRig } from './rig';

const base = { target: [0, 0, 0], up: [0, 1, 0], cams: [[0, 0, 3], [3, 0, 0]] };

describe('asRig', () => {
  it('keeps where each camera looked when it pairs one to one with the cameras', () => {
    expect(asRig({ ...base, looks: [[0, 0, -1], [-1, 0, 0]] })?.looks).toEqual([[0, 0, -1], [-1, 0, 0]]);
  });

  it('an older cameras.json without looks is still a rig', () => {
    const rig = asRig(base);
    expect(rig?.cams).toHaveLength(2);
    expect(rig?.looks).toBeUndefined();
  });

  it('drops the looks rather than give one to the wrong camera', () => {
    // One look short.
    expect(asRig({ ...base, looks: [[0, 0, -1]] })?.looks).toBeUndefined();
    // A camera dropped as unreadable shifts every look after it.
    expect(asRig({ ...base, cams: [[0, 0, 3], [1, 2], [3, 0, 0]], looks: [[0, 0, -1], [1, 0, 0], [-1, 0, 0]] })?.looks).toBeUndefined();
    // A look of zero length, or not three numbers.
    expect(asRig({ ...base, looks: [[0, 0, 0], [-1, 0, 0]] })?.looks).toBeUndefined();
    expect(asRig({ ...base, looks: [[0, 0, -1], 'left'] })?.looks).toBeUndefined();
  });
});
