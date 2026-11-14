/**
 * format — numbers as the readouts say them, in the app's language. A value
 * nobody measured is « — », never 0.
 *
 * @module lib/format
 */

/** « 4.2 MB » in the given language; « — » for a size nobody measured. */
export function formatBytes(bytes: number | null | undefined, lang: string): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: u === 0 ? 0 : 1 }).format(v)} ${units[u]}`;
}

/** A count in the given language (« 1 234 567 »); « — » when unknown. */
export function formatCount(n: number | null | undefined, lang: string): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : new Intl.NumberFormat(lang).format(n);
}

/** « 0.8 s » or « 340 ms ». */
export function formatMs(ms: number, lang: string): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

/** An hour of the day as the language writes it (« 14:05 », « 02:05 PM »). */
export function formatHour(t: number, lang: string): string {
  try { return new Date(t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }); }
  catch (err) { console.warn('[lab-3d] time not formatted in this language:', lang, err); return new Date(t).toTimeString().slice(0, 5); }
}

/** « 14:05 » as an <input type="time"> wants it, whatever the language. */
export function formatInputTime(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The singular or the plural text, as the language counts `n` (French: 0 is singular, English: plural). */
export function pluralOf(n: number, lang: string, one: string, other: string): string {
  try { return new Intl.PluralRules(lang).select(n) === 'one' ? one : other; }
  catch (err) { console.warn('[lab-3d] plural rules unknown for this language:', lang, err); return n === 1 ? one : other; }
}

/** The share done so far, as « 42 % »; empty when the total is unknown. */
export function percent(loaded: number, total: number): string {
  return total > 0 ? `${Math.min(100, Math.round((loaded / total) * 100))} %` : '';
}
