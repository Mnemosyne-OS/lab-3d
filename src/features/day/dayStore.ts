/**
 * dayStore — where Lab 3D keeps its days (« Une journée »): this window's
 * localStorage first, the host's mirror behind it (doc 73), as the décors do.
 * The mirror is ONE blob for the app: the days write their own key and leave
 * the décors' as they are (host/mirror).
 *
 * A day keeps paths and poses, never a photo: the photos stay where they were
 * taken (the phone's series, a folder on disk).
 *
 * @module features/day/dayStore
 */
import { readMirror, writeMirrorKey } from '../../host/mirror';
import { parseDaysState, type DaysState } from '../../core/dayModel';

export const DAYS_KEY = 'lab3d.days.v1';
/** The day open last, reopened with the tab. */
export const CURRENT_DAY_KEY = 'lab3d.day.current';

/**
 * What was read. « Nothing kept yet » is a state; a mirror that could not be
 * asked is not, and nothing may be written over it until a read succeeds.
 */
export type DaysRead = { ok: true; state: DaysState } | { ok: false; error: string };

export async function readDaysState(): Promise<DaysRead> {
  let local: string | null = null;
  try { local = localStorage.getItem(DAYS_KEY); }
  catch (err) { console.warn('[lab-3d] days: this window cannot read its storage, the host copy is asked:', err); }
  if (local) {
    try { return { ok: true, state: parseDaysState(JSON.parse(local)) }; }
    catch (err) { console.warn('[lab-3d] days: the local copy is not JSON, the host copy is asked:', err); }
  }
  try {
    const blob = await readMirror();
    return { ok: true, state: parseDaysState(blob.days) };
  } catch (err) {
    console.warn('[lab-3d] days: the host copy could not be read:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Keep it in both places; a failed write is logged, the next change writes it again. */
export async function writeDaysState(s: DaysState): Promise<void> {
  try { localStorage.setItem(DAYS_KEY, JSON.stringify(s)); }
  catch (err) { console.warn('[lab-3d] days: not kept in this window:', err); }
  try { await writeMirrorKey('days', s); }
  catch (err) { console.warn('[lab-3d] days: not kept in the host copy:', err); }
}
