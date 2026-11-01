/**
 * useHost — where Lab 3D runs, as React state: null while the answer is
 * awaited, then standalone / foreign / mnemosyne (host/detect). A late answer
 * from Mnemosyne still switches the state.
 *
 * @module app/useHost
 */
import { useEffect, useState } from 'react';
import { watchHost, type DetectDeps } from '../host/detect';
import type { HostState } from '../host/hostState';
import { browserDetectDeps } from '../host/sdk';

export function useHost(deps: DetectDeps = browserDetectDeps): HostState | null {
  const [state, setState] = useState<HostState | null>(null);
  useEffect(() => watchHost(setState, deps), [deps]);
  return state;
}
