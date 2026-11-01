/**
 * The phone capture screen (doc 176): it opens a series on the network the
 * person sees, shows the QR and the counter, asks where a closed series goes,
 * and makes the 3D object only from a folder the engine accepts. A series
 * nobody placed comes back first; deleting one is asked twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fill, words } from '../../i18n/words';
import type { PhoneStatus } from '../../host/phoneDoors';

const phone = vi.hoisted(() => ({
  status: vi.fn(), start: vi.fn(), stop: vi.fn(), destinations: vi.fn(),
  deliver: vi.fn(), deliverToNewVault: vi.fn(), deliverToFolder: vi.fn(), discard: vi.fn(),
}));
const host = vi.hoisted(() => ({ refreshPermission: vi.fn(), list: vi.fn(), readPicture: vi.fn() }));
vi.mock('../../host/phoneDoors', async (orig) => {
  const real = await orig<typeof import('../../host/phoneDoors')>();
  return { ...real, phoneDoors: phone };
});
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: host };
});
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));

import { PhoneCapture } from './PhoneCapture';

const w = words('en');
const idle = (over: Partial<PhoneStatus> = {}): PhoneStatus => ({
  active: false, url: null, address: null, seriesId: null, count: 0, phoneSeen: false, startedAt: null, lastPhotoAt: null,
  addresses: [{ name: 'Wi-Fi', address: '192.168.1.101' }], series: [], ...over,
});
const open = (over: Partial<PhoneStatus> = {}): PhoneStatus => idle({
  active: true, url: 'https://192.168.1.101:50000/c/' + 'a'.repeat(32), address: '192.168.1.101', seriesId: 's1', startedAt: Date.now(), ...over,
});

describe('PhoneCapture', () => {
  // The host says yes unless a test says no.
  beforeEach(() => {
    host.refreshPermission.mockResolvedValue(true);
    host.list.mockResolvedValue({ objects: [] });
    host.readPicture.mockResolvedValue('data:image/jpeg;base64,AA');
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    for (const f of [...Object.values(phone), ...Object.values(host)]) f.mockReset();
  });

  it('asks for the permission again, then opens the series on the chosen network', async () => {
    host.refreshPermission.mockResolvedValue(true);
    phone.status.mockResolvedValue(idle({ addresses: [{ name: 'Wi-Fi', address: '192.168.1.101' }, { name: 'Ethernet', address: '10.0.0.5' }] }));
    phone.start.mockResolvedValue(open());
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Ethernet/ }));
    fireEvent.click(screen.getByRole('button', { name: w.phone.open }));
    await waitFor(() => expect(phone.start).toHaveBeenCalledWith('10.0.0.5', undefined, undefined));
    expect(host.refreshPermission).toHaveBeenCalledWith('phone:capture');
  });

  it('says it when the computer is on no network a phone can reach', async () => {
    phone.status.mockResolvedValue(idle({ addresses: [] }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByText(w.phone.noNetwork)).toBeInTheDocument();
  });

  it('shows the QR, the address to check and the count against the aim', async () => {
    phone.status.mockResolvedValue(open({ count: 12, phoneSeen: true }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByAltText(w.phone.scan)).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(screen.getByText('192.168.1.101')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(fill(w.phone.target, { n: 60 }))).toBeInTheDocument();
    expect(screen.getByText(w.phone.phoneHere)).toBeInTheDocument();
    expect(screen.queryByText(w.phone.noPhone)).toBeNull();
  });

  it('names the three causes when no phone came after 30 s', async () => {
    phone.status.mockResolvedValue(open({ startedAt: Date.now() - 31_000 }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByText(w.phone.noPhone)).toBeInTheDocument();
    expect(screen.getByText(w.phone.cause2)).toBeInTheDocument();
  });

  it('at Done asks nothing: the series waits in the app, and the object is made from its working folder', async () => {
    phone.status.mockResolvedValue(open({ count: 40 }));
    phone.stop.mockResolvedValue({ id: 's1', photos: 40, startedAt: null });
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<PhoneCapture w={w} gallery="objects" onCreate={onCreate} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.done }));
    phone.status.mockResolvedValue(idle({ series: [{ id: 's1', photos: 40, startedAt: null, dir: 'C:\\App\\series\\s1' }] }));
    expect(await screen.findByText(fill(w.phone.ready, { n: 40 }), { exact: false, normalizer: (t) => t.toLowerCase() })).toBeInTheDocument();
    expect(phone.destinations).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: w.phone.createObject }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('C:\\App\\series\\s1'));
    expect(phone.deliver).not.toHaveBeenCalled();
  });

  it('a series left from before comes back first, ready for 3D', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 'old', photos: 25, startedAt: null, dir: 'C:\\App\\series\\old' }] }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByRole('button', { name: w.phone.createObject })).toBeEnabled();
    expect(screen.getByRole('button', { name: w.phone.addMore })).toBeInTheDocument();
  });

  it('« Put them away » asks where, and a closed folder dialog leaves the series waiting', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 'old', photos: 25, startedAt: null, dir: 'C:\\App\\series\\old' }] }));
    phone.destinations.mockResolvedValue({ vaults: [] });
    phone.deliverToFolder.mockResolvedValue(null);
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.putAway }));
    expect(await screen.findByText(w.phone.noVault)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(w.phone.folder) }));
    await waitFor(() => expect(phone.deliverToFolder).toHaveBeenCalledWith('old'));
    expect(screen.getByText(fill(w.phone.whereTitle, { n: 25 }), { exact: false, normalizer: (t) => t.toLowerCase() })).toBeInTheDocument();
  });

  it('deletes a series only on the second click', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 'old', photos: 25, startedAt: null }] }));
    phone.destinations.mockResolvedValue({ vaults: [] });
    phone.discard.mockResolvedValue(null);
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.putAway }));
    fireEvent.click(await screen.findByRole('button', { name: w.phone.discard }));
    expect(phone.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: fill(w.phone.discardConfirm, { n: 25 }) }));
    await waitFor(() => expect(phone.discard).toHaveBeenCalledWith('old'));
  });

  it('« Add photos » opens the same series again, and the count is the total', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 's1', photos: 15, startedAt: null, dir: 'C:\\App\\series\\s1' }] }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.addMore }));
    phone.start.mockResolvedValue(open({ seriesId: 's1', count: 15 }));
    fireEvent.click(await screen.findByRole('button', { name: w.phone.open }));
    await waitFor(() => expect(phone.start).toHaveBeenCalledWith('192.168.1.101', 's1', undefined));
    phone.status.mockResolvedValue(open({ seriesId: 's1', count: 25 }));
    expect(await screen.findByText('25')).toBeInTheDocument();
    phone.stop.mockResolvedValue({ id: 's1', photos: 25, startedAt: null });
    fireEvent.click(screen.getByRole('button', { name: w.phone.done }));
    phone.status.mockResolvedValue(idle({ series: [{ id: 's1', photos: 25, startedAt: null, dir: 'C:\\App\\series\\s1' }] }));
    expect(await screen.findByText(fill(w.phone.ready, { n: 25 }), { exact: false, normalizer: (t) => t.toLowerCase() })).toBeInTheDocument();
  });

  it('opened from a job that stopped short, the next series goes on with that one', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 's9', photos: 20, startedAt: null, dir: 'C:\\App\\series\\s9' }] }));
    phone.start.mockResolvedValue(open({ seriesId: 's9', count: 20 }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} continueSeries="s9" />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.open }));
    await waitFor(() => expect(phone.start).toHaveBeenCalledWith('192.168.1.101', 's9', []));
  });

  it('while a build runs: a new series past the waiting one, and its object waits for the engine', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 'busy', photos: 37, startedAt: null, dir: 'C:\\App\\series\\busy' }] }));
    phone.start.mockResolvedValue(open({ seriesId: 'new' }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} fresh engineBusy />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.open }));
    await waitFor(() => expect(phone.start).toHaveBeenCalledWith('192.168.1.101', undefined, undefined));
    phone.status.mockResolvedValue(open({ seriesId: 'new', count: 30 }));
    phone.stop.mockResolvedValue({ id: 'new', photos: 30, startedAt: null });
    fireEvent.click(await screen.findByRole('button', { name: w.phone.done }));
    phone.status.mockResolvedValue(idle({ series: [{ id: 'busy', photos: 37, startedAt: null, dir: 'C:\\b' }, { id: 'new', photos: 30, startedAt: null, dir: 'C:\\n' }] }));
    expect(await screen.findByText(w.phone.engineBusy)).toBeInTheDocument();
    expect(screen.getByText(fill(w.phone.ready, { n: 30 }), { exact: false, normalizer: (t) => t.toLowerCase() })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.phone.createObject })).toBeDisabled();
  });

  it('a new series is always one press away, beside a waiting one, and never goes on with it', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 'old', photos: 25, startedAt: null, dir: 'C:\\o' }] }));
    phone.start.mockResolvedValue(open({ seriesId: 'new' }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByRole('button', { name: w.phone.createObject })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.phone.open }));
    await waitFor(() => expect(phone.start).toHaveBeenCalledWith('192.168.1.101', undefined, undefined));
  });

  it('a waiting series already made into 3D is not offered first: dated, marked, shown when picked (26/10)', async () => {
    const dir = 'C:\\App\\series\\2026-10-24_18-25-57';
    phone.status.mockResolvedValue(idle({ series: [{ id: '2026-10-24_18-25-57', photos: 76, startedAt: null, dir }] }));
    host.list.mockResolvedValue({ objects: [{ id: '20261026-140540-2026-10-24_18-25-57', createdAt: '2026-10-26T18:05:40.255Z' }] });
    render(<PhoneCapture w={w} lang="en" gallery="places" onCreate={vi.fn()} />);
    const date = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(2026, 9, 24, 18, 25, 57));
    const card = await screen.findByRole('radio', { name: (n) => n.includes(fill(w.phone.seriesOf, { date })) });
    await waitFor(() => expect(card).toHaveTextContent(w.phone.madeOn.split(' ·')[0]!));
    expect(card).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: w.phone.createPlace })).toBeNull();
    fireEvent.click(card);
    expect(await screen.findByRole('button', { name: w.phone.createPlace })).toBeEnabled();
    // Its photos are shown, read from its folder.
    await waitFor(() => expect(host.readPicture).toHaveBeenCalledWith(`${dir}\\001.jpg`));
  });

  it('opened from a placing that left photos out, the phone is told their sides to take again', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 's9', photos: 20, startedAt: null, dir: 'C:\\App\\series\\s9' }] }));
    phone.start.mockResolvedValue(open({ seriesId: 's9', count: 20 }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} continueSeries="s9" redo={['004.jpg', '011.jpg']} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.open }));
    await waitFor(() => expect(phone.start).toHaveBeenCalledWith('192.168.1.101', 's9', ['004.jpg', '011.jpg']));
  });

  it('refuses to make 3D from fewer photos than the engine takes', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 's', photos: 8, startedAt: null, dir: 'C:\\App\\series\\s' }] }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByText(fill(w.phone.tooFew, { min: 20, n: 8 }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.phone.createObject })).toBeDisabled();
  });

  it('a refused permission is asked again by Retry, not only re-read', async () => {
    host.refreshPermission.mockResolvedValue(false);
    phone.status.mockResolvedValue(idle());
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByText(w.phone.refused)).toBeInTheDocument();
    expect(host.refreshPermission).toHaveBeenCalledTimes(1);
    host.refreshPermission.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: w.create.retry }));
    expect(await screen.findByRole('button', { name: w.phone.open })).toBeInTheDocument();
    expect(host.refreshPermission).toHaveBeenCalledTimes(2);
  });

  it('a no to the permission asks nothing more: no read behind it, every second (verifier T1)', async () => {
    host.refreshPermission.mockResolvedValue(false);
    phone.status.mockResolvedValue(idle());
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByText(w.phone.refused)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 2300));
    expect(phone.status).not.toHaveBeenCalled();
    expect(host.refreshPermission).toHaveBeenCalledTimes(1);
  });

  it('a status refused by the host stops the reads too', async () => {
    host.refreshPermission.mockResolvedValue(true);
    phone.status.mockRejectedValue(new Error('Unauthorized: phone:capture'));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByText(w.phone.refused)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 2300));
    expect(phone.status).toHaveBeenCalledTimes(1);
  });

  it('on Windows says the firewall may ask, before the series opens', async () => {
    phone.status.mockResolvedValue(idle());
    const r = render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} platform="win32" />);
    expect(await screen.findByText(w.phone.firewall)).toBeInTheDocument();
    r.unmount();
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} platform="darwin" />);
    await screen.findByRole('button', { name: w.phone.open });
    expect(screen.queryByText(w.phone.firewall)).toBeNull();
  });

  it('marks a protected vault, and an armed delete disarms itself after 6 s', async () => {
    phone.status.mockResolvedValue(idle({ series: [{ id: 'old', photos: 25, startedAt: null }] }));
    phone.destinations.mockResolvedValue({ vaults: [{ workspaceId: 'j', name: 'Journal', protection: 'MAXIMUM' }] });
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.putAway }));
    expect(await screen.findByText(w.phone.protectedVault)).toBeInTheDocument();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(screen.getByRole('button', { name: w.phone.discard }));
      expect(screen.getByRole('button', { name: fill(w.phone.discardConfirm, { n: 25 }) })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(6100); });
      expect(screen.getByRole('button', { name: w.phone.discard })).toBeInTheDocument();
      expect(phone.discard).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the PC's certificate before the series' QR, and remembers it was installed (doc 176 §22)", async () => {
    const caUrl = 'http://192.168.1.101:50001/mnemosyne-os.crt';
    phone.status.mockResolvedValue(open({ caUrl }));
    const r = render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByAltText(w.phone.certTitle)).toBeInTheDocument();
    expect(screen.queryByAltText(w.phone.scan)).toBeNull();
    expect(screen.getByText(w.phone.certI3)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: w.phone.certInstalled }));
    expect(await screen.findByAltText(w.phone.scan)).toBeInTheDocument();
    // It can be shown again on this screen.
    fireEvent.click(screen.getByRole('button', { name: w.phone.certShow }));
    expect(await screen.findByAltText(w.phone.certTitle)).toBeInTheDocument();
    r.unmount();
    // Said installed: the next series goes straight to its QR.
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByAltText(w.phone.scan)).toBeInTheDocument();
    expect(screen.queryByAltText(w.phone.certTitle)).toBeNull();
  });

  it('« Skip » shows the series QR without remembering anything', async () => {
    phone.status.mockResolvedValue(open({ caUrl: 'http://192.168.1.101:50001/mnemosyne-os.crt' }));
    const r = render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.certSkip }));
    expect(await screen.findByAltText(w.phone.scan)).toBeInTheDocument();
    r.unmount();
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByAltText(w.phone.certTitle)).toBeInTheDocument();
  });

  it('a phone that opened the page with no warning trusts the PC: no certificate, no warning, and it is remembered', async () => {
    phone.status.mockResolvedValue(open({ caUrl: 'http://192.168.1.101:50001/mnemosyne-os.crt', phoneSeen: true, phoneTrusted: true }));
    const r = render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByText(w.phone.certTrusted)).toBeInTheDocument();
    expect(screen.getByAltText(w.phone.scan)).toBeInTheDocument();
    expect(screen.queryByText(w.phone.warning)).toBeNull();
    r.unmount();
    phone.status.mockResolvedValue(open({ caUrl: 'http://192.168.1.101:50001/mnemosyne-os.crt' }));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    expect(await screen.findByAltText(w.phone.scan)).toBeInTheDocument();
  });

  it("says the host's refusal in its own words", async () => {
    phone.status.mockResolvedValue(idle());
    phone.start.mockRejectedValue(new Error('LISTEN_FAILED'));
    render(<PhoneCapture w={w} gallery="objects" onCreate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: w.phone.open }));
    expect(await screen.findByText(w.phone.errors.LISTEN_FAILED!)).toBeInTheDocument();
  });
});
