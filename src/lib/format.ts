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

/** The share done so far, as « 42 % »; empty when the total is unknown. */
export function percent(loaded: number, total: number): string {
  return total > 0 ? `${Math.min(100, Math.round((loaded / total) * 100))} %` : '';
}
