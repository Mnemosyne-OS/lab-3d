/**
 * libraryModel — how the library arranges the objects the host lists, as
 * values (Fast Refresh: the screens live in Library.tsx and ObjectsTab.tsx).
 *
 * Two galleries, each with its own Create (doc 166 §14.2): the objects (the
 * object alone, the whole scene, and what was made before that choice
 * existed) and the places walked through. One tile per object, showing its
 * main version (core/model groupVersions); a group goes where its main
 * version belongs.
 *
 * In the objects, the filter is by what was made; an object made before that
 * choice existed belongs to none and shows under « All » only. A kind nobody
 * made is not offered.
 *
 * @module features/objects/libraryModel
 */
import type { Scope, VersionGroup } from '../../core/model';

export const GALLERIES = ['objects', 'places'] as const;
export type Gallery = (typeof GALLERIES)[number];

/** The gallery an object belongs to: a place in the places, everything else in the objects. */
export function galleryOf(scope: Scope | null | undefined): Gallery {
  return scope === 'place' ? 'places' : 'objects';
}

export function galleryGroups(groups: readonly VersionGroup[], gallery: Gallery): VersionGroup[] {
  return groups.filter((g) => galleryOf(g.main.scope) === gallery);
}

/** A choice remembered per gallery: the objects keep the key they always had. */
export function galleryKey(key: string, gallery: Gallery): string {
  return gallery === 'objects' ? key : `${key}.${gallery}`;
}

export const GRID_SIZES = ['small', 'medium', 'large'] as const;
export type GridSize = (typeof GRID_SIZES)[number];
export const GRID_SIZE_KEY = 'lab3d.gridSize';

export const FILTERS = ['all', 'object', 'scene'] as const;
export type Filter = (typeof FILTERS)[number];
export const FILTER_KEY = 'lab3d.objectsFilter';

export function filterGroups(groups: readonly VersionGroup[], filter: Filter): VersionGroup[] {
  return filter === 'all' ? [...groups] : groups.filter((g) => g.main.scope === filter);
}

export function filterCounts(groups: readonly VersionGroup[]): Record<Filter, number> {
  return {
    all: groups.length,
    object: groups.filter((g) => g.main.scope === 'object').length,
    scene: groups.filter((g) => g.main.scope === 'scene').length,
  };
}

/** A filter is offered only when it can split the library: both kinds present. */
export function filterUseful(counts: Record<Filter, number>): boolean {
  return counts.object > 0 && counts.scene > 0;
}

/** The filters shown: « All », then each kind that has at least one object. */
export function filtersShown(counts: Record<Filter, number>): Filter[] {
  return FILTERS.filter((f) => f === 'all' || counts[f] > 0);
}
