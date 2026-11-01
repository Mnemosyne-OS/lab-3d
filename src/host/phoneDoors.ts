/**
 * phoneDoors — the host's phone capture, as Lab 3D reaches it (Mnemosyne OS
 * doc 176 §11, the `phoneCapture.*` actions behind `phone:capture`).
 *
 * The host opens a series on the PC's own network and keeps the photos in a
 * working folder; this app shows the QR code, the counter, and asks where the
 * series goes at Done. A host that does not announce `phone.photos` has none
 * of these doors.
 *
 * @module host/phoneDoors
 */
import { HOST_TIMEOUT_MS } from './doors';
import { sdk } from './sdk';

/** The capability token a host announces when it has these doors. */
export const PHONE_CAPABILITY = 'phone.photos';
/** The permission the manifest declares for them. */
export const PHONE_PERMISSION = 'phone:capture';

export interface PhoneSeries {
  id: string; photos: number; startedAt: number | null;
  /** Where it waits in the app (the status lists it; `stop` does not). A 3D job reads the photos there. */
  dir?: string;
}

export interface PhoneStatus {
  active: boolean;
  /** What the QR code carries. */
  url: string | null;
  address: string | null;
  seriesId: string | null;
  count: number;
  /** A phone loaded the page: its certificate warning was passed. */
  phoneSeen: boolean;
  /** The phone opened the page with no certificate refused first: it trusts the PC. Null before; absent from an older host. */
  phoneTrusted?: boolean | null;
  /** Where the phone downloads the PC's certificate to install it (plain HTTP); absent from an older host. */
  caUrl?: string | null;
  startedAt: number | null;
  lastPhotoAt: number | null;
  /** The PC's addresses a phone on the same network can reach. */
  addresses: Array<{ name: string; address: string }>;
  /** Closed series not placed yet, oldest first. */
  series: PhoneSeries[];
}

export interface PhoneDestination { workspaceId: string; name: string; protection: string | null }

/** Where a placed series is: the folder `splat.start` reads as `photosDir`. */
export interface Placed { dir: string; photos: number }

/** Moving a series of photos across drives can take a while. */
const MOVE_TIMEOUT_MS = 70_000;

export const phoneDoors = {
  status: () => sdk.invoke<PhoneStatus>('phoneCapture.status', undefined, HOST_TIMEOUT_MS),
  /**
   * `continueSeries`: a waiting series' id, whose photos go on (« Add photos »);
   * `redo`: names of its photos COLMAP could not place, shown in red on the phone.
   */
  start: (address: string, continueSeries?: string, redo?: readonly string[]) =>
    sdk.invoke<PhoneStatus>('phoneCapture.start', { address, ...(continueSeries ? { continueSeries } : {}), ...(redo?.length ? { redo } : {}) }, 70_000),
  stop: () => sdk.invoke<PhoneSeries | null>('phoneCapture.stop', undefined, HOST_TIMEOUT_MS),
  destinations: () => sdk.invoke<{ vaults: PhoneDestination[] }>('phoneCapture.destinations', undefined, HOST_TIMEOUT_MS),
  deliver: (seriesId: string, workspaceId: string) => sdk.invoke<Placed>('phoneCapture.deliver', { seriesId, workspaceId }, MOVE_TIMEOUT_MS),
  /** A new vault watching its own folder: nothing to choose. */
  deliverToNewVault: (seriesId: string, name: string) => sdk.invoke<Placed>('phoneCapture.deliverToNewVault', { seriesId, name }, MOVE_TIMEOUT_MS),
  /** Opens the system's folder dialog: no deadline. Null when it was closed. */
  deliverToFolder: (seriesId: string) => sdk.invoke<Placed | null>('phoneCapture.deliverToFolder', { seriesId }, 0),
  discard: (seriesId: string) => sdk.invoke<null>('phoneCapture.discard', { seriesId }, HOST_TIMEOUT_MS),
};
