import { describe, expect, it } from 'vitest';
import { groupVersions, type ObjectEntry } from '../../core/model';
import { filterCounts, filterGroups, filterUseful, filtersShown, galleryGroups, galleryKey, galleryOf } from './libraryModel';

const obj = (id: string, scope: ObjectEntry['scope']): ObjectEntry => ({
  id, createdAt: null, quality: 'full', scope, framesKept: 100, posesPlaced: 100, coverageDeg: 320, sceneBytes: 1000, thumb: null,
});

describe('libraryModel', () => {
  const groups = groupVersions([
    obj('20261021-100000-vase', 'object'),
    obj('20261021-110000-salon', 'scene'),
    obj('20261021-120000-bottines', 'object'),
    obj('20261020-090000-ancien', null),
  ]);

  it('counts each kind, and an object from before the choice only under All', () => {
    expect(filterCounts(groups)).toEqual({ all: 4, object: 2, scene: 1 });
    expect(filterGroups(groups, 'all')).toHaveLength(4);
    expect(filterGroups(groups, 'object').map((g) => g.key)).toEqual(['20261021-120000-bottines', '20261021-100000-vase']);
    expect(filterGroups(groups, 'scene').map((g) => g.key)).toEqual(['20261021-110000-salon']);
  });

  it('offers the filter only when it can split the library', () => {
    expect(filterUseful(filterCounts(groups))).toBe(true);
    expect(filterUseful(filterCounts(groupVersions([obj('20261021-100000-a', 'object'), obj('20261021-100001-b', null)])))).toBe(false);
  });

  it('offers only the kinds someone made, « All » first', () => {
    expect(filtersShown(filterCounts(groups))).toEqual(['all', 'object', 'scene']);
    expect(filtersShown(filterCounts(groupVersions([obj('20261021-100001-b', 'scene')])))).toEqual(['all', 'scene']);
  });

  it('a place goes to the places, everything else (an object from before the choice too) to the objects', () => {
    expect(galleryOf('place')).toBe('places');
    expect(galleryOf('object')).toBe('objects');
    expect(galleryOf('scene')).toBe('objects');
    expect(galleryOf(null)).toBe('objects');
    expect(galleryOf(undefined)).toBe('objects');
    const mixed = groupVersions([obj('20261021-100000-vase', 'object'), obj('20261022-090000-jardin', 'place'), obj('20261020-090000-ancien', null)]);
    expect(galleryGroups(mixed, 'places').map((g) => g.key)).toEqual(['20261022-090000-jardin']);
    expect(galleryGroups(mixed, 'objects').map((g) => g.key).sort()).toEqual(['20261020-090000-ancien', '20261021-100000-vase']);
  });

  it('a choice is remembered per gallery, the objects keeping the key they always had', () => {
    expect(galleryKey('lab3d.gridSize', 'objects')).toBe('lab3d.gridSize');
    expect(galleryKey('lab3d.gridSize', 'places')).toBe('lab3d.gridSize.places');
  });
});
