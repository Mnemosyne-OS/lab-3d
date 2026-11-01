/**
 * sceneLoad — one finished object, read from the host for the stage: its
 * cameras (the first image is a viewpoint the person filmed), its manifest
 * (which scene file it names), and the scene itself in pieces. No three.js.
 *
 * @module features/objects/sceneLoad
 */
import { doors } from '../../host/doors';
import { readScope, readWhole, sceneFiles, type Read, type SceneFile, type Scope } from '../../core/model';
import type { Rig } from '../../core/stageModel';
import { asRig } from '../../lib/rig';

/** `scope` is what the manifest says was made; null when it says nothing (an object made before the choice). */
export type LoadedScene =
  | { ok: true; rig: Rig | null; bytes: Uint8Array; fileName: SceneFile; scope: Scope | null }
  | { ok: false; error: string };

function json(read: Read, what: string, id: string): unknown {
  if (!read.ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(read.bytes));
  } catch (err) {
    console.warn(`[lab-3d] ${what} is not JSON:`, id, err);
    return null;
  }
}

/**
 * The cameras, then the manifest, then the scene file it names (the other one
 * only when that one is missing). `onProgress` gets the scene's pieces, 0..1,
 * measured. A missing or unreadable cameras.json is no rig, never an error.
 */
export async function loadScene(id: string, onProgress?: (fraction: number) => void): Promise<LoadedScene> {
  const cams = await readWhole((o) => doors.read(id, 'cameras.json', o));
  if (!cams.ok) console.warn('[lab-3d] no cameras for this object, it is framed from its points:', id, cams.error);
  const rig = asRig(json(cams, 'cameras.json', id));
  const man = await readWhole((o) => doors.read(id, 'manifest.json', o));
  if (!man.ok) console.warn('[lab-3d] manifest unreadable, the scene is looked for by name:', id, man.error);
  const manifest = json(man, 'manifest.json', id);
  const files = sceneFiles(manifest);
  let bytes: Read = { ok: false, error: 'NOT_FOUND' };
  let fileName = files[0]!;
  for (const f of files) {
    fileName = f;
    bytes = await readWhole((o) => doors.read(id, f, o), onProgress);
    // Only a missing file moves to the other one; any other error is said.
    if (bytes.ok || !/NOT_FOUND/.test(bytes.error)) break;
  }
  const said = (manifest as { scope?: unknown } | null)?.scope;
  const scope: Scope | null = readScope(said);
  return bytes.ok ? { ok: true, rig, bytes: bytes.bytes, fileName, scope } : { ok: false, error: bytes.error };
}
