/**
 * StepRail — the luminous pipeline: one node per step, linked by a track that
 * fills green behind the work and carries a running light on the live link.
 * Horizontal by default, vertical where the space is narrow.
 *
 * @module ui/StepRail
 */
import type { RailStep } from './stepRailModel';
import { Check } from './Icon';

export function StepRail({ steps, vertical = false, label }: { steps: readonly RailStep[]; vertical?: boolean; label: string }) {
  return (
    <ol className={`rail${vertical ? ' vertical' : ''}`} aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((s, i) => (
        <li key={s.id} className={`rail-step ${s.state}`} aria-current={s.state === 'active' ? 'step' : undefined} data-state={s.state}>
          <span className="rail-node" aria-hidden>
            {s.state === 'done' ? <Check size={18} /> : s.state === 'failed' ? '!' : String(i + 1).padStart(2, '0')}
          </span>
          <span className="rail-text">
            <span className="rail-label">{s.label}</span>
            <span className="rail-detail">{s.detail ?? ''}</span>
          </span>
          {i < steps.length - 1 && (
            <span className="rail-link" aria-hidden>
              <span className="fill" />
              <span className="comet" />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
