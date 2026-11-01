/**
 * StageOverlay — what sits over a scene on stage: the lit frame corners, the
 * readout of what was measured, the tools in the top-right corner (✕ last),
 * the mouse hint, and what a tab adds over the scene (the walk's pad).
 * Shared by every tab that shows a scene. A row marked minor is left out on a
 * phone, where the readout keeps one line per row.
 *
 * @module features/stage/StageOverlay
 */
import { Fragment, type ReactNode } from 'react';
import { HudPanel } from '../../ui/HudPanel';

export function StageOverlay({ rows, tools, hint, children }: {
  rows: ReadonlyArray<readonly [label: string, value: string, minor?: boolean]>; tools: ReactNode; hint: string; children?: ReactNode;
}) {
  return (
    <div className="overlay">
      <span className="frame-corner tl" /><span className="frame-corner tr" /><span className="frame-corner bl" /><span className="frame-corner br" />
      <HudPanel className="readout">
        <dl>
          {rows.map(([label, value, minor]) => (
            <Fragment key={label}>
              <dt className={minor ? 'minor' : undefined}>{label}</dt><dd className={minor ? 'minor' : undefined} title={value}>{value}</dd>
            </Fragment>
          ))}
        </dl>
      </HudPanel>
      <div className="tools">{tools}</div>
      {children}
      <div className="hint">{hint}</div>
    </div>
  );
}

/** A glass icon button of the stage's tools; `on` lights it green (a switch that is on). */
export function ToolButton({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`icon${on ? ' on' : ''}`} title={label} aria-label={label} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}
