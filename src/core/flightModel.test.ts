import { describe, expect, it } from 'vitest';
import { FLIGHT_MAX_MS, FLIGHT_MIN_MS, easeInOut, flightAt, flightMs, shortTurn } from './flightModel';

const from = { position: [0, 0, 0] as [number, number, number], look: { yaw: 3, pitch: 0 } };
const to = { position: [10, 0, 0] as [number, number, number], look: { yaw: -3, pitch: 0.4 } };

describe('flightModel', () => {
  it('starts and ends exactly on the two eyes, slow at both ends', () => {
    expect(flightAt(from, to, 0)).toEqual(from);
    const end = flightAt(from, to, 1);
    expect(end.position).toEqual(to.position);
    expect(end.look.pitch).toBeCloseTo(0.4);
    // The look arrives at the same direction (the yaw may carry a full turn).
    expect(Math.cos(end.look.yaw)).toBeCloseTo(Math.cos(-3));
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });

  it('turns the short way round', () => {
    // From 3 rad to -3 rad is 0.28 rad across π, not 6 rad back.
    expect(shortTurn(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    // And the other way round: from -3 to 3 is the same small turn, backwards.
    expect(shortTurn(-3, 3)).toBeCloseTo(-(2 * Math.PI - 6));
    expect(shortTurn(0, 1)).toBeCloseTo(1);
    const mid = flightAt(from, to, 0.5);
    expect(Math.abs(mid.look.yaw - 3)).toBeLessThan(0.3);
  });

  it('lasts longer for a far spot or a big turn, within its bounds', () => {
    const still = flightMs(from, { ...from }, 10);
    expect(still).toBe(FLIGHT_MIN_MS);
    expect(flightMs(from, { position: [10, 0, 0], look: from.look }, 10)).toBe(FLIGHT_MAX_MS);
    expect(flightMs(from, { position: [0, 0, 0], look: { yaw: 3 - Math.PI, pitch: 0 } }, 10)).toBeGreaterThan(still);
    expect(flightMs(from, { position: [99, 0, 0], look: from.look }, 0)).toBe(FLIGHT_MAX_MS);
  });
});
