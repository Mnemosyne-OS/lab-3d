/**
 * tabs — the catalogue's sections, as values (Fast Refresh: the shell lives
 * in App.tsx). A tab is listed here once it does something: a tab with nothing
 * behind it reads as a broken control.
 *
 * `needsHost` marks a section that runs on Mnemosyne OS's engines; outside the
 * host it still opens and says why. `bleed` drops the panel's padding, for a
 * section whose canvas fills the window.
 *
 * The objects and the places are two galleries, each with its own Create
 * (doc 166 §14.2): there is no separate Create tab any more, and a tab
 * remembered as « create » opens the first one.
 *
 * @module app/tabs
 */

export const TAB_IDS = ['viewer', 'objects', 'places', 'decor', 'painting', 'compare'] as const;
export type TabId = (typeof TAB_IDS)[number];

export interface TabSpec { id: TabId; needsHost: boolean; bleed: boolean }

export const TABS: readonly TabSpec[] = [
  { id: 'viewer', needsHost: false, bleed: true },
  { id: 'objects', needsHost: true, bleed: true },
  { id: 'places', needsHost: true, bleed: true },
  { id: 'decor', needsHost: true, bleed: true },
  { id: 'painting', needsHost: true, bleed: true },
  { id: 'compare', needsHost: true, bleed: true },
];

/** Where the last open tab is remembered. */
export const TAB_STORAGE_KEY = 'lab3d.tab';
