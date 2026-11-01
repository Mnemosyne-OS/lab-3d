/**
 * PhoneCapture — photographing with the phone, inside a gallery's Create view
 * (Mnemosyne OS doc 176).
 *
 * The series stays in the app's working folder until the 3D work is done
 * (Tony, 24/10: « déclarer un dossier sert à rien »): nothing is asked at
 * Done. Screens, read from the host's status (polled each second while shown):
 *  - start: the network to open the series on, and the button that shows the QR;
 *  - open: the QR code, the address to check, what the phone's warning says
 *    and how to pass it, the counter against the aim, and « Done »;
 *  - ready: the photos taken, and the 3D object (or place) made from the
 *    working folder, more photos into the same series, or putting it away
 *    without 3D;
 *  - place: where the series goes (PlaceSeries), when put away without 3D;
 *    after a 3D object, the Create view asks it (SeriesAfterJob).
 * A series nobody placed comes back here first, across restarts.
 *
 * @module features/phone/PhoneCapture
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { doors, isPermissionRefusal } from '../../host/doors';
import { phoneDoors, PHONE_PERMISSION, type PhoneSeries, type PhoneStatus, type Placed } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { HudPanel } from '../../ui/HudPanel';
import { Notice } from '../../ui/Notice';
import { Check, Phone, Retry } from '../../ui/Icon';
import { describeError } from '../create/createModel';
import type { Gallery } from '../objects/libraryModel';
import type { ObjectEntry } from '../../core/model';
import { PhotoTile } from '../create/UnplacedPhotos';
import { seriesPhotos } from '../painting/paintingModel';
import { MAX_PHOTOS, MIN_PHOTOS, createVerdict, firstShown, madeFrom, sampleIndexes, seriesWhen, showNoPhoneHint, targetFor } from './phoneModel';
import { PlaceSeries } from './PlaceSeries';
import { usePhoneCert } from './phoneCert';

const POLL_MS = 1000;
/** The photos of a waiting series shown on the right, spread over it. */
const SHOWN_PHOTOS = 12;

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; refused: boolean; detail: string }
  | { state: 'ready'; status: PhoneStatus };

export function PhoneCapture({ w, lang = 'en', gallery, onCreate, continueSeries = null, redo = [], platform = null, fresh: freshFirst = false, engineBusy = false }: {
  w: Dict;
  /** For the dates of the waiting series. */
  lang?: string;
  gallery: Gallery;
  /** The host's OS (`win32`…): on Windows the firewall asks at the first series, and the screen says so first. */
  platform?: string | null;
  /** A waiting series to go on with from the start (a 3D job that stopped short), instead of a new one. */
  continueSeries?: string | null;
  /** Photos of `continueSeries` COLMAP could not place: their sides show in red on the phone. */
  redo?: readonly string[];
  /** Open on a new series even when one waits (photos taken while a build runs). */
  fresh?: boolean;
  /** A build runs: a series can be taken, its 3D object waits for the engine. */
  engineBusy?: boolean;
  /** Make the 3D object (or place) from this folder of photos, with the form's choices. */
  onCreate: (photosDir: string) => Promise<void>;
}) {
  const p = w.phone;
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [address, setAddress] = useState<string | null>(null);
  // The series just closed at Done, until the status lists it with its folder.
  const [ready, setReady] = useState<PhoneSeries | null>(null);
  // The person chose to put the series away without 3D.
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  // « Add photos »: the waiting series the next start goes on with.
  const [continuing, setContinuing] = useState<string | null>(continueSeries);
  // « New series »: past the waiting one, to the QR.
  const [fresh, setFresh] = useState(freshFirst);
  // The waiting series the person picked; undefined: the screen's own choice (firstShown).
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  // The library, to tell a waiting series already made into 3D.
  const [objects, setObjects] = useState<ObjectEntry[]>([]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [lang]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);
  // A refused permission stops every read: each read behind it would open the host's dialog again (verifier T1).
  const refused = useRef(false);

  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => doors.list()).then(
      (res) => { if (live) setObjects(Array.isArray(res?.objects) ? res.objects : []); },
      // Without the library every waiting series is offered as not made yet: nothing worse than before.
      (err: unknown) => console.warn('[lab-3d] library not read for the waiting series:', err),
    );
    return () => { live = false; };
  }, []);

  const say = useCallback((err: unknown) => {
    const text = err instanceof Error ? err.message : String(err);
    setError(isPermissionRefusal(err) ? p.refused : describeError(text, p.errors));
  }, [p]);

  const read = useCallback(async () => {
    try {
      const status = await phoneDoors.status();
      if (!alive.current) return;
      setLoaded({ state: 'ready', status });
      setNow(Date.now());
    } catch (err) {
      if (!alive.current) return;
      console.warn('[lab-3d] phone capture status unreadable:', err);
      if (isPermissionRefusal(err)) refused.current = true;
      setLoaded({ state: 'error', refused: isPermissionRefusal(err), detail: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // The permission may have been added to the manifest after the host read it,
  // or refused in the host's dialog: asked again at the start and at each retry.
  // Answers false only on a no: a host that cannot refresh lets the read find out.
  const askPermission = useCallback(async (): Promise<boolean> => {
    try {
      return await doors.refreshPermission(PHONE_PERMISSION);
    } catch (err) {
      console.warn('[lab-3d] phone permission not refreshed:', err);
      return true;
    }
  }, []);

  // Ask, then read; a no is said once and nothing more is asked until Retry.
  const askThenRead = useCallback(async () => {
    refused.current = false;
    if (!(await askPermission())) {
      if (!alive.current) return;
      refused.current = true;
      setLoaded({ state: 'error', refused: true, detail: PHONE_PERMISSION });
      return;
    }
    if (alive.current) await read();
  }, [askPermission, read]);

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
      // Leaving the screen closes an open series: its photos wait, and come back first next time.
      void phoneDoors.status()
        .then((st) => (st.active ? phoneDoors.stop() : null))
        .catch((err: unknown) => console.warn('[lab-3d] open series not closed on leaving:', err));
    };
  }, [askThenRead, read]);

  // The PC's certificate, before the series' QR (doc 176 §22).
  const cert = usePhoneCert(loaded.state === 'ready' ? loaded.status : null);

  const run = async (what: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await read();
    } catch (err) {
      console.warn(`[lab-3d] phone capture ${what} failed:`, err);
      if (alive.current) say(err);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (loaded.state === 'loading') return <Notice scanning>{p.title}</Notice>;
  if (loaded.state === 'error') {
    return (
      <Notice>
        <div className="error-line" role="alert">{loaded.refused ? p.refused : fill(p.unreadable, { detail: loaded.detail })}</div>
        <button onClick={() => void (loaded.refused ? askThenRead() : read())}><Retry size={16} />{w.create.retry}</button>
      </Notice>
    );
  }

  const st = loaded.status;
  const errorLine = error && <div className="error-line" role="alert">{error}</div>;
  const when = (d: Date | null): string => (d ? dateFormat.format(d) : '—');
  const madeOf = (id: string) => madeFrom(id, objects);

  if (placed) {
    const verdict = createVerdict(placed.photos);
    return (
      <div className="pane phone">
        <HudPanel title={fill(p.placed, { n: placed.photos })}>
          <div className="phone-dir">{placed.dir}</div>
          {verdict === 'tooFew' && <div className="create-why">{fill(p.tooFew, { min: MIN_PHOTOS, n: placed.photos })}</div>}
          {verdict === 'tooMany' && <div className="create-why">{fill(p.tooMany, { max: MAX_PHOTOS, n: placed.photos })}</div>}
          <div className="phone-actions">
            <button className="primary" disabled={busy || verdict !== 'ok'}
              onClick={() => void run('create', () => onCreate(placed.dir))}>
              {gallery === 'places' ? p.createPlace : p.createObject}
            </button>
            <button disabled={busy} onClick={() => setPlaced(null)}>{p.later}</button>
          </div>
          {errorLine}
        </HudPanel>
      </div>
    );
  }

  if (st.active && st.url) {
    // The counter and what to do on the left, the QR code to scan on the right: the certificate's first.
    return (
      <div className="pane phone split">
        <HudPanel className="split-opts">
          <div className="phone-side">
            <div className="phone-count"><strong>{st.count}</strong> <span>{p.count}</span></div>
            <div className="phone-target">{fill(p.target, { n: targetFor(gallery) })}</div>
            <div className={st.phoneSeen ? 'phone-seen on' : 'phone-seen'}>{st.phoneSeen ? p.phoneHere : p.waitingPhone}</div>
            <ScanSteps w={w} certFirst={cert.certFirst} trusted={cert.trusted} />
            <div className="phone-address-label">{p.address}</div>
            <div className="phone-address">{st.address}</div>
          </div>
          {showNoPhoneHint(st, now) && (
            <div className="create-why phone-causes" role="status">
              <span>{p.noPhone}</span>
              <ol><li>{p.cause1}</li><li>{p.cause2}</li><li>{p.cause3}</li></ol>
            </div>
          )}
          <div className="phone-actions">
            <button className="primary" disabled={busy} onClick={() => void run('stop', async () => {
              const closed = await phoneDoors.stop();
              if (!alive.current) return;
              setContinuing(null);
              setFresh(false);
              setChosen(undefined);
              // Nothing is asked here: the series waits in the app until the 3D work is done.
              if (closed && closed.photos > 0) setReady(closed);
            })}>{p.done}</button>
            {cert.canShow && <button disabled={busy} onClick={cert.show}>{p.certShow}</button>}
          </div>
          {errorLine}
        </HudPanel>
        <div className="split-visual">
          {cert.certFirst ? <CertQr w={w} url={st.caUrl!} onDone={cert.done} /> : <QrImage url={st.url} label={p.scan} />}
        </div>
      </div>
    );
  }

  // The series shown on the right: the one picked, else the one just closed or
  // the newest not made into 3D yet. A new series asked shows none of the old ones.
  const shownId = chosen !== undefined ? chosen : firstShown(st.series, (id) => madeOf(id) !== null, ready?.id ?? null, fresh || !!continuing);
  const shown = st.series.find((x) => x.id === shownId) ?? (ready && ready.id === shownId ? ready : null);
  if (shown && placing) {
    return (
      <PlaceSeries w={w} gallery={gallery} series={shown} busy={busy} error={error}
        onPlace={(how) => void run('place', async () => {
          const res = await how();
          if (!alive.current) return;
          // A closed dialog places nothing: the series still waits.
          if (res) { setPlacing(false); setReady(null); setChosen(undefined); setPlaced(res); }
        })}
        onDiscard={() => void run('discard', async () => {
          await phoneDoors.discard(shown.id);
          if (alive.current) { setPlacing(false); setReady(null); setChosen(undefined); }
        })} />
    );
  }

  const chosenAddress = address && st.addresses.some((a) => a.address === address) ? address : st.addresses[0]?.address ?? null;
  const going = continuing ? st.series.find((x) => x.id === continuing) ?? null : null;
  const opts = (
    <HudPanel className="split-opts">
      {chosenAddress === null ? (
        <div className="opt-group">
          <div className="drop-title">{p.noNetwork}</div>
          <div className="phone-actions"><button onClick={() => void read()}><Retry size={16} />{w.create.retry}</button></div>
        </div>
      ) : (
        <>
          {st.addresses.length > 1 && (
            <div className="opt-group" role="radiogroup" aria-label={p.pickAddress}>
              <span className="opt-label">{p.pickAddress}</span>
              <div className="choices">
                {st.addresses.map((a) => (
                  <button key={a.address} role="radio" aria-checked={a.address === chosenAddress}
                    className={a.address === chosenAddress ? 'choice chosen' : 'choice'} onClick={() => setAddress(a.address)}>
                    <strong>{a.name}</strong><span>{a.address}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {platform === 'win32' && <div className="create-why">{p.firewall}</div>}
          <div className="opt-group">
            <span className="opt-label">{continuing ? p.addMore : p.newSeries}</span>
            {going && <span className="phone-target">{fill(p.seriesOf, { date: when(seriesWhen(going)) })}</span>}
            <div className="phone-actions">
              <button className={shown && !continuing ? undefined : 'primary'} disabled={busy}
                onClick={() => void run('start', async () => { await phoneDoors.start(chosenAddress, continuing ?? undefined, continuing && continuing === continueSeries ? redo : undefined); })}>
                <Phone size={16} />{busy ? p.opening : p.open}
              </button>
              {continuing && <button disabled={busy} onClick={() => { setError(null); setContinuing(null); setFresh(true); }}>{p.newSeries}</button>}
            </div>
          </div>
        </>
      )}
      {st.series.length > 0 && (
        <div className="opt-group" role="radiogroup" aria-label={p.waiting}>
          <span className="opt-label">{p.waiting}</span>
          <div className="series-list">
            {[...st.series].reverse().map((x) => {
              const made = madeOf(x.id);
              const on = x.id === shownId;
              return (
                <button key={x.id} role="radio" aria-checked={on} className={on ? 'choice series-card chosen' : 'choice series-card'}
                  onClick={() => { setError(null); setContinuing(null); setChosen(x.id); }}>
                  {on && <span className="choice-check" aria-hidden><Check size={12} /></span>}
                  <strong>{fill(p.seriesOf, { date: when(seriesWhen(x)) })}</strong>
                  <span>{fill(p.photosN, { n: x.photos })}</span>
                  {made && <span className="series-made">{fill(p.madeOn, { date: when(made.createdAt ? new Date(made.createdAt) : null) })}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {errorLine}
    </HudPanel>
  );

  let visual: ReactNode;
  if (shown) {
    const verdict = createVerdict(shown.photos);
    const made = madeOf(shown.id);
    const photos = shown.dir ? seriesPhotos(shown.dir, shown.photos) : [];
    visual = (
      <HudPanel title={fill(p.ready, { n: shown.photos })} aside={<span className="phone-target">{when(seriesWhen(shown))}</span>}>
        {made && <div className="create-why series-made">{fill(p.madeOn, { date: when(made.createdAt ? new Date(made.createdAt) : null) })}</div>}
        {verdict === 'tooFew' && <div className="create-why">{fill(p.tooFew, { min: MIN_PHOTOS, n: shown.photos })}</div>}
        {verdict === 'tooMany' && <div className="create-why">{fill(p.tooMany, { max: MAX_PHOTOS, n: shown.photos })}</div>}
        {engineBusy && <div className="create-why">{p.engineBusy}</div>}
        <div className="phone-actions">
          <button className="primary" disabled={busy || verdict !== 'ok' || !shown.dir || engineBusy}
            onClick={() => void run('create', () => onCreate(shown.dir!))}>
            {gallery === 'places' ? p.createPlace : p.createObject}
          </button>
          <button disabled={busy} onClick={() => { setError(null); setContinuing(shown.id); }}>{p.addMore}</button>
          <button disabled={busy} onClick={() => setPlacing(true)}>{p.putAway}</button>
        </div>
        {photos.length > 0 && (
          <div className="frame-grid series-photos">
            {sampleIndexes(photos.length, SHOWN_PHOTOS).map((i) => <PhotoTile key={photos[i]} path={photos[i]!} />)}
          </div>
        )}
      </HudPanel>
    );
  } else {
    visual = <div className="split-empty" aria-hidden><Phone size={72} /></div>;
  }

  return (
    <div className="pane phone split">
      {opts}
      <div className="split-visual">{visual}</div>
    </div>
  );
}

/** What to do with the QR shown: install the PC's certificate first, or scan and pass the warning (none when the phone trusts the PC). */
export function ScanSteps({ w, certFirst, trusted }: { w: Dict; certFirst: boolean; trusted: boolean }) {
  const p = w.phone;
  if (certFirst) {
    return (
      <>
        <p>{p.certWhy}</p>
        <span className="opt-label">iPhone</span>
        <ol className="phone-howto"><li>{p.certI1}</li><li>{p.certI2}</li><li>{p.certI3}</li></ol>
        <span className="opt-label">Android</span>
        <ol className="phone-howto"><li>{p.certA1}</li><li>{p.certA2}</li></ol>
      </>
    );
  }
  return (
    <>
      {trusted && <div className="phone-seen on">{p.certTrusted}</div>}
      <p>{p.scan}</p>
      {!trusted && <p>{p.warning}</p>}
      {!trusted && <ul className="phone-howto"><li>{p.warnIphone}</li><li>{p.warnAndroid}</li></ul>}
    </>
  );
}

/** The PC's certificate to scan, then « installed » (remembered) or « skip » (this screen only). */
export function CertQr({ w, url, onDone }: { w: Dict; url: string; onDone: (installed: boolean) => void }) {
  const p = w.phone;
  return (
    // Plain, not a panel: it sits in a panel on the paintings' screen, and glass never goes on glass.
    <div className="cert-qr">
      <span className="opt-label">{p.certTitle}</span>
      <QrImage url={url} label={p.certTitle} />
      <div className="phone-actions">
        <button className="primary" onClick={() => onDone(true)}>{p.certInstalled}</button>
        <button onClick={() => onDone(false)}>{p.certSkip}</button>
      </div>
    </div>
  );
}

/** The QR code of the series' address, drawn here: nothing leaves the app to draw it. */
export function QrImage({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 300, errorCorrectionLevel: 'M', color: { dark: '#03060b', light: '#ffffff' } })
      .then((data) => { if (live) setSrc(data); })
      .catch((err: unknown) => console.warn('[lab-3d] QR code not drawn:', err));
    return () => { live = false; };
  }, [url]);
  return <div className="phone-qr">{src ? <img src={src} alt={label} width={300} height={300} /> : <span className="phone-qr-wait" aria-hidden />}</div>;
}
