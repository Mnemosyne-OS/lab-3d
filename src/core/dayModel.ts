/**
 * dayModel — one day in a place (Lab 3D « Une journée »): the place filmed
 * empty in the morning is the stage, the day's moments are photos laid in it.
 * Pure: no React, no host, no three.js.
 *
 * - A SPOT is a viewpoint inside the place, posed by hand where the person
 *   stands (the eye and where it looks, in the scene's frame). The host has no
 *   door that places a photo in a scene, so the person places the spot.
 * - A MOMENT is a set of photos taken at one time, at one spot (or not placed
 *   yet). The same spot photographed every half hour is the tattoo growing.
 * - The TIMELINE runs over the day: a spot lights up once its first moment is
 *   passed, and shows the latest moment at or before the time on the cursor.
 *
 * @module core/dayModel
 */

export type Vec3 = [number, number, number];

/** Where an eye stands and where it looks, both in the scene's own frame. */
export interface Pose { position: Vec3; dir: Vec3 }

export interface Spot { id: string; name: string; pose: Pose; createdAt: number }

/** Where a moment's time was read: a photo's EXIF, the file's date, the phone's series, or when it was added. */
export type TimeSource = 'exif' | 'file' | 'series' | 'added' | 'edited';

export interface Moment {
  id: string;
  /** When the photos were taken, epoch ms (the person's local clock). */
  at: number;
  atFrom: TimeSource;
  /** Null: not placed in the scene yet. */
  spotId: string | null;
  /** The folder the photos are in, and their names in the order shown. */
  dir: string;
  names: string[];
  source: 'phone' | 'folder';
  /**
   * Where each photo was taken, found by the host in the place's model
   * (`splat.placePhotos`, doc 166 §16); a photo it could not place has none.
   */
  poses?: PhotoPose[];
  /** The host was asked to place these photos (placed or not): it is not asked again by itself. */
  placeTried?: boolean;
}

/** A photo of a moment (its name in `names`) and the viewpoint it was taken from. */
export interface PhotoPose { name: string; pose: Pose }

export interface Day {
  id: string;
  /** The place filmed empty (its object id in the host's library) and its name when chosen. */
  placeId: string;
  placeName: string;
  createdAt: number;
  spots: Spot[];
  moments: Moment[];
}

export interface DaysState { days: Day[] }

export const EMPTY_DAYS: DaysState = { days: [] };

/** Photos further apart than this start a new moment when a folder is read. */
export const MOMENT_GAP_MS = 15 * 60_000;
/** A spot whose latest moment is this recent, on the cursor, glows brighter. */
export const FRESH_MS = 20 * 60_000;
/** The timeline never spans less than this. */
const MIN_SPAN_MS = 2 * 3_600_000;
const HOUR_MS = 3_600_000;

// ── Reading what was kept ──────────────────────────────────────────────────

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isVec3 = (x: unknown): x is Vec3 => Array.isArray(x) && x.length === 3 && x.every(isNum);
const TIME_SOURCES: readonly TimeSource[] = ['exif', 'file', 'series', 'added', 'edited'];

function readSpot(x: unknown): Spot | null {
  const s = x as Partial<Spot> | null;
  if (!s || !isStr(s.id) || !isStr(s.name) || !s.pose || !isVec3(s.pose.position) || !isVec3(s.pose.dir)) return null;
  return { id: s.id, name: s.name, pose: { position: s.pose.position, dir: s.pose.dir }, createdAt: isNum(s.createdAt) ? s.createdAt : 0 };
}

function readMoment(x: unknown): Moment | null {
  const m = x as Partial<Moment> | null;
  if (!m || !isStr(m.id) || !isNum(m.at) || !isStr(m.dir) || !Array.isArray(m.names)) return null;
  const names = m.names.filter(isStr);
  if (names.length === 0) return null;
  return {
    id: m.id, at: m.at,
    atFrom: TIME_SOURCES.includes(m.atFrom as TimeSource) ? (m.atFrom as TimeSource) : 'added',
    spotId: isStr(m.spotId) ? m.spotId : null,
    dir: m.dir, names, source: m.source === 'phone' ? 'phone' : 'folder',
    ...(Array.isArray(m.poses) ? { poses: m.poses.filter(isPhotoPose).filter((p) => names.includes(p.name)) } : {}),
    ...(m.placeTried === true ? { placeTried: true } : {}),
  };
}

function isPhotoPose(x: unknown): x is PhotoPose {
  const p = x as Partial<PhotoPose> | null;
  return !!p && isStr(p.name) && !!p.pose && isVec3(p.pose.position) && isVec3(p.pose.dir);
}

function readDay(x: unknown): Day | null {
  const d = x as Partial<Day> | null;
  if (!d || !isStr(d.id) || !isStr(d.placeId)) return null;
  const spots = (Array.isArray(d.spots) ? d.spots : []).map(readSpot).filter((s): s is Spot => s !== null);
  const ids = new Set(spots.map((s) => s.id));
  const moments = (Array.isArray(d.moments) ? d.moments : []).map(readMoment).filter((m): m is Moment => m !== null)
    // A moment whose spot is gone is not lost: it waits to be placed again.
    .map((m) => (m.spotId && !ids.has(m.spotId) ? { ...m, spotId: null } : m));
  return { id: d.id, placeId: d.placeId, placeName: isStr(d.placeName) ? d.placeName : '', createdAt: isNum(d.createdAt) ? d.createdAt : 0, spots, moments };
}

/** What was kept, whatever its shape: anything unreadable is dropped, the rest is kept. */
export function parseDaysState(raw: unknown): DaysState {
  const days = (raw as { days?: unknown } | null)?.days;
  return { days: (Array.isArray(days) ? days : []).map(readDay).filter((d): d is Day => d !== null) };
}

// ── Changing a day (each answers a new day, never changes the one given) ───

export function newDay(id: string, placeId: string, placeName: string, now: number): Day {
  return { id, placeId, placeName, createdAt: now, spots: [], moments: [] };
}

export function withDay(s: DaysState, day: Day): DaysState {
  const i = s.days.findIndex((d) => d.id === day.id);
  return { days: i < 0 ? [...s.days, day] : s.days.map((d, k) => (k === i ? day : d)) };
}

export function withoutDay(s: DaysState, id: string): DaysState {
  return { days: s.days.filter((d) => d.id !== id) };
}

export function addSpot(day: Day, spot: Spot): Day {
  return { ...day, spots: [...day.spots, spot] };
}

export function renameSpot(day: Day, id: string, name: string): Day {
  return { ...day, spots: day.spots.map((s) => (s.id === id ? { ...s, name } : s)) };
}

/** The spot goes; its moments stay, waiting to be placed. */
export function removeSpot(day: Day, id: string): Day {
  return { ...day, spots: day.spots.filter((s) => s.id !== id), moments: day.moments.map((m) => (m.spotId === id ? { ...m, spotId: null } : m)) };
}

export function addMoments(day: Day, moments: readonly Moment[]): Day {
  return { ...day, moments: [...day.moments, ...moments] };
}

export function placeMoment(day: Day, momentId: string, spotId: string | null): Day {
  return { ...day, moments: day.moments.map((m) => (m.id === momentId ? { ...m, spotId } : m)) };
}

/**
 * A spot this close to a placed photo (a share of the place's size) takes its
 * moment: the same stand photographed again lands on its own spot.
 */
export const NEAR_SHARE = 0.15;

/** The viewpoint of a moment: its first photo placed, in the order shown; null when none was. */
export function momentEye(m: Pick<Moment, 'names' | 'poses'>): Pose | null {
  for (const n of m.names) {
    const p = m.poses?.find((x) => x.name === n);
    if (p) return p.pose;
  }
  return null;
}

/**
 * The host's answer for a moment: its photos' viewpoints kept, and the moment
 * marked tried. A moment with no spot yet goes to the nearest spot within
 * NEAR_SHARE of the place's size, else to a new spot made at its viewpoint
 * (named with `spotName(n)`). A spot the person chose is never changed.
 */
export function applyPlacement(
  day: Day, momentId: string, poses: readonly PhotoPose[], placeScale: number,
  make: { id: () => string; spotName: (n: number) => string; now: number },
): Day {
  const m = day.moments.find((x) => x.id === momentId);
  if (!m) return day;
  const kept = poses.filter((p) => m.names.includes(p.name));
  const placed: Moment = { ...m, poses: kept, placeTried: true };
  const eye = momentEye(placed);
  let spots = day.spots;
  if (!placed.spotId && eye) {
    const reach = NEAR_SHARE * (placeScale > 0 ? placeScale : 1);
    const near = spots
      .map((s) => ({ s, d: Math.hypot(s.pose.position[0] - eye.position[0], s.pose.position[1] - eye.position[1], s.pose.position[2] - eye.position[2]) }))
      .filter((x) => x.d <= reach)
      .sort((a, b) => a.d - b.d)[0];
    if (near) placed.spotId = near.s.id;
    else {
      const spot: Spot = { id: make.id(), name: make.spotName(spots.length + 1), pose: eye, createdAt: make.now };
      spots = [...spots, spot];
      placed.spotId = spot.id;
    }
  }
  return { ...day, spots, moments: day.moments.map((x) => (x.id === momentId ? placed : x)) };
}

/** The moments of a day the host has not been asked to place yet, oldest first. */
export function momentsToPlace(day: Day): Moment[] {
  return day.moments.filter((m) => !m.placeTried).sort((a, b) => a.at - b.at);
}

export function removeMoment(day: Day, id: string): Day {
  return { ...day, moments: day.moments.filter((m) => m.id !== id) };
}

/** The moment at another time of the same date, typed by the person as « 14:30 ». Null when it does not read as a time. */
export function retimeMoment(day: Day, id: string, hhmm: string): Day | null {
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!t) return null;
  const h = Number(t[1]);
  const min = Number(t[2]);
  if (h > 23 || min > 59) return null;
  return {
    ...day,
    moments: day.moments.map((m) => {
      if (m.id !== id) return m;
      const d = new Date(m.at);
      d.setHours(h, min, 0, 0);
      return { ...m, at: d.getTime(), atFrom: 'edited' };
    }),
  };
}

// ── Reading a day ──────────────────────────────────────────────────────────

const byTime = (a: Moment, b: Moment) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every moment, in the order of the day. */
export function sortedMoments(day: Day): Moment[] {
  return [...day.moments].sort(byTime);
}

/** The moments of one spot, in the order of the day. */
export function spotMoments(day: Day, spotId: string): Moment[] {
  return day.moments.filter((m) => m.spotId === spotId).sort(byTime);
}

/** The moments placed nowhere yet, in the order of the day. */
export function unplacedMoments(day: Day): Moment[] {
  return day.moments.filter((m) => m.spotId === null).sort(byTime);
}

/** The placed moments in the order a playback shows them. */
export function playOrder(day: Day): Moment[] {
  return sortedMoments(day).filter((m) => m.spotId !== null);
}

/** What a spot shows at time `t`: its latest moment at or before `t`, where it sits among the spot's moments. Null before its first. */
export function spotAt(day: Day, spotId: string, t: number): { moment: Moment; index: number; count: number } | null {
  const list = spotMoments(day, spotId);
  let index = -1;
  for (let i = 0; i < list.length; i++) if (list[i]!.at <= t) index = i;
  return index < 0 ? null : { moment: list[index]!, index, count: list.length };
}

export type SpotLight = 'off' | 'lit' | 'fresh';

/** How a spot glows at time `t`: dark before its first moment, brighter just after a moment. */
export function spotLight(day: Day, spotId: string, t: number): SpotLight {
  const at = spotAt(day, spotId, t);
  if (!at) return 'off';
  return t - at.moment.at <= FRESH_MS ? 'fresh' : 'lit';
}

/** How far in front of the eye a spot's light floats, as a share of the place's size. */
export const ANCHOR_SHARE = 0.12;

/** Where a spot's light floats: a little in front of where the person stood, the way they looked. */
export function anchorOf(pose: Pose, placeScale: number): Vec3 {
  const k = ANCHOR_SHARE * (placeScale > 0 ? placeScale : 1);
  return [pose.position[0] + pose.dir[0] * k, pose.position[1] + pose.dir[1] * k, pose.position[2] + pose.dir[2] * k];
}

/** At most this many photos complete a place at once: the host's own bound (MAX_ADDED_PHOTOS). */
export const MAX_COMPLETE_PHOTOS = 120;

/**
 * The day's photos the host placed in its place (doc 166 §16.y), each once, in
 * the order of the day: what completes the place. Past `max`, spread evenly
 * over the day, never only its morning.
 */
export function placedPhotosOf(day: Day, max = MAX_COMPLETE_PHOTOS): string[] {
  const all: string[] = [];
  for (const m of sortedMoments(day)) {
    const placed = new Set((m.poses ?? []).map((p) => p.name));
    const paths = momentPhotos(m);
    m.names.forEach((n, i) => { if (placed.has(n) && !all.includes(paths[i]!)) all.push(paths[i]!); });
  }
  if (all.length <= max) return all;
  return Array.from({ length: max }, (_, i) => all[Math.floor((i * all.length) / max)]!);
}

/** A moment's photos as paths, with the folder's own separator. */
export function momentPhotos(m: Pick<Moment, 'dir' | 'names'>): string[] {
  const sep = m.dir.includes('\\') && !m.dir.includes('/') ? '\\' : '/';
  const base = m.dir.replace(/[\\/]+$/, '');
  return m.names.map((n) => `${base}${sep}${n}`);
}

// ── The timeline ───────────────────────────────────────────────────────────

export interface Range { start: number; end: number }

/**
 * The span the timeline shows: whole hours around the day's moments, at
 * least two hours. With no moment, 8:00 to 20:00 of the day `now` falls in.
 */
export function dayRange(day: Pick<Day, 'moments'>, now: number): Range {
  if (day.moments.length === 0) {
    const d = new Date(now);
    d.setHours(8, 0, 0, 0);
    return { start: d.getTime(), end: d.getTime() + 12 * HOUR_MS };
  }
  const times = day.moments.map((m) => m.at);
  const start = floorHour(Math.min(...times));
  let end = ceilHour(Math.max(...times) + 1);
  if (end - start < MIN_SPAN_MS) end = start + MIN_SPAN_MS;
  return { start, end };
}

function floorHour(t: number): number {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function ceilHour(t: number): number {
  const f = floorHour(t);
  return f === t ? t : f + HOUR_MS;
}

/** Where `t` sits on the timeline, 0..1, clamped. */
export function fractionOf(r: Range, t: number): number {
  const span = r.end - r.start;
  return span <= 0 ? 0 : Math.min(1, Math.max(0, (t - r.start) / span));
}

/** The time at a share of the timeline, clamped to it. */
export function timeAt(r: Range, fraction: number): number {
  return r.start + Math.min(1, Math.max(0, fraction)) * (r.end - r.start);
}

/** The whole hours inside the range, for the ticks. */
export function hourTicks(r: Range): number[] {
  const out: number[] = [];
  for (let t = ceilHour(r.start); t <= r.end; t += HOUR_MS) out.push(t);
  return out;
}

// ── Photos read from a folder ──────────────────────────────────────────────

export interface DatedPhoto { name: string; at: number }

/** The photos cut into moments wherever two in a row are more than `gapMs` apart, each moment in time order. */
export function splitByGaps(photos: readonly DatedPhoto[], gapMs = MOMENT_GAP_MS): DatedPhoto[][] {
  const sorted = [...photos].sort((a, b) => a.at - b.at || (a.name < b.name ? -1 : 1));
  const groups: DatedPhoto[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g && p.at - g[g.length - 1]!.at <= gapMs) g.push(p);
    else groups.push([p]);
  }
  return groups;
}

/**
 * The phone series the days use, by series id (the last part of the folder,
 * as the host names it). A series waits in the host's list until it is put
 * away: the phone screen of the galleries must not offer it first, nor put it
 * away without saying the day loses it.
 */
export function phoneSeriesInDays(s: DaysState): Set<string> {
  const ids = new Set<string>();
  for (const d of s.days) for (const m of d.moments) {
    if (m.source !== 'phone') continue;
    const id = m.dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    if (id) ids.add(id);
  }
  return ids;
}

/** A picture this tab reads, by its name; a depth map the image engine wrote beside a photo is not one. */
export function isPhotoName(name: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(name) && !/-depth\.png$/i.test(name);
}
