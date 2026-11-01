import { describe, expect, it } from 'vitest';
import { createVerdict, defaultVaultName, firstShown, madeFrom, MAX_PHOTOS, MIN_PHOTOS, NO_PHONE_HINT_MS, sampleIndexes, seriesWhen, showNoPhoneHint, targetFor } from './phoneModel';

describe('phoneModel', () => {
  it('aims at the counts measured for an object, more for a place', () => {
    expect(targetFor('objects')).toBe(60);
    expect(targetFor('places')).toBe(100);
  });

  it('names the reasons a phone may not arrive only after it had the time to try', () => {
    const t0 = 1_000_000;
    const open = { active: true, phoneSeen: false, startedAt: t0 };
    expect(showNoPhoneHint(open, t0 + NO_PHONE_HINT_MS - 1)).toBe(false);
    expect(showNoPhoneHint(open, t0 + NO_PHONE_HINT_MS)).toBe(true);
    expect(showNoPhoneHint({ ...open, phoneSeen: true }, t0 + 10 * NO_PHONE_HINT_MS)).toBe(false);
    expect(showNoPhoneHint({ ...open, active: false }, t0 + 10 * NO_PHONE_HINT_MS)).toBe(false);
    expect(showNoPhoneHint({ ...open, startedAt: null }, t0 + 10 * NO_PHONE_HINT_MS)).toBe(false);
  });

  it('lets a series become 3D only within what the engine takes', () => {
    expect(createVerdict(MIN_PHOTOS - 1)).toBe('tooFew');
    expect(createVerdict(MIN_PHOTOS)).toBe('ok');
    expect(createVerdict(MAX_PHOTOS)).toBe('ok');
    expect(createVerdict(MAX_PHOTOS + 1)).toBe('tooMany');
  });

  it('names a new vault after the gallery and the series day, or the gallery alone', () => {
    expect(defaultVaultName('Objects', new Date(2026, 9, 24, 9, 5).getTime())).toBe('Objects 2026-10-24');
    expect(defaultVaultName('Objects', null)).toBe('Objects');
  });
  it('dates a series by the host, else by its id, else not at all', () => {
    expect(seriesWhen({ id: 'x', startedAt: 1000 })?.getTime()).toBe(1000);
    expect(seriesWhen({ id: '2026-10-24_18-25-57', startedAt: null })?.getTime()).toBe(new Date(2026, 9, 24, 18, 25, 57).getTime());
    expect(seriesWhen({ id: 'old', startedAt: null })).toBeNull();
  });

  it('finds the newest object made from a series by its folder name, and nothing from a look-alike', () => {
    const objects = [
      { id: '20261024-160059-2026-10-24_10-35-56', createdAt: 'a' },
      { id: '20261026-140540-2026-10-24_18-25-57', createdAt: 'b' },
      { id: '20261026-172143-2026-10-24_18-25-57', createdAt: 'c' },
      { id: '20261027-090000-x2026-10-24_18-25-57', createdAt: 'd' },
    ];
    expect(madeFrom('2026-10-24_18-25-57', objects)?.createdAt).toBe('c');
    expect(madeFrom('2026-10-24_18-25', objects)).toBeNull();
    expect(madeFrom('2026-10-26_11-40-58', objects)).toBeNull();
  });

  it('shows first the series just closed, else the newest not made; none when a new one was asked', () => {
    const s = (id: string) => ({ id, photos: 30, startedAt: null });
    const series = [s('a'), s('b'), s('c')];
    const made = (id: string) => id === 'c';
    expect(firstShown(series, made, null, false)).toBe('b');
    expect(firstShown(series, made, 'c', false)).toBe('c');
    expect(firstShown(series, made, 'gone', false)).toBe('b');
    expect(firstShown(series, made, null, true)).toBeNull();
    expect(firstShown(series, made, 'a', true)).toBe('a');
    expect(firstShown([s('c')], made, null, false)).toBeNull();
  });

  it('spreads the photos shown over the whole series, first and last included', () => {
    expect(sampleIndexes(5, 12)).toEqual([0, 1, 2, 3, 4]);
    expect(sampleIndexes(76, 4)).toEqual([0, 25, 50, 75]);
    expect(sampleIndexes(76, 1)).toEqual([0]);
    expect(sampleIndexes(0, 12)).toEqual([]);
  });
});
