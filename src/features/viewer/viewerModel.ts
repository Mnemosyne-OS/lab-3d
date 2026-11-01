/**
 * viewerModel — what the stand-alone viewer accepts. Values only (Fast
 * Refresh): the tab lives in ViewerTab.tsx.
 *
 * @module features/viewer/viewerModel
 */

/** What Spark reads, by the name's extension. */
export const SCENE_EXTENSIONS = ['.spz', '.ply', '.splat', '.ksplat'] as const;

/** How long reading a local file may take before it is called stuck. */
export const READ_TIMEOUT_MS = 30_000;

export function isSceneFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SCENE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
