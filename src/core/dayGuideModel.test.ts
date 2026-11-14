import { describe, expect, it } from 'vitest';
import { MOMENT_RHYTHM_MS, agoOf, guideOf, stepStates } from './dayGuideModel';
import type { Day, Moment, Spot } from './dayModel';

const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m).getTime();
const spot = (id: string): Spot => ({ id, name: id, pose: { position: [0, 0, 0], dir: [1, 0, 0] }, createdAt: 0 });
const moment = (id: string, t: number, spotId: string | null): Moment => ({ id, at: t, atFrom: 'series', spotId, dir: 'C:/s', names: ['001.jpg'], source: 'phone' });
const day = (spots: Spot[], moments: Moment[] = []): Day => ({ id: 'd', placeId: 'p', placeName: 'hall', createdAt: 0, spots, moments });
const base = { placeIds: [] as string[], building: false, ended: false, now: at(15) };

describe('dayGuideModel', () => {
  it('without a day: film a place, wait while it is built, then start on the newest', () => {
    expect(guideOf({ ...base, day: null })).toMatchObject({ step: 'place', place: 'film', newest: null });
    expect(guideOf({ ...base, day: null, building: true, placeIds: ['20261113-090000-old'] })).toMatchObject({ place: 'building' });
    expect(guideOf({ ...base, day: null, placeIds: ['20261113-090000-old', '20261114-081500-hall', '20261112-100000-x'] }))
      .toMatchObject({ step: 'place', place: 'ready', newest: '20261114-081500-hall' });
  });

  it('a day with no spot asks for the spot; with one, the moments', () => {
    expect(guideOf({ ...base, day: day([]) }).step).toBe('spot');
    expect(guideOf({ ...base, day: day([spot('a')]) })).toMatchObject({ step: 'moments', spotId: 'a', lastAt: null, due: false });
  });

  it('says how long since the last moment, and that one is due past the rhythm', () => {
    const d = day([spot('a')], [moment('m1', at(14), 'a'), moment('m2', at(14, 20), 'a')]);
    expect(guideOf({ ...base, day: d, now: at(14, 45) })).toMatchObject({ lastAt: at(14, 20), sinceMin: 25, due: false });
    expect(guideOf({ ...base, day: d, now: at(14, 20) + MOMENT_RHYTHM_MS })).toMatchObject({ due: true });
  });

  it('the next moment goes to the last moment\'s spot, not to the first pinned', () => {
    const d = day([spot('a'), spot('b')], [moment('m1', at(11), 'b'), moment('m2', at(12), null)]);
    expect(guideOf({ ...base, day: d }).spotId).toBe('b');
  });

  it('a day kept on the newest place is resumed; one on an older place (yesterday\'s test) is not', () => {
    const days = [{ id: 'old', placeId: '20261112-100000-x', createdAt: 1 }, { id: 'today', placeId: '20261114-081500-hall', createdAt: 2 }];
    const ids = ['20261112-100000-x', '20261114-081500-hall'];
    expect(guideOf({ ...base, day: null, placeIds: ids, days })).toMatchObject({ place: 'resume', resumeId: 'today' });
    expect(guideOf({ ...base, day: null, placeIds: ids, days: [days[0]!] })).toMatchObject({ place: 'ready', resumeId: null });
    expect(guideOf({ ...base, day: null, placeIds: ids, days, building: true }).place).toBe('building');
  });

  it('minutes become hours past the hour', () => {
    expect(agoOf(0)).toEqual({ kind: 'now' });
    expect(agoOf(18)).toEqual({ kind: 'min', n: 18 });
    expect(agoOf(95)).toEqual({ kind: 'h', h: 1, m: '35' });
    expect(agoOf(920)).toEqual({ kind: 'h', h: 15, m: '20' });
  });

  it('« End of day » moves to the last step; the bar lights what is done', () => {
    expect(guideOf({ ...base, day: day([spot('a')]), ended: true }).step).toBe('end');
    expect(stepStates('moments').map((s) => s.state)).toEqual(['done', 'done', 'current', 'next']);
  });
});
