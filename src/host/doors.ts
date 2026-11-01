/**
 * doors — the host's doors Lab 3D uses inside Mnemosyne OS (doc 52, `splat.*`
 * and `settings.open`), each with its own deadline: the SDK's default wait is
 * five minutes, longer than anyone looks at a spinner (rule 9). A system
 * dialog has none: it stays open as long as the person chooses.
 *
 * The objects live in one folder of the host (`generations/splats`), the same
 * Objets 3D reads: what was made there shows here, and one job runs at a time
 * for both apps.
 *
 * @module host/doors
 */
import type { JobView, ObjectEntry, Piece, Scope } from '../core/model';
import type { AlignJob } from '../core/compareModel';
import { sdk } from './sdk';

/** A list, a status or a small file: the shell answers from disk. */
export const HOST_TIMEOUT_MS = 15_000;
/** One piece of a scene is up to 8 MB through the bridge. */
export const PIECE_TIMEOUT_MS = 60_000;

/** The frame folders a running job fills, in order: `all` while the video is read, `frames` the kept, `masked` the cut-outs. */
export type FrameDir = 'all' | 'frames' | 'masked';
export type Quality = 'preview' | 'full';

/** Why the host offers no engine here (doc 163 §9.1); absent from hosts older than it. */
export type UnsupportedReason = 'colmapNoLinux' | 'needsMacos15' | 'ffmpegNoMac' | 'noBuildForArch';

export interface EngineStatus {
  supported: boolean; unsupportedReason?: UnsupportedReason | null; installed: boolean; ffmpegInstalled: boolean;
  /** Who reads the video's frames here; absent from an older host (then ffmpegInstalled says it). */
  framesReader?: 'ffmpeg' | 'chromium' | null;
  /** Can « the object alone » run: the image engine and its matte. Absent from a host older than it. */
  objectOnly?: 'ready' | 'noEngine' | 'noMatte';
  job: JobView | null;
}

export const doors = {
  list: () => sdk.invoke<{ objects: ObjectEntry[] }>('splat.list', undefined, HOST_TIMEOUT_MS),
  read: (id: string, file: string, offset: number) => sdk.invoke<Piece>('splat.read', { id, file, offset }, PIECE_TIMEOUT_MS),
  status: () => sdk.invoke<EngineStatus>('splat.status', undefined, HOST_TIMEOUT_MS),
  pickVideo: () => sdk.invoke<{ path: string | null }>('splat.pickVideo', {}, 0),
  pickPhotos: () => sdk.invoke<{ path: string | null }>('splat.pickPhotos', {}, 0),
  // `frames` absent: the host decides (« auto »). A host older than the choice ignores it and keeps 100.
  start: (videoPath: string, quality: Quality, scope: Scope, frames?: number) =>
    sdk.invoke<JobView>('splat.start', { videoPath, quality, scope, ...(frames ? { frames } : {}) }, HOST_TIMEOUT_MS),
  startPhotos: (photosDir: string, quality: Quality, scope: Scope, frames?: number) =>
    sdk.invoke<JobView>('splat.start', { photosDir, quality, scope, ...(frames ? { frames } : {}) }, HOST_TIMEOUT_MS),
  frames: (id: string, dir: FrameDir) => sdk.invoke<{ names: string[] }>('splat.frames', { id, dir }, HOST_TIMEOUT_MS),
  continueJob: (id: string) => sdk.invoke<unknown>('splat.continue', { id }, HOST_TIMEOUT_MS),
  cancel: (id: string) => sdk.invoke<unknown>('splat.cancel', { id }, HOST_TIMEOUT_MS),
  /** Stop Brush and keep its last object; a host older than it refuses the action. */
  keepNow: (id: string) => sdk.invoke<unknown>('splat.keepNow', { id }, HOST_TIMEOUT_MS),
  /**
   * Put two dates of one place in one frame (doc 163 lot 5): about a minute of
   * the graphics card, so the host takes it only from a click in this window
   * (NOT_FROM_A_GESTURE). The result is `align-<refId>.json` beside the moved object.
   */
  align: (refId: string, movedId: string) => sdk.invoke<AlignJob>('splat.align', { refId, movedId }, HOST_TIMEOUT_MS),
  alignStatus: () => sdk.invoke<AlignJob | null>('splat.alignStatus', undefined, HOST_TIMEOUT_MS),
  alignCancel: () => sdk.invoke<unknown>('splat.alignCancel', undefined, HOST_TIMEOUT_MS),
  openSettings: (page: 'video' | 'theia') => sdk.invoke<unknown>('settings.open', { page }, HOST_TIMEOUT_MS),
  /** This app's own blob in the host's mirror (doc 73): survives the window's origin changing. */
  stateGet: () => sdk.invoke<{ state?: Record<string, unknown> | null }>('state.get', undefined, HOST_TIMEOUT_MS),
  stateSet: (state: Record<string, unknown>) => sdk.invoke<unknown>('state.set', { state }, HOST_TIMEOUT_MS),
  /**
   * One picture drawn on the person's credits (`image.generate`). The host
   * refuses it unless it comes from a click in this window (NOT_FROM_A_GESTURE).
   */
  drawPicture: (prompt: string, aspectRatio: string, modelId: string) =>
    sdk.invoke<{ path?: string; model?: string; billedUsdMicro?: number | null }>('image.generate', { prompt, aspectRatio, modelId }, IMAGE_TIMEOUT_MS),
  /**
   * One picture changed on the person's credits: `image.generate` with the
   * picture to change sent inline (a data URL), the dive's next level (doc 166
   * §15.5). The same click rule as drawPicture.
   */
  editPicture: (prompt: string, aspectRatio: string, modelId: string, editImageData: string) =>
    sdk.invoke<{ path?: string; model?: string; billedUsdMicro?: number | null }>('image.generate', { prompt, aspectRatio, modelId, editImageData }, IMAGE_TIMEOUT_MS),
  /** A picture the person picks in the system's dialog: its path, or null when the dialog was closed. No deadline. */
  selectImage: (filterName: string, startIn?: string) =>
    sdk.invoke<string | null>('dialog.selectFile', { filters: [{ name: filterName, extensions: IMAGE_EXTENSIONS }], ...(startIn ? { startIn } : {}) }, 0),
  /** A picture on disk as a data URL (`dialog.readFile`); anything else is an error with the host's reason. */
  readPicture: async (path: string): Promise<string> => {
    const res = await sdk.invoke<{ success?: boolean; content?: string; isBinary?: boolean; error?: string }>('dialog.readFile', { filePath: path }, HOST_TIMEOUT_MS);
    if (res?.success && res.isBinary && typeof res.content === 'string' && res.content.startsWith('data:image/')) return res.content;
    throw new Error(res?.error ?? 'NOT_AN_IMAGE');
  },
  /** Whether a depth can be read here: the image engine, the depth model's weights (downloaded in Settings › Images, never by a cartridge). */
  depthStatus: () => sdk.invoke<{ engine: boolean; weights: boolean; downloadBytes: number }>('image.depthStatus', undefined, HOST_TIMEOUT_MS),
  /**
   * The depth of one picture, on this machine, no credit spent: a grey PNG beside it (its path).
   * `upright`: read from the picture as it is shown (its EXIF orientation applied); a host
   * older than that says nothing, and its depth lies as the photo is stored.
   */
  depth: (path: string) => sdk.invoke<{ path: string; reused?: boolean; upright?: boolean }>('image.depth', { path }, DEPTH_TIMEOUT_MS),
  /**
   * Re-read this app's manifest and ask whether it now holds `permission`:
   * the host reads permissions at start, so one added since stays refused
   * until this. May open the host's consent dialog, hence no deadline.
   */
  refreshPermission: async (permission: string): Promise<boolean> => {
    const res = await sdk.invoke<{ granted?: Record<string, boolean> }>('permissions.refresh', { permissions: [permission] }, 0);
    return res?.granted?.[permission] === true;
  },
};

/** A picture on credits takes up to a few minutes; the host's own bound is 200 s. */
const IMAGE_TIMEOUT_MS = 210_000;
/** The host's own bound on a depth is 6 min (main gives the sidecar 5): this waits a little longer. */
const DEPTH_TIMEOUT_MS = 6.5 * 60_000;
/** What « choose a picture » offers. */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

/** A refused permission reads as « Unauthorized: … » from the bridge. */
export function isPermissionRefusal(err: unknown): boolean {
  return /Unauthorized|permission/i.test(err instanceof Error ? err.message : String(err));
}

/** The job's folder name is its object's id. */
export function jobObjectId(job: Pick<JobView, 'outDir' | 'id'>): string {
  return job.outDir.split(/[\\/]/).pop() || job.id;
}
