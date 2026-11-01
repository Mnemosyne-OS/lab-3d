/**
 * hostState — where Lab 3D is running, as one value (doc 166 §4).
 *
 *   standalone  — a plain browser tab: no parent frame at all.
 *   foreign     — inside a frame, but nobody answered as Mnemosyne OS (a site
 *                 that embeds the app is not Mnemosyne).
 *   mnemosyne   — Mnemosyne OS answered `getStatus`, with the capability tokens
 *                 its build announces.
 *
 * A feature lights up on an ANNOUNCED token, never on a version number: a
 * cartridge published today runs on hosts months old (hostCapabilities.ts in
 * the host says why). Values only: no component lives here.
 *
 * @module host/hostState
 */

export type HostState =
  | { kind: 'standalone' }
  | { kind: 'foreign' }
  | { kind: 'mnemosyne'; capabilities: readonly string[]; platform: string | null };

/** What the host's `getStatus` answers (the fields this app reads). */
export interface HostStatusAnswer {
  capabilities?: unknown;
  platform?: unknown;
}

/** The Mnemosyne state from a `getStatus` answer; unreadable fields are left out, never invented. */
export function fromStatus(answer: HostStatusAnswer | null | undefined): HostState {
  const caps = Array.isArray(answer?.capabilities) ? answer.capabilities.filter((c): c is string => typeof c === 'string') : [];
  const platform = typeof answer?.platform === 'string' ? answer.platform : null;
  return { kind: 'mnemosyne', capabilities: caps, platform };
}

/** True inside Mnemosyne OS, whatever it announces. */
export function inMnemosyne(state: HostState): state is Extract<HostState, { kind: 'mnemosyne' }> {
  return state.kind === 'mnemosyne';
}

/** True when Mnemosyne OS answered AND announced this capability token. */
export function hasCapability(state: HostState, token: string): boolean {
  return state.kind === 'mnemosyne' && state.capabilities.includes(token);
}
