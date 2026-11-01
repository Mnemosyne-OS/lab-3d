import { describe, expect, it, vi } from 'vitest';
import { readChoice, writeChoice } from '../lib/choiceStore';
import { TAB_IDS, TAB_STORAGE_KEY, TABS } from './tabs';

describe('tabs', () => {
  it('lists each tab once, in the order of TAB_IDS', () => {
    expect(TABS.map((t) => t.id)).toEqual([...TAB_IDS]);
  });

  it('opens the remembered tab, or the first one when nothing, something unknown, or no storage is there', () => {
    const read = (v: string | null) => readChoice({ getItem: (k) => (k === TAB_STORAGE_KEY ? v : null) }, TAB_STORAGE_KEY, TAB_IDS, TAB_IDS[0]);
    expect(read('objects')).toBe('objects');
    expect(read(null)).toBe('viewer');
    expect(read('objets-3d')).toBe('viewer');
    // The Create tab went into the two galleries (doc 166 §14.2): remembered, it opens the first tab.
    expect(read('create')).toBe('viewer');
    expect(read('places')).toBe('places');
    expect(readChoice(null, TAB_STORAGE_KEY, TAB_IDS, TAB_IDS[0])).toBe('viewer');
  });

  it('a storage that throws is a convenience lost, never a crash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readChoice({ getItem: () => { throw new Error('blocked'); } }, TAB_STORAGE_KEY, TAB_IDS, TAB_IDS[0])).toBe('viewer');
    expect(() => writeChoice({ setItem: () => { throw new Error('quota'); } }, TAB_STORAGE_KEY, 'viewer')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
