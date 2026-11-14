/**
 * FirewallCheck — before the QR, whether Windows lets a phone reach this PC
 * on the chosen network, and the button that lets it (Mnemosyne OS doc 176).
 *
 * A PC on a phone's hotspot is on a network Windows calls Public: with no
 * rule for it, the phone's page never loads and nothing on the PC says why.
 * The host reads the firewall's verdict; when it is closed, « Allow the
 * phone » asks Windows for an administrator's yes and reads again. An open
 * firewall shows nothing. An unknown verdict (an older host, a third-party
 * firewall) keeps the sentence that was there before.
 *
 * Windows only. A VPN up is said too: it can keep the phone out on its own.
 *
 * @module features/phone/FirewallCheck
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { phoneDoors, type FirewallView } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { Retry } from '../../ui/Icon';

type Read = { kind: 'reading' } | { kind: 'done'; view: FirewallView } | { kind: 'failed' };

/** Before the QR: the firewall's verdict for `address`, and « Allow the phone » when it is closed. Windows only. */
export function FirewallCheck({ w, address, platform }: { w: Dict; address: string; platform: string | null }) {
  const p = w.phone;
  const [read, setRead] = useState<Read>({ kind: 'reading' });
  const [allowing, setAllowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const asked = useRef(0);
  const windows = platform === 'win32';

  const ask = useCallback(async () => {
    const n = ++asked.current;
    setRead({ kind: 'reading' });
    try {
      const view = await phoneDoors.firewall(address);
      if (alive.current && n === asked.current) setRead({ kind: 'done', view });
    } catch (err) {
      // An older host has no such action: the sentence from before is shown.
      console.warn('[lab-3d] the firewall could not be read:', err);
      if (alive.current && n === asked.current) setRead({ kind: 'failed' });
    }
  }, [address]);

  useEffect(() => {
    alive.current = true;
    if (windows) void ask();
    return () => { alive.current = false; };
  }, [windows, ask]);

  if (!windows) return null;

  const allow = async () => {
    setError(null);
    setAllowing(true);
    try {
      await phoneDoors.allowFirewall();
      if (alive.current) await ask();
    } catch (err) {
      console.warn('[lab-3d] the firewall could not be opened:', err);
      const detail = err instanceof Error ? err.message : String(err);
      if (alive.current) setError(detail.includes('ELEVATION_REFUSED') ? p.fwRefused : fill(p.fwFailed, { detail }));
    } finally {
      if (alive.current) setAllowing(false);
    }
  };

  if (read.kind === 'reading') return <div className="create-why" role="status">{p.fwReading}</div>;
  if (read.kind === 'failed') return <div className="create-why">{p.firewall}</div>;

  const { state, network, vpn } = read.view;
  const vpnLine = vpn.length > 0 && <div className="create-why">{fill(p.fwVpn, { names: vpn.join(', ') })}</div>;
  if (state === 'open') return vpnLine || null;
  if (state === 'unknown') return <>{<div className="create-why">{p.firewall}</div>}{vpnLine}</>;
  return (
    <div className="opt-group fw-closed">
      <div className="create-why" role="alert">{fill(p.fwClosed, { network: (network && p.fwNet[network]) || network || '' })}</div>
      <div className="phone-actions">
        <button className="primary" disabled={allowing} onClick={() => void allow()}>{allowing ? p.fwAllowing : p.fwAllow}</button>
        <button disabled={allowing} onClick={() => void ask()} aria-label={w.create.retry} title={w.create.retry}><Retry size={16} /></button>
      </div>
      <span className="phone-target">{p.fwAllowHint}</span>
      {error && <div className="error-line" role="alert">{error}</div>}
      {vpnLine}
    </div>
  );
}
