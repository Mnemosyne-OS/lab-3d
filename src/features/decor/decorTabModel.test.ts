import { describe, expect, it } from 'vitest';
import { groupVersions, type ObjectEntry } from '../../core/model';
import { decorKeyOf, decorName, fileName, guideRail, objectsAlone } from './decorTabModel';

const obj = (id: string, scope: ObjectEntry['scope'], versionOf?: string): ObjectEntry => ({
  id, createdAt: null, quality: 'full', scope, framesKept: 100, posesPlaced: 100, coverageDeg: 320, sceneBytes: 1, thumb: null, ...(versionOf ? { versionOf } : {}),
});
const presets = { marble: 'Marble table', wood: 'Wooden table', shelf: 'Shelf', studio: 'Photo studio', garden: 'Garden' };
const labels = { object: 'Object', decor: 'Decor', scene: 'Scene' };

describe('decorTabModel', () => {
  it('offers only objects made alone: a whole scene has its own room', () => {
    const groups = groupVersions([obj('20261021-100000-vase', 'object'), obj('20261021-110000-salon', 'scene'), obj('20261020-090000-old', null)]);
    expect(objectsAlone(groups).map((g) => g.key)).toEqual(['20261021-100000-vase']);
  });

  it('every version of one object shares its décor', () => {
    expect(decorKeyOf(obj('20261021-120000-v2', 'object', '20261021-100000-v1'))).toBe('20261021-100000-v1');
    expect(decorKeyOf(obj('20261021-100000-v1', 'object'))).toBe('20261021-100000-v1');
  });

  it('names a décor by its preset, its place, or as a picture chosen on disk', () => {
    const base = { at: '', model: '', billedUsdMicro: null };
    expect(decorName({ ...base, path: 'a.png', place: 'oak table', preset: 'wood' }, presets, 'Picture')).toBe('Wooden table');
    expect(decorName({ ...base, path: 'a.png', place: 'a cave' }, presets, 'Picture')).toBe('a cave');
    expect(decorName({ ...base, path: 'C:\\Users\\t\\.mnemosyne\\generations\\gen-1.png', place: '' }, presets, 'Picture')).toBe('Picture');
    expect(fileName('/home/t/x.jpg')).toBe('x.jpg');
    expect(fileName('C:\\Users\\t\\gen-1.png')).toBe('gen-1.png');
  });

  it('lights a step only when what it names is on screen', () => {
    expect(guideRail({ object: 'none', decor: 'none', framed: false }, labels, {}).map((s) => s.state)).toEqual(['active', 'pending', 'pending']);
    expect(guideRail({ object: 'ready', decor: 'loading', framed: false }, labels, {}).map((s) => s.state)).toEqual(['done', 'active', 'pending']);
    expect(guideRail({ object: 'ready', decor: 'shown', framed: false }, labels, {}).map((s) => s.state)).toEqual(['done', 'done', 'active']);
    expect(guideRail({ object: 'ready', decor: 'shown', framed: true }, labels, {}).map((s) => s.state)).toEqual(['done', 'done', 'done']);
  });

  it('an object without a measured floor stops the guide there, and a décor chosen behind nothing is not lit', () => {
    const r = guideRail({ object: 'noFloor', decor: 'shown', framed: true }, labels, { decor: 'Wooden table' });
    expect(r.map((s) => s.state)).toEqual(['failed', 'pending', 'pending']);
    expect(r[1]!.detail).toBeUndefined();
  });
});
