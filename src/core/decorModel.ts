/**
 * The décor behind an object cut out of its video (doc 163, « the décor »):
 * one picture drawn on the person's credits, kept, and reused for every angle.
 * The object stays in 3D in front of it, like a piece on a turntable in front
 * of a photographer's backdrop: turning the camera turns the piece, the
 * backdrop stays. Pure: the prompt, the picture's shape, what is kept and how
 * the picture covers the view. No three.js, no host.
 */
import type { Vec3 } from './groundModel';

/** The places offered in one click; any other is typed by the person. */
export const DECOR_PRESETS = ['marble', 'wood', 'shelf', 'studio', 'garden'] as const;
/** One of the one-click places. */
export type DecorPreset = (typeof DECOR_PRESETS)[number];

/** What each preset asks the model for (the model reads English; the chip says it in the person's language). */
export const PRESET_PLACE: Record<DecorPreset, string> = {
  marble: 'a white marble table in a bright, calm room',
  wood: 'an oak wooden table in a warm living room',
  shelf: 'a light wooden shelf against a plain painted wall',
  studio: 'a seamless light grey photo studio backdrop with a soft floor',
  garden: 'a garden table outdoors, greenery softly blurred behind',
};

/** The longest place the person may type; the host refuses prompts past 2 000 characters. */
export const MAX_PLACE_CHARS = 300;

/** The credit route's models (the host's list): the cheapest by default, the better one on request. */
export const DECOR_MODELS = { fast: 'gemini-3.1-flash-lite-image', quality: 'gemini-3-pro-image' } as const;
export type DecorQuality = keyof typeof DECOR_MODELS;

/**
 * The prompt for one décor. It asks for an EMPTY place seen the way a product
 * photo is taken (eye level, slightly from above, the free surface in the
 * lower middle), since the object is put there afterwards in 3D: anything the
 * model stands in the middle would end up behind or through it.
 */
export function decorPrompt(place: string): string {
  const where = place.trim().slice(0, MAX_PLACE_CHARS);
  return [
    `Photograph of ${where}, empty, ready for a product photo.`,
    'Eye level, slightly from above. The free surface fills the lower middle of the picture and nothing stands on it:',
    'one object will be placed there afterwards.',
    'Soft natural light, the background gently out of focus, photorealistic.',
    'No people, no text, no logo, no object in the middle of the surface.',
  ].join(' ');
}

/** The shapes the host accepts (main/models/imageGen.ts ASPECT_RATIOS), with their width over height. */
export const ASPECTS: ReadonlyArray<readonly [string, number]> = [['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1], ['3:4', 3 / 4], ['9:16', 9 / 16]];

/** The accepted shape closest to the view (by ratio, not difference): the picture is cropped least. */
export function aspectFor(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return '16:9';
  const r = Math.log(width / height);
  let best = ASPECTS[0]!;
  for (const a of ASPECTS) if (Math.abs(Math.log(a[1]) - r) < Math.abs(Math.log(best[1]) - r)) best = a;
  return best[0];
}

/**
 * How a picture of `imageAspect` covers a view of `viewAspect` without being
 * stretched (three.js draws a background texture over the whole view): the
 * share of the picture shown on each axis and where that share starts. The
 * crop is centred.
 */
export function coverFit(imageAspect: number, viewAspect: number): { repeat: [number, number]; offset: [number, number] } {
  if (!(imageAspect > 0) || !(viewAspect > 0)) return { repeat: [1, 1], offset: [0, 0] };
  if (viewAspect > imageAspect) {
    const y = imageAspect / viewAspect;
    return { repeat: [1, y], offset: [0, (1 - y) / 2] };
  }
  const x = viewAspect / imageAspect;
  return { repeat: [x, 1], offset: [(1 - x) / 2, 0] };
}

/** One décor drawn: the picture on disk and what was asked. */
export interface DecorEntry {
  path: string;
  /** What was asked: a preset's English place, or what the person typed. */
  place: string;
  /** The one-click place it came from, so its tile is named in the person's language; absent for a typed place. */
  preset?: DecorPreset;
  at: string;
  /** The model the host says drew it; '' when it named none (never the one asked for, put in its mouth). */
  model: string;
  /** What the host said it debited, in micro-dollars; null when it said nothing (never read as free). */
  billedUsdMicro: number | null;
}

/** Where the camera stood when the person placed the object in a décor. */
export interface Framing { position: Vec3; target: Vec3 }

/** What this app keeps: the décors drawn, the one each object shows, and how each object was placed in each décor. */
export interface DecorState {
  decors: DecorEntry[];
  /** Object (its versions together) → the décor's path. Absent = no décor. */
  chosen: Record<string, string>;
  /** `framingKey(object, décor)` → the camera the person left. */
  framing: Record<string, Framing>;
}

/** Nothing kept yet: no décor drawn, none chosen, no placement. */
export const EMPTY_DECOR_STATE: DecorState = { decors: [], chosen: {}, framing: {} };

/** The most décors kept in the list; the oldest goes first (its file stays on disk). */
export const MAX_DECORS = 40;
/** The most placements kept; the host's mirror holds 256 KB per app. */
export const MAX_FRAMINGS = 200;

/** The key of one object's placement in one décor (a path never holds a line break). */
export function framingKey(object: string, decorPath: string): string {
  return `${object}\n${decorPath}`;
}

/**
 * What was kept, read back. Anything unreadable is dropped entry by entry,
 * never the whole state: a hand-edited or older file loses its bad line, not
 * the person's décors. A choice that names no kept décor is dropped too.
 */
export function parseDecorState(raw: unknown): DecorState {
  if (!raw || typeof raw !== 'object') return EMPTY_DECOR_STATE;
  const r = raw as Record<string, unknown>;
  const decors: DecorEntry[] = [];
  const seen = new Set<string>();
  for (const d of Array.isArray(r.decors) ? r.decors : []) {
    const e = d as Record<string, unknown> | null;
    if (!e || typeof e.path !== 'string' || !e.path || seen.has(e.path)) continue;
    seen.add(e.path);
    decors.push({
      path: e.path,
      place: typeof e.place === 'string' ? e.place.slice(0, MAX_PLACE_CHARS) : '',
      ...((DECOR_PRESETS as readonly unknown[]).includes(e.preset) ? { preset: e.preset as DecorPreset } : {}),
      at: typeof e.at === 'string' ? e.at : '',
      model: typeof e.model === 'string' ? e.model : '',
      billedUsdMicro: typeof e.billedUsdMicro === 'number' && Number.isFinite(e.billedUsdMicro) ? e.billedUsdMicro : null,
    });
    if (decors.length >= MAX_DECORS) break;
  }
  const chosen: Record<string, string> = {};
  if (r.chosen && typeof r.chosen === 'object') {
    for (const [k, v] of Object.entries(r.chosen as Record<string, unknown>)) if (typeof v === 'string' && seen.has(v)) chosen[k] = v;
  }
  const framing: Record<string, Framing> = {};
  if (r.framing && typeof r.framing === 'object') {
    for (const [k, v] of Object.entries(r.framing as Record<string, unknown>)) {
      const f = v as Record<string, unknown> | null;
      if (f && isVec3(f.position) && isVec3(f.target)) framing[k] = { position: f.position, target: f.target };
    }
  }
  return { decors, chosen, framing };
}

/** A new décor goes first; the same picture twice is kept once. */
export function addDecor(s: DecorState, entry: DecorEntry): DecorState {
  const decors = [entry, ...s.decors.filter((d) => d.path !== entry.path)].slice(0, MAX_DECORS);
  const kept = new Set(decors.map((d) => d.path));
  return { ...s, decors, chosen: Object.fromEntries(Object.entries(s.chosen).filter(([, p]) => kept.has(p))) };
}

/** The object shows this décor, or none (null). */
export function chooseDecor(s: DecorState, object: string, path: string | null): DecorState {
  const chosen = { ...s.chosen };
  if (path && s.decors.some((d) => d.path === path)) chosen[object] = path;
  else delete chosen[object];
  return { ...s, chosen };
}

/** A décor leaves the list (its file stays on disk); objects that showed it show none. */
export function forgetDecor(s: DecorState, path: string): DecorState {
  return {
    decors: s.decors.filter((d) => d.path !== path),
    chosen: Object.fromEntries(Object.entries(s.chosen).filter(([, p]) => p !== path)),
    framing: Object.fromEntries(Object.entries(s.framing).filter(([k]) => !k.endsWith(`\n${path}`))),
  };
}

/** Where the person left the camera for this object in this décor; the newest placements are kept. */
export function keepFraming(s: DecorState, object: string, decorPath: string, f: Framing): DecorState {
  if (!isVec3(f.position) || !isVec3(f.target)) return s;
  const key = framingKey(object, decorPath);
  const rest = Object.entries(s.framing).filter(([k]) => k !== key);
  const framing = Object.fromEntries([...rest.slice(Math.max(0, rest.length - (MAX_FRAMINGS - 1))), [key, { position: f.position, target: f.target }]]);
  return { ...s, framing };
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** A debit in micro-dollars, in the person's language; null (nothing said) shows nothing, never « $0 ». */
export function formatUsd(micro: number | null, lang: string): string | null {
  if (micro === null || !Number.isFinite(micro) || micro < 0) return null;
  const usd = micro / 1e6;
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: usd < 0.1 ? 3 : 2 }).format(usd);
  } catch (err) {
    console.warn('[objets-3d] no currency format for this language, plain dollars:', lang, err);
    return `$${usd.toFixed(3)}`;
  }
}
