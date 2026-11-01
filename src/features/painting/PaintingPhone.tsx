/**
 * PaintingPhone — the photo of a painting taken with the phone (doc 166 §15.1),
 * through the host's phone capture (Mnemosyne OS doc 176): the QR code, the
 * counter, and Done. One photo is enough; the series waits in the app's
 * working folder, and the Paintings tab shows its photos at once.
 *
 * Leaving the screen closes an open series: its photos wait, as in the
 * Create view. A refused permission stops every read (doc 176, verifier T1).
 *
 * @module features/painting/PaintingPhone
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { doors, isPermissionRefusal } from '../../host/doors';
import { phoneDoors, PHONE_PERMISSION, type PhoneSeries, type PhoneStatus } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { HudPanel } from '../../ui/HudPanel';
import { Notice } from '../../ui/Notice';
import { Retry } from '../../ui/Icon';
import { describeError } from '../create/createModel';
import { CertQr, QrImage, ScanSteps } from '../phone/PhoneCapture';
import { usePhoneCert } from '../phone/phoneCert';
import { showNoPhoneHint } from '../phone/phoneModel';

const POLL_MS = 1000;

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; refused: boolean; detail: string }
  | { state: 'ready'; status: PhoneStatus };

export function PaintingPhone({ w, platform = null, onTaken, onCancel }: {
  w: Dict;
  /** The host's OS: on Windows the firewall asks at the first series, and the screen says so. */
  platform?: string | null;
  /** The series closed at Done, with the folder its photos wait in. */
  onTaken: (series: PhoneSeries & { dir: string }) => void;
  onCancel: () => void;
}) {
  const p = w.phone;
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The PC's certificate, before the series' QR (doc 176 §22).
  const cert = usePhoneCert(loaded.state === 'ready' ? loaded.status : null);
  const alive = useRef(true);
  const refused = useRef(false);

  const read = useCallback(async (): Promise<PhoneStatus | null> => {
    try {
      const status = await phoneDoors.status();
      if (!alive.current) return null;
      setLoaded({ state: 'ready', status });
      setNow(Date.now());
      return status;
    } catch (err) {
      if (!alive.current) return null;
      console.warn('[lab-3d] phone capture status unreadable:', err);
      if (isPermissionRefusal(err)) refused.current = true;
      setLoaded({ state: 'error', refused: isPermissionRefusal(err), detail: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  // The permission may have been added after the host read the manifest: asked first, and at each retry.
  const askThenRead = useCallback(async () => {
    refused.current = false;
    let granted = true;
    try { granted = await doors.refreshPermission(PHONE_PERMISSION); }
    catch (err) { console.warn('[lab-3d] phone permission not refreshed:', err); }
    if (!alive.current) return;
    if (!granted) {
      refused.current = true;
      setLoaded({ state: 'error', refused: true, detail: PHONE_PERMISSION });
      return;
    }
    await read();
  }, [read]);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      await askThenRead();
      if (alive.current) timer = setInterval(() => { if (!refused.current) void read(); }, POLL_MS);
    })();
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
      if (refused.current) return;
      void phoneDoors.status()
        .then((st) => (st.active ? phoneDoors.stop() : null))
        .catch((err: unknown) => console.warn('[lab-3d] open series not closed on leaving:', err));
    };
  }, [askThenRead, read]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.warn(`[lab-3d] painting phone ${what} failed:`, err);
      if (alive.current) setError(isPermissionRefusal(err) ? p.refused : describeError(err instanceof Error ? err.message : String(err), p.errors));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  // Done: the series closes, then the status lists it with the folder its photos wait in.
  const done = () => run('stop', async () => {
    const closed = await phoneDoors.stop();
    if (!closed || closed.photos === 0) { await read(); return; }
    const st = await read();
    const listed = st?.series.find((s) => s.id === closed.id);
    if (!listed?.dir) throw new Error('NO_SUCH_SERIES');
    onTaken({ ...listed, dir: listed.dir });
  });

  const cancel = <button disabled={busy} onClick={onCancel}>{w.painting.back}</button>;

  if (loaded.state === 'loading') return <Notice scanning>{w.painting.phoneTitle}</Notice>;
  if (loaded.state === 'error') {
    return (
      <Notice>
        <div className="error-line" role="alert">{loaded.refused ? p.refused : fill(p.unreadable, { detail: loaded.detail })}</div>
        <div className="phone-actions">
          <button onClick={() => void (loaded.refused ? askThenRead() : read())}><Retry size={16} />{w.create.retry}</button>
          {cancel}
        </div>
      </Notice>
    );
  }

  const st = loaded.status;
  const errorLine = error && <div className="error-line" role="alert">{error}</div>;

  if (st.active && st.url) {
    return (
      <div className="pane phone">
        <HudPanel title={w.painting.phoneTitle}>
          <div className="phone-grid">
            {cert.certFirst ? <CertQr w={w} url={st.caUrl!} onDone={cert.done} /> : <QrImage url={st.url} label={p.scan} />}
            <div className="phone-side">
              <div className="phone-count"><strong>{st.count}</strong> <span>{p.count}</span></div>
              <div className="phone-target">{w.painting.phoneHint}</div>
              <div className={st.phoneSeen ? 'phone-seen on' : 'phone-seen'}>{st.phoneSeen ? p.phoneHere : p.waitingPhone}</div>
              <ScanSteps w={w} certFirst={cert.certFirst} trusted={cert.trusted} />
              <div className="phone-address-label">{p.address}</div>
              <div className="phone-address">{st.address}</div>
            </div>
          </div>
          {showNoPhoneHint(st, now) && (
            <div className="create-why phone-causes" role="status">
              <span>{p.noPhone}</span>
              <ol><li>{p.cause1}</li><li>{p.cause2}</li><li>{p.cause3}</li></ol>
            </div>
          )}
          <div className="phone-actions">
            <button className="primary" disabled={busy || st.count === 0} onClick={() => void done()}>{p.done}</button>
            {cert.canShow && <button disabled={busy} onClick={cert.show}>{p.certShow}</button>}
            {cancel}
          </div>
          {errorLine}
        </HudPanel>
      </div>
    );
  }

  if (st.addresses.length === 0) {
    return (
      <Notice>
        <div className="drop-title">{p.noNetwork}</div>
        <div className="phone-actions">
          <button onClick={() => void read()}><Retry size={16} />{w.create.retry}</button>
          {cancel}
        </div>
      </Notice>
    );
  }

  const chosen = address && st.addresses.some((a) => a.address === address) ? address : st.addresses[0]!.address;
  return (
    <div className="pane phone">
      <HudPanel title={w.painting.phoneTitle}>
        <p className="decor-note">{w.painting.phoneHint}</p>
        {st.addresses.length > 1 && (
          <div className="opt-group" role="radiogroup" aria-label={p.pickAddress}>
            <span className="opt-label">{p.pickAddress}</span>
            <div className="choices">
              {st.addresses.map((a) => (
                <button key={a.address} role="radio" aria-checked={a.address === chosen}
                  className={a.address === chosen ? 'choice chosen' : 'choice'} onClick={() => setAddress(a.address)}>
                  <strong>{a.name}</strong><span>{a.address}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {platform === 'win32' && <div className="create-why">{p.firewall}</div>}
        <div className="phone-actions">
          <button className="primary" disabled={busy} onClick={() => void run('start', async () => { await phoneDoors.start(chosen); })}>
            {busy ? p.opening : p.open}
          </button>
          {cancel}
        </div>
        {errorLine}
      </HudPanel>
    </div>
  );
}
