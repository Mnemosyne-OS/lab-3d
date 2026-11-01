/**
 * HostBadge — where Lab 3D runs, in the top bar: a dim dot in a browser or a
 * foreign frame, a pulsing green dot inside Mnemosyne OS, a searching dot while
 * the answer is awaited.
 *
 * @module ui/HostBadge
 */
import type { HostState } from '../host/hostState';
import type { Dict } from '../i18n/words';

export function HostBadge({ state, w }: { state: HostState | null; w: Dict }) {
  const kind = state?.kind ?? 'pending';
  const label = state ? w.host[state.kind] : w.host.pending;
  return (
    <span className={`host-badge ${kind}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden />
      {label}
    </span>
  );
}
