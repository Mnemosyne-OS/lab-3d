import { describe, expect, it } from 'vitest';
import { isSceneFile } from './viewerModel';

describe('viewerModel', () => {
  it('accepts the scene formats Spark reads, whatever the case', () => {
    expect(isSceneFile('vase.SPZ')).toBe(true);
    expect(isSceneFile('room.ply')).toBe(true);
    expect(isSceneFile('a.splat')).toBe(true);
    expect(isSceneFile('a.ksplat')).toBe(true);
    expect(isSceneFile('photo.jpg')).toBe(false);
    expect(isSceneFile('ply')).toBe(false);
  });
});
