import { describe, expect, it } from 'vitest';
import { railFrom, railProgress } from './stepRailModel';

describe('stepRailModel', () => {
  const ids = ['read', 'decode', 'stage'];

  it('lights everything before the current step, the current one, nothing after', () => {
    expect(railFrom(ids, 0)).toEqual(['active', 'pending', 'pending']);
    expect(railFrom(ids, 1)).toEqual(['done', 'active', 'pending']);
    expect(railFrom(ids, 3)).toEqual(['done', 'done', 'done']);
  });

  it('marks the step that stopped as failed, and leaves the rest pending', () => {
    expect(railFrom(ids, 1, true)).toEqual(['done', 'failed', 'pending']);
  });

  it('counts an active step as half done, and a failure as stopped', () => {
    expect(railProgress(['done', 'active', 'pending', 'pending'])).toBe(0.375);
    expect(railProgress(['done', 'failed', 'pending'])).toBeCloseTo(1 / 3);
    expect(railProgress([])).toBe(0);
  });
});
