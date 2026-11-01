/**
 * fakeHost — a host's `splat.read` over files held in memory, for the tests of
 * this folder: pieces as the bridge sends them (base64, offset, total), and
 * NOT_FOUND for a file that is not there.
 */
import type { Piece } from '../../core/model';

export function piecesOf(files: Record<string, Uint8Array | string>) {
  return async (id: string, file: string, offset: number): Promise<Piece> => {
    const raw = files[`${id}/${file}`];
    if (raw === undefined) throw new Error('NOT_FOUND');
    const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;
    const part = bytes.subarray(offset);
    let bin = '';
    for (const b of part) bin += String.fromCharCode(b);
    return { base64: btoa(bin), offset, length: part.length, total: bytes.length };
  };
}

export const RIG = { target: [0, 0, 0], up: [0, -1, 0], cams: [[0, 0, 3], [3, 0, 0], [0, 0, -3]] };
