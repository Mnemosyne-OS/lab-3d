import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { words } from '../../i18n/words';

// The stage draws with WebGL, which jsdom has not: a stand-in that keeps the
// contract (load → onDecoded → resolves with a count, or rejects).
const stage = vi.hoisted(() => ({ outcome: { splats: 1234, grounded: false, viewpoints: 0 } as { splats: number | null; grounded: boolean; viewpoints: number } | Error, instances: 0 }));
vi.mock('../../engine/SplatStage', () => ({
  SplatStage: class {
    constructor() { stage.instances++; }
    async load(_b: Uint8Array, _n: string, opts?: { onDecoded?: () => void }) {
      if (stage.outcome instanceof Error) throw stage.outcome;
      opts?.onDecoded?.();
      return stage.outcome;
    }
    setFlipped() {} setAutoRotate() {} resetView() {} close() {} dispose() {}
  },
}));

import { ViewerTab } from './ViewerTab';

const w = words('en');
const pick = (name: string) => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3, 4])], name)] } });
};

describe('ViewerTab', () => {
  afterEach(() => { cleanup(); stage.outcome = { splats: 1234, grounded: false, viewpoints: 0 }; stage.instances = 0; vi.restoreAllMocks(); });

  it('shows a picked scene with what was measured', async () => {
    render(<ViewerTab w={w} lang="en" />);
    pick('vase.spz');
    await screen.findByText('1,234');
    expect(screen.getByText('vase.spz')).toBeInTheDocument();
    expect(screen.getByText('4 B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.stage.close })).toBeInTheDocument();
    expect(stage.instances).toBe(1);
  });

  it('refuses a file it does not read, by name, without starting a stage', () => {
    render(<ViewerTab w={w} lang="en" />);
    pick('photo.jpg');
    expect(screen.getByRole('alert')).toHaveTextContent('photo.jpg');
    expect(stage.instances).toBe(0);
  });

  it('says a scene without points, and lights the step that stopped in red', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stage.outcome = new Error('EMPTY_SCENE');
    render(<ViewerTab w={w} lang="en" />);
    pick('empty.ply');
    await screen.findByText(w.stage.empty);
    const failed = document.querySelector('.rail-step.failed');
    expect(failed).toHaveTextContent(w.stage.stepDecode);
    expect(document.querySelectorAll('.rail-step.done')).toHaveLength(1);
  });

  it('closing goes back to the drop target and keeps the stage for the next scene', async () => {
    render(<ViewerTab w={w} lang="en" />);
    pick('vase.spz');
    await screen.findByText('1,234');
    fireEvent.click(screen.getByRole('button', { name: w.stage.close }));
    await waitFor(() => expect(screen.getByText(w.viewer.dropTitle)).toBeInTheDocument());
    pick('room.splat');
    await screen.findByText('1,234');
    expect(screen.getByText('room.splat')).toBeInTheDocument();
    expect(stage.instances).toBe(1);
  });

  it('a load still running when the tab goes away ends quietly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = render(<ViewerTab w={w} lang="en" />);
    pick('vase.spz');
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(warn).not.toHaveBeenCalled();
    expect(stage.instances).toBe(0);
  });
});
