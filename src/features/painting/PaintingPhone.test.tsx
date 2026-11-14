import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { words } from '../../i18n/words';

const host = vi.hoisted(() => ({ refreshPermission: vi.fn() }));
const phone = vi.hoisted(() => ({ status: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, ...host } };
});
vi.mock('../../host/phoneDoors', async (orig) => {
  const real = await orig<typeof import('../../host/phoneDoors')>();
  return { ...real, phoneDoors: { ...real.phoneDoors, ...phone } };
});
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,QR' } }));

import { PaintingPhone } from './PaintingPhone';

const w = words('en');
const idle = { active: false, url: null, address: null, seriesId: null, count: 0, phoneSeen: false, startedAt: null, lastPhotoAt: null,
  addresses: [{ name: 'Wi-Fi', address: '192.168.1.101' }], series: [] };

describe('PaintingPhone', () => {
  afterEach(() => { cleanup(); for (const f of [...Object.values(host), ...Object.values(phone)]) f.mockReset(); });

  it('a painting\'s texts unless the screen is given its own (the day\'s moments)', async () => {
    host.refreshPermission.mockResolvedValue(true);
    phone.status.mockResolvedValue(idle);
    const texts = { title: w.day.phoneTitle, hint: w.day.phoneHint, back: w.day.back };
    render(<PaintingPhone w={w} texts={texts} onTaken={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText(w.day.phoneHint)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: w.day.phoneTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.day.back })).toBeInTheDocument();
    expect(screen.queryByText(w.painting.phoneHint)).not.toBeInTheDocument();
    cleanup();
    render(<PaintingPhone w={w} onTaken={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText(w.painting.phoneHint)).toBeInTheDocument();
  });
});
