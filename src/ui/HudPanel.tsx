/**
 * HudPanel — a glass panel with lit corner brackets and an indexed title line.
 *
 * @module ui/HudPanel
 */
import type { ReactNode } from 'react';

export function HudPanel({ index, title, children, className = '', aside }: {
  index?: string; title?: string; children: ReactNode; className?: string; aside?: ReactNode;
}) {
  return (
    <section className={`hud ${className}`} aria-label={title}>
      <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
      {title && (
        <header className="hud-head">
          {index && <span className="hud-index">{index}</span>}
          <span className="hud-title">{title}</span>
          <span className="rule" />
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
