/**
 * decorStore — where Lab 3D keeps its décors (doc 166): this window's
 * localStorage first, the host's mirror behind it (doc 73), since the
 * window's origin can change under it (dev server, packaged copy) and a
 * storage left at the other origin reads as empty. One blob, written whole.
 *
 * Lab 3D starts with its own list: the décors kept by Objets 3D live under
 * that app's id and do not follow (doc 166 §3). A picture already on disk,
 * one of them included, comes in by « choose a picture ».
 *
 * @module features/decor/decorStore
 */
import { doors } from '../../host/doors';
import { DECOR_MODELS, aspectFor, decorPrompt, parseDecorState, type DecorEntry, type DecorPreset, type DecorQuality, type DecorState } from '../../core/decorModel';

export const DECOR_KEY = 'lab3d.decors.v1';

/**
 * What was read: the state, or why it could not be. « Nothing kept yet » (no
 * local copy, the host's mirror empty) is a state; a mirror that could not be
 * asked is not, and nothing may be written over it until a read succeeds:
 * writing then would replace the person's décors with an empty list.
 */
export type DecorRead = { ok: true; state: DecorState } | { ok: false; error: string };

/** The local copy when there is one, else the host's mirror, else nothing kept yet. */
export async function readDecorState(): Promise<DecorRead> {
  let local: string | null = null;
  try { local = localStorage.getItem(DECOR_KEY); }
  catch (err) { console.warn('[lab-3d] décors: this window cannot read its storage, the host copy is asked:', err); }
  if (local) {
    try { return { ok: true, state: parseDecorState(JSON.parse(local)) }; }
    catch (err) { console.warn('[lab-3d] décors: the local copy is not JSON, the host copy is asked:', err); }
  }
  try {
    const res = await doors.stateGet();
    return { ok: true, state: parseDecorState((res?.state as { decor?: unknown } | null | undefined)?.decor) };
  } catch (err) {
    console.warn('[lab-3d] décors: the host copy could not be read:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Keep it in both places. A failed host write is only logged (the next change
 * writes it again), and a failed local one too: the host copy then carries it.
 */
export async function writeDecorState(s: DecorState): Promise<void> {
  try { localStorage.setItem(DECOR_KEY, JSON.stringify(s)); }
  catch (err) { console.warn('[lab-3d] décors: not kept in this window:', err); }
  try { await doors.stateSet({ decor: s }); }
  catch (err) { console.warn('[lab-3d] décors: not kept in the host copy:', err); }
}

/**
 * One décor drawn on the person's credits, as an entry to add to whatever is
 * kept WHEN it arrives (the person may choose or remove things during the
 * minutes it takes). The view's shape picks the picture's.
 */
export async function drawDecor(place: string, preset: DecorPreset | null, quality: DecorQuality, view: { width: number; height: number }): Promise<DecorEntry> {
  const res = await doors.drawPicture(decorPrompt(place), aspectFor(view.width, view.height), DECOR_MODELS[quality]);
  if (!res?.path) throw new Error('NO_PICTURE_RETURNED');
  return {
    path: res.path,
    place: place.trim(),
    ...(preset ? { preset } : {}),
    at: new Date().toISOString(),
    // The model the host names; none named is unknown, not the one asked for.
    model: res.model ?? '',
    // A host that says nothing of the debit is not a free picture: null.
    billedUsdMicro: typeof res.billedUsdMicro === 'number' ? res.billedUsdMicro : null,
  };
}

/** A picture already on disk, chosen by the person: free, so nothing billed is recorded. */
export function pickedDecor(path: string): DecorEntry {
  return { path, place: '', at: new Date().toISOString(), model: '', billedUsdMicro: null };
}

const pictures = new Map<string, Promise<string>>();
/** The most pictures held at once (a panel shows a few dozen at most); past it the oldest is let go. */
const PICTURES_MAX = 24;

/**
 * Whether a décor can be laid on its depth here: ready, noEngine (the image
 * engine is not installed), missing (the depth model's weights are not on
 * this machine; the download is the person's, in Settings › Images), or
 * unknown (a host from before the relief, or one that did not answer: the
 * décor stays flat and nothing is said about a door that may not exist).
 */
export async function depthReady(): Promise<{ state: 'ready' | 'noEngine' | 'missing' | 'unknown'; downloadBytes: number | null }> {
  try {
    const r = await doors.depthStatus();
    const bytes = typeof r?.downloadBytes === 'number' && r.downloadBytes > 0 ? r.downloadBytes : null;
    return { state: !r?.engine ? 'noEngine' : r.weights ? 'ready' : 'missing', downloadBytes: bytes };
  } catch (err) {
    console.warn('[lab-3d] the depth status could not be read, the décor stays flat:', err);
    return { state: 'unknown', downloadBytes: null };
  }
}

const depths = new Map<string, Promise<{ url: string; upright: boolean }>>();

/**
 * A picture's depth as a data URL: made by the host on the first ask (beside
 * the picture, so it is made once), then read. `upright` when the host read
 * the picture as it is shown; false from a host older than that, whose depth
 * lies as a phone photo is stored (sideways). A failure is not kept.
 */
export function pictureDepth(path: string): Promise<{ url: string; upright: boolean }> {
  const hit = depths.get(path);
  if (hit) return hit;
  if (depths.size >= PICTURES_MAX) depths.delete(depths.keys().next().value!);
  const p = doors.depth(path).then(async (r) => {
    if (!r?.path) throw new Error('NO_DEPTH_RETURNED');
    return { url: await doors.readPicture(r.path), upright: r.upright === true };
  });
  depths.set(path, p);
  p.catch(() => depths.delete(path));
  return p;
}

/** A décor's depth picture as a data URL (see pictureDepth). */
export function decorDepthPicture(path: string): Promise<string> {
  return pictureDepth(path).then((d) => d.url);
}

/** A décor's picture as a data URL, read once per window; a failure is not kept, so the next ask tries again. */
export function decorPicture(path: string): Promise<string> {
  const hit = pictures.get(path);
  if (hit) return hit;
  if (pictures.size >= PICTURES_MAX) pictures.delete(pictures.keys().next().value!);
  const p = doors.readPicture(path);
  pictures.set(path, p);
  p.catch(() => pictures.delete(path));
  return p;
}
