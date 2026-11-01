/**
 * WalkPad — four glass arrows over a scene walked through (doc 166 §14):
 * held, they walk forward, back, and step sideways, the way the keys do. A
 * phone has no keys, and a drag already looks around. Each arrow holds while
 * pressed, and lets go when the press ends anywhere (the pointer is captured).
 *
 * @module features/stage/WalkPad
 */
import type { ReactNode } from 'react';
import { NO_HOLD, type Held } from '../../core/walkModel';
import type { Dict } from '../../i18n/words';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from '../../ui/Icon';

function Arrow({ label, held, area, onHold, children }: {
  label: string; held: Held; area: string; onHold: (h: Held) => void; children: ReactNode;
}) {
  const release = () => onHold(NO_HOLD);
  return (
    <button className="icon" title={label} aria-label={label} style={{ gridArea: area }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); onHold(held); }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

export function WalkPad({ w, onHold }: { w: Dict; onHold: (h: Held) => void }) {
  return (
    <div className="walk-pad" role="group" aria-label={w.stage.pad}>
      <Arrow label={w.stage.padForward} area="up" held={{ ...NO_HOLD, forward: 1 }} onHold={onHold}><ChevronUp /></Arrow>
      <Arrow label={w.stage.padLeft} area="left" held={{ ...NO_HOLD, side: -1 }} onHold={onHold}><ChevronLeft /></Arrow>
      <Arrow label={w.stage.padRight} area="right" held={{ ...NO_HOLD, side: 1 }} onHold={onHold}><ChevronRight /></Arrow>
      <Arrow label={w.stage.padBack} area="down" held={{ ...NO_HOLD, forward: -1 }} onHold={onHold}><ChevronDown /></Arrow>
    </div>
  );
}
