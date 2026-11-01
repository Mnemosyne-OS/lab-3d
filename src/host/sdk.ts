/**
 * sdk — the one SDK instance of Lab 3D, and the browser's side of host
 * detection. The id must equal `name` in mnemo-plugin.json, or the host drops
 * every message.
 *
 * @module host/sdk
 */
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import type { DetectDeps } from './detect';
import type { HostStatusAnswer } from './hostState';

export const APP_ID = '@mnemosyne-plugins/lab-3d';

export const sdk = new MnemoCartridgeSDK(APP_ID);

/** Detection as the browser runs it: a parent frame, and `getStatus` through the SDK. */
export const browserDetectDeps: DetectDeps = {
  framed: () => window.parent !== window,
  ask: (timeoutMs) => sdk.invoke<HostStatusAnswer>('getStatus', undefined, timeoutMs),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (handle) => window.clearTimeout(handle as number),
};
