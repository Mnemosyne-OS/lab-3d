/**
 * readFile — a local file's bytes, with progress, and an end in every case.
 *
 * 🪤 A FileReader on a file dragged from somewhere odd can fire neither `load`
 * nor `error` (a promised file whose bytes never arrive): without a deadline
 * the viewer would sit on « Read » for ever. The deadline aborts the reader.
 *
 * @module features/viewer/readFile
 */
import { READ_TIMEOUT_MS } from './viewerModel';

export function readFileBytes(
  file: Blob,
  onProgress: (loaded: number, total: number) => void,
  timeoutMs = READ_TIMEOUT_MS,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };
    const timer = window.setTimeout(() => settle(() => { reader.abort(); reject(new Error('READ_TIMEOUT')); }), timeoutMs);
    reader.onprogress = (e) => { if (!settled) onProgress(e.loaded, e.lengthComputable ? e.total : file.size); };
    reader.onload = () => settle(() => {
      const r = reader.result;
      if (r instanceof ArrayBuffer) resolve(new Uint8Array(r));
      else reject(new Error('READ_NO_BYTES'));
    });
    reader.onerror = () => settle(() => reject(reader.error ?? new Error('READ_FAILED')));
    try {
      reader.readAsArrayBuffer(file);
    } catch (err) {
      settle(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}
