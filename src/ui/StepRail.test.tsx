import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StepRail } from './StepRail';
import type { RailStep } from './stepRailModel';

const steps: RailStep[] = [
  { id: 'a', label: 'A', state: 'done' },
  { id: 'b', label: 'B', state: 'active' },
  { id: 'c', label: 'C', state: 'pending' },
];

describe('StepRail', () => {
  afterEach(cleanup);

  it('turns its active step only while something runs behind it (style-cartouche §7)', () => {
    render(<StepRail label="job" steps={steps} />);
    expect(screen.getByRole('list', { name: 'job' })).not.toHaveClass('still');
  });

  it('keeps a guide that waits on the person still, its active step still marked current', () => {
    render(<StepRail label="guide" steps={steps} working={false} />);
    const rail = screen.getByRole('list', { name: 'guide' });
    expect(rail).toHaveClass('still');
    expect(rail.querySelector('[aria-current="step"]')).toHaveTextContent('B');
  });
});
