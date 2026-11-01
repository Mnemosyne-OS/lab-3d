import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { words } from '../i18n/words';

vi.mock('../features/viewer/ViewerTab', () => ({ ViewerTab: () => <div data-testid="viewer" /> }));

import { App } from './App';

describe('App', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('says it runs in a browser when nothing frames it, and opens the viewer', async () => {
    render(<App />);
    const w = words(navigator.language);
    expect(await screen.findByRole('status')).toHaveTextContent(w.host.standalone);
    expect(screen.getByRole('tab', { name: w.tabs.viewer })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
  });

  it('a remembered tab that no longer exists opens the first one', () => {
    localStorage.setItem('lab3d.tab', 'gone');
    render(<App />);
    expect(screen.getByRole('tabpanel')).not.toHaveAttribute('hidden');
  });
});
