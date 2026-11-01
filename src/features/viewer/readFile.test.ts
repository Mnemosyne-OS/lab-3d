import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileBytes } from './readFile';

describe('readFileBytes', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('reads the bytes of a file', async () => {
    const bytes = await readFileBytes(new Blob([new Uint8Array([1, 2, 3])]), () => {});
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it('ends on its deadline when the reader never answers, and aborts it', async () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    // A reader that fires neither load nor error: the case the deadline exists for.
    class SilentReader { onload = null; onerror = null; onprogress = null; result = null; error = null; abort = abort; readAsArrayBuffer() {} }
    vi.stubGlobal('FileReader', SilentReader);
    const read = readFileBytes(new Blob(['x']), () => {}, 1_000);
    const caught = read.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await caught).toBe('READ_TIMEOUT');
    expect(abort).toHaveBeenCalledOnce();
  });

  it('a reader that throws on the spot is a failure, not a silence', async () => {
    class ThrowingReader { abort() {} readAsArrayBuffer() { throw new Error('NotReadable'); } }
    vi.stubGlobal('FileReader', ThrowingReader);
    await expect(readFileBytes(new Blob(['x']), () => {})).rejects.toThrow('NotReadable');
  });
});
