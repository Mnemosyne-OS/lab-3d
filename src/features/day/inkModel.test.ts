import { describe, expect, it } from 'vitest';
import { inkBlobs, inkSpread, inkTear, photoSeed, seedOf } from './inkModel';

describe('inkModel', () => {
  it('starts as nothing and ends covering the whole picture, corners included', () => {
    expect(inkBlobs(1000, 750, 0, 7).every((b) => b.r === 0)).toBe(true);
    const main = inkBlobs(1000, 750, 1, 7)[0]!;
    // The farthest corner from the middle is half the diagonal away.
    expect(main.r).toBeGreaterThan(Math.hypot(1000, 750) / 2);
    expect([main.x, main.y]).toEqual([500, 375]);
  });

  it('spreads fast then slower, and the smaller blobs start late', () => {
    expect(inkSpread(0.25)).toBeGreaterThan(0.5);
    const early = inkBlobs(1000, 750, 0.05, 7);
    expect(early[0]!.r).toBeGreaterThan(0);
    expect(early.slice(1).every((b) => b.r === 0)).toBe(true);
  });

  it('one photo always spreads the same way, another photo another way', () => {
    expect(inkBlobs(1000, 750, 0.5, seedOf('a.jpg'))).toEqual(inkBlobs(1000, 750, 0.5, seedOf('a.jpg')));
    expect(inkBlobs(1000, 750, 0.5, seedOf('a.jpg'))).not.toEqual(inkBlobs(1000, 750, 0.5, seedOf('b.jpg')));
  });

  it('a photo\'s seed reads its length and its end, never the whole data URL', () => {
    const a = `data:image/jpeg;base64,${'A'.repeat(5000)}xyz`;
    const b = `data:image/jpeg;base64,${'A'.repeat(5000)}xyw`;
    expect(photoSeed(a)).toBe(photoSeed(a));
    expect(photoSeed(a)).not.toBe(photoSeed(b));
    // The start is not read: two photos that differ only there share a seed.
    expect(photoSeed(`X${a.slice(1)}`)).toBe(photoSeed(a));
  });

  it('the edge is torn at first and calm at the end', () => {
    expect(inkTear(1000, 0)).toBeGreaterThan(inkTear(1000, 1));
  });
});
