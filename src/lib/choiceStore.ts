/**
 * choiceStore — the small choices the app remembers (the open tab, a tile
 * size, a filter). A convenience, never a source of truth: a storage that is
 * missing, refuses, or holds something unknown gives the default.
 *
 * @module lib/choiceStore
 */

/** `localStorage`, or null where reading it throws (a private window, blocked site data). */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch (err) {
    console.warn('[lab-3d] no local storage here, choices are not remembered:', err);
    return null;
  }
}

/** The value stored under `key` when it is one of `allowed`, else `fallback`. */
export function readChoice<T extends string>(storage: Pick<Storage, 'getItem'> | null, key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = storage?.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch (err) {
    console.warn(`[lab-3d] choice ${key} unreadable:`, err);
    return fallback;
  }
}

export function writeChoice(storage: Pick<Storage, 'setItem'> | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch (err) {
    console.warn(`[lab-3d] choice ${key} not remembered:`, err);
  }
}
