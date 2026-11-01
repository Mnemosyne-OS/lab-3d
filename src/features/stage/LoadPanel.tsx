/**
 * LoadPanel — a load in progress, or stopped: the scene's name over the lit
 * rail of its phases, and when it stopped, why and a way out.
 *
 * @module features/stage/LoadPanel
 */
import type { ReactNode } from 'react';
import { HudPanel } from '../../ui/HudPanel';
import { StepRail } from '../../ui/StepRail';
import type { RailStep } from '../../ui/stepRailModel';

export function LoadPanel({ title, steps, label, error, action }: {
  title: string; steps: readonly RailStep[]; label: string; error?: string; action?: ReactNode;
}) {
  return (
    <div className="loading">
      <HudPanel index="01" title={title}>
        <StepRail label={label} steps={steps} />
        {error && <div className="error-line" role="alert">{error}</div>}
        {action && <div className="load-action">{action}</div>}
      </HudPanel>
    </div>
  );
}
