import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { words } from '../../i18n/words';
import { ShootTips } from './ShootTips';

const w = words('fr');

describe('ShootTips', () => {
  afterEach(cleanup);

  it('the icon shows the five tips over the screen, a click anywhere closes them', () => {
    render(<ShootTips w={w} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.phone.tipsTitle }));
    const dialog = screen.getByRole('dialog', { name: w.phone.tipsTitle });
    expect(dialog.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByText('Chaque photo recouvre la précédente aux deux tiers environ.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('La même lumière du début à la fin.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
