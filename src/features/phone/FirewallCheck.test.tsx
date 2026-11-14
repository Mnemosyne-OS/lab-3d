import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fill, words } from '../../i18n/words';

const door = vi.hoisted(() => ({ firewall: vi.fn(), allowFirewall: vi.fn() }));
vi.mock('../../host/phoneDoors', async (orig) => {
  const real = await orig<typeof import('../../host/phoneDoors')>();
  return { ...real, phoneDoors: { ...real.phoneDoors, firewall: door.firewall, allowFirewall: door.allowFirewall } };
});

import { FirewallCheck } from './FirewallCheck';

const w = words('en');
const p = w.phone;
const HOTSPOT = '10.242.192.56';
const closed = { state: 'closed', network: 'Public', vpn: [] };
const open = { state: 'open', network: 'Public', vpn: [] };

describe('FirewallCheck', () => {
  afterEach(() => { cleanup(); door.firewall.mockReset(); door.allowFirewall.mockReset(); vi.restoreAllMocks(); });

  it('outside Windows asks nothing and shows nothing', () => {
    const { container } = render(<FirewallCheck w={w} address={HOTSPOT} platform="darwin" />);
    expect(container).toBeEmptyDOMElement();
    expect(door.firewall).not.toHaveBeenCalled();
  });

  it('a hotspot Windows blocks says so, and « Allow » asks Windows then reads again', async () => {
    door.firewall.mockResolvedValueOnce(closed).mockResolvedValueOnce(open);
    door.allowFirewall.mockResolvedValue(null);
    const { container } = render(<FirewallCheck w={w} address={HOTSPOT} platform="win32" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(fill(p.fwClosed, { network: 'public' }));
    expect(door.firewall).toHaveBeenCalledWith(HOTSPOT);
    fireEvent.click(screen.getByRole('button', { name: p.fwAllow }));
    await waitFor(() => expect(door.firewall).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(door.allowFirewall).toHaveBeenCalledTimes(1);
  });

  it('a « No » at Windows prompt is said, and the button stays', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    door.firewall.mockResolvedValue(closed);
    door.allowFirewall.mockRejectedValue(new Error('ELEVATION_REFUSED'));
    render(<FirewallCheck w={w} address={HOTSPOT} platform="win32" />);
    fireEvent.click(await screen.findByRole('button', { name: p.fwAllow }));
    expect(await screen.findByText(p.fwRefused)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: p.fwAllow })).toBeEnabled();
    expect(door.firewall).toHaveBeenCalledTimes(1);
  });

  it('an open firewall shows nothing but a VPN up, which can keep the phone out alone', async () => {
    door.firewall.mockResolvedValue({ ...open, vpn: ['ProtonVPN'] });
    render(<FirewallCheck w={w} address={HOTSPOT} platform="win32" />);
    expect(await screen.findByText(fill(p.fwVpn, { names: 'ProtonVPN' }))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: p.fwAllow })).not.toBeInTheDocument();
  });

  it('an older host without the action keeps the sentence from before', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    door.firewall.mockRejectedValue(new Error('Unknown action phoneCapture.firewall'));
    render(<FirewallCheck w={w} address={HOTSPOT} platform="win32" />);
    expect(await screen.findByText(p.firewall)).toBeInTheDocument();
  });

  it('another address is read again', async () => {
    door.firewall.mockResolvedValue(open);
    const { rerender } = render(<FirewallCheck w={w} address={HOTSPOT} platform="win32" />);
    await waitFor(() => expect(door.firewall).toHaveBeenCalledWith(HOTSPOT));
    rerender(<FirewallCheck w={w} address="192.168.1.101" platform="win32" />);
    await waitFor(() => expect(door.firewall).toHaveBeenLastCalledWith('192.168.1.101'));
  });
});
