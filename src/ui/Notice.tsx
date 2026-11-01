/**
 * Notice — a short state in the middle of a tab: waiting (with the scanner),
 * empty, or stopped with a way out.
 *
 * @module ui/Notice
 */
import type { ReactNode } from 'react';
import { HudPanel } from './HudPanel';

export function Notice({ children, scanning = false }: { children: ReactNode; scanning?: boolean }) {
  return (
    <div className="loading">
      <HudPanel>
        <div className="drop-body" role="status">
          {scanning && (
            <div className="scanner small" aria-hidden>
              <span className="ring" /><span className="ring r2" /><span className="sweep" /><span className="core" />
            </div>
          )}
          {children}
        </div>
      </HudPanel>
    </div>
  );
}
