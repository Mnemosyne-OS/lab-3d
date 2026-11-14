import { describe, expect, it } from 'vitest';
import {
  applyPlacement, momentEye, momentsToPlace, placedPhotosOf,
  addMoments, addSpot, dayRange, fractionOf, hourTicks, isPhotoName, momentPhotos, newDay, parseDaysState, placeMoment, playOrder,
  removeSpot, retimeMoment, splitByGaps, spotAt, spotLight, timeAt, unplacedMoments, withDay, type Day, type Moment, type Spot,
} from './dayModel';

const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m, 0, 0).getTime();
const spot = (id: string): Spot => ({ id, name: id, pose: { position: [0, 0, 0], dir: [1, 0, 0] }, createdAt: 0 });
const moment = (id: string, t: number, spotId: string | null, names = ['001.jpg']): Moment => ({ id, at: t, atFrom: 'exif', spotId, dir: 'C:\\s\\a', names, source: 'phone' });

function day(): Day {
  let d = newDay('d1', 'p1', 'Stand', at(7));
  d = addSpot(addSpot(d, spot('lea')), spot('max'));
  return addMoments(d, [moment('m2', at(11), 'lea'), moment('m1', at(10, 30), 'lea'), moment('m3', at(12), 'max'), moment('m4', at(13), null)]);
}

describe('dayModel', () => {
  it('a spot shows its latest moment at or before the cursor, and nothing before its first', () => {
    const d = day();
    expect(spotAt(d, 'lea', at(10))).toBeNull();
    expect(spotAt(d, 'lea', at(10, 30))).toMatchObject({ moment: { id: 'm1' }, index: 0, count: 2 });
    expect(spotAt(d, 'lea', at(10, 59))?.moment.id).toBe('m1');
    expect(spotAt(d, 'lea', at(18))).toMatchObject({ moment: { id: 'm2' }, index: 1 });
  });

  it('a spot is dark, then fresh just after a moment, then lit', () => {
    const d = day();
    expect(spotLight(d, 'max', at(11, 59))).toBe('off');
    expect(spotLight(d, 'max', at(12, 20))).toBe('fresh');
    expect(spotLight(d, 'max', at(12, 21))).toBe('lit');
  });

  it('a playback shows the placed moments in the order of the day, and skips the unplaced', () => {
    expect(playOrder(day()).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(unplacedMoments(day()).map((m) => m.id)).toEqual(['m4']);
  });

  it('a removed spot keeps its moments, waiting to be placed', () => {
    const d = removeSpot(day(), 'lea');
    expect(d.spots.map((s) => s.id)).toEqual(['max']);
    expect(unplacedMoments(d).map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
    expect(placeMoment(d, 'm4', 'max').moments.find((m) => m.id === 'm4')?.spotId).toBe('max');
  });

  it('a time typed as hh:mm moves the moment within its own date; anything else is refused', () => {
    const d = retimeMoment(day(), 'm4', '9:05')!;
    expect(d.moments.find((m) => m.id === 'm4')).toMatchObject({ at: at(9, 5), atFrom: 'edited' });
    expect(retimeMoment(day(), 'm4', '25:00')).toBeNull();
    expect(retimeMoment(day(), 'm4', 'midi')).toBeNull();
  });

  it('the timeline covers whole hours around the moments, two at least, 8 to 20 with none', () => {
    expect(dayRange(day(), 0)).toEqual({ start: at(10), end: at(14) });
    expect(dayRange({ moments: [moment('a', at(15, 10), null)] }, 0)).toEqual({ start: at(15), end: at(17) });
    expect(dayRange({ moments: [] }, at(16, 42))).toEqual({ start: at(8), end: at(20) });
    expect(hourTicks({ start: at(10), end: at(14) })).toEqual([at(10), at(11), at(12), at(13), at(14)]);
  });

  it('fractions and times are clamped to the timeline', () => {
    const r = { start: at(10), end: at(14) };
    expect(fractionOf(r, at(11))).toBe(0.25);
    expect(fractionOf(r, at(9))).toBe(0);
    expect(timeAt(r, 0.5)).toBe(at(12));
    expect(timeAt(r, 2)).toBe(at(14));
  });

  it('photos more than 15 minutes apart start a new moment', () => {
    const groups = splitByGaps([{ name: 'c', at: at(11) }, { name: 'a', at: at(10) }, { name: 'b', at: at(10, 15) }, { name: 'd', at: at(11, 16) }]);
    expect(groups.map((g) => g.map((p) => p.name))).toEqual([['a', 'b'], ['c'], ['d']]);
    // The gap is to the photo before, not to the moment's first: a stand photographed every 10 minutes is one moment.
    const chain = splitByGaps([{ name: 'x', at: at(10) }, { name: 'y', at: at(10, 10) }, { name: 'z', at: at(10, 20) }]);
    expect(chain.map((g) => g.map((p) => p.name))).toEqual([['x', 'y', 'z']]);
  });

  it('a moment\'s photos keep the folder\'s separator', () => {
    expect(momentPhotos({ dir: 'C:\\s\\a\\', names: ['001.jpg'] })).toEqual(['C:\\s\\a\\001.jpg']);
    expect(momentPhotos({ dir: 'C:/Users/x/day', names: ['b.JPG'] })).toEqual(['C:/Users/x/day/b.JPG']);
    expect(isPhotoName('IMG_1.HEIC')).toBe(false);
    expect(isPhotoName('IMG_1.jpeg')).toBe(true);
    // The image engine writes a depth map beside a photo of a series: not a photo.
    expect(isPhotoName('003-depth.png')).toBe(false);
    expect(isPhotoName('003.png')).toBe(true);
  });

  it('what was kept is read back, anything unreadable dropped, a moment of a lost spot unplaced', () => {
    const kept = withDay({ days: [] }, day());
    expect(parseDaysState(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
    const raw = { days: [{ id: 'x', placeId: 'p', spots: [{ id: 'bad' }], moments: [moment('m', 1, 'gone'), { id: 'no-names', at: 1, dir: 'd', names: [] }] }, { nope: 1 }] };
    const read = parseDaysState(raw);
    expect(read.days).toHaveLength(1);
    expect(read.days[0]!.spots).toEqual([]);
    expect(read.days[0]!.moments.map((m) => [m.id, m.spotId])).toEqual([['m', null]]);
    expect(parseDaysState(null)).toEqual({ days: [] });
  });
});

describe('applyPlacement (the host placed the photos, doc 166 §16)', () => {
  const pose = (x: number) => ({ position: [x, 0, 0] as [number, number, number], dir: [0, 0, 1] as [number, number, number] });
  const base = (spotId: string | null): Day => ({
    id: 'd', placeId: 'p', placeName: 'p', createdAt: 0,
    spots: [{ id: 'sA', name: 'Stand A', pose: pose(0), createdAt: 0 }],
    moments: [{ id: 'm', at: 1, atFrom: 'exif', spotId, dir: 'C:/x', names: ['a.jpg', 'b.jpg'], source: 'folder' }],
  });
  const make = { id: () => 'sNew', spotName: (n: number) => `Spot ${n}`, now: 5 };

  it('a moment with no spot goes to a spot within reach of its first placed photo', () => {
    const d = applyPlacement(base(null), 'm', [{ name: 'b.jpg', pose: pose(0.5) }], 4, make);
    expect(d.spots).toHaveLength(1);
    expect(d.moments[0]!.spotId).toBe('sA');
  });

  it('too far from every spot, a new spot is made where the photo was taken', () => {
    const d = applyPlacement(base(null), 'm', [{ name: 'a.jpg', pose: pose(3) }], 4, make);
    expect(d.spots.map((s) => [s.id, s.name, s.pose.position[0]])).toEqual([['sA', 'Stand A', 0], ['sNew', 'Spot 2', 3]]);
    expect(d.moments[0]!.spotId).toBe('sNew');
  });

  it('a spot the person chose is never changed, the viewpoints are still kept', () => {
    const d = applyPlacement(base('sA'), 'm', [{ name: 'a.jpg', pose: pose(3) }], 4, make);
    expect(d.spots).toHaveLength(1);
    expect(d.moments[0]!.spotId).toBe('sA');
    expect(momentEye(d.moments[0]!)).toEqual(pose(3));
  });

  it('nothing placed: tried, still waiting for a spot, never asked again by itself', () => {
    const d = applyPlacement(base(null), 'm', [], 4, make);
    expect(d.moments[0]!.spotId).toBeNull();
    expect(momentsToPlace(d)).toEqual([]);
  });

  it('the viewpoints and the « tried » mark survive a read of what was kept; a pose of a photo not in the moment is dropped', () => {
    const d = applyPlacement(base(null), 'm', [{ name: 'a.jpg', pose: pose(3) }, { name: 'z.jpg', pose: pose(9) }], 4, make);
    const back = parseDaysState(JSON.parse(JSON.stringify({ days: [d] }))).days[0]!;
    expect(back.moments[0]!.poses).toEqual([{ name: 'a.jpg', pose: pose(3) }]);
    expect(back.moments[0]!.placeTried).toBe(true);
  });
});

describe('placedPhotosOf (what completes the place, doc 166 §16.y)', () => {
  const pose = { position: [0, 0, 0] as [number, number, number], dir: [1, 0, 0] as [number, number, number] };
  it('only the photos the host placed, each once, in the order of the day', () => {
    let d = newDay('d1', 'p1', 'Stand', at(7));
    const late: Moment = { ...moment('m2', at(15), null, ['c.jpg', 'd.jpg']), poses: [{ name: 'd.jpg', pose }] };
    const early: Moment = { ...moment('m1', at(9), null, ['a.jpg', 'b.jpg']), poses: [{ name: 'b.jpg', pose }, { name: 'a.jpg', pose }] };
    const none: Moment = moment('m3', at(12), null, ['x.jpg']);
    d = addMoments(d, [late, early, none]);
    expect(placedPhotosOf(d)).toEqual(['C:\\s\\a\\a.jpg', 'C:\\s\\a\\b.jpg', 'C:\\s\\a\\d.jpg']);
  });

  it('past the bound, spread over the whole day, never only its morning', () => {
    let d = newDay('d1', 'p1', 'Stand', at(7));
    const names = Array.from({ length: 10 }, (_, i) => `${i}.jpg`);
    d = addMoments(d, [{ ...moment('m1', at(9), null, names), poses: names.map((name) => ({ name, pose })) }]);
    const picked = placedPhotosOf(d, 4);
    expect(picked).toHaveLength(4);
    expect(picked[0]).toMatch(/0\.jpg$/);
    expect(picked[3]).toMatch(/7\.jpg$/);
  });
});
