/**
 * SeriesPhotos — every photo of a phone series, and the bad ones picked to
 * go to the bin (13/11: all of them shown, and those known to be bad deleted
 * before making the 3D).
 *
 * A series holds hundreds of photos: a tile reads its picture only when it
 * comes near the screen, and keeps a small copy of it, never the photo's
 * full data. A click picks a tile; the bar under the grid sends the picked
 * ones to the bin after one question. A series already used by a day cannot
 * lose photos here: its moments keep the photos' names.
 *
 * @module features/phone/SeriesPhotos
 */
import { useEffect, useRef, useState } from 'react';
import { doors } from '../../host/doors';
import { phoneDoors } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { Check } from '../../ui/Icon';

/** The longest side of a tile's small copy, in pixels. */
const THUMB_PX = 320;
/** A photo's decode never waits longer than this. */
const DECODE_MS = 15_000;

/** At most this many photos read at once: a fast scroll through 270 photos would ask them all together. */
const READS_AT_ONCE = 4;
let reading = 0;
const waiting: Array<() => void> = [];
/** One photo read through the queue. */
async function queued<T>(f: () => Promise<T>): Promise<T> {
  if (reading >= READS_AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  reading++;
  try {
    return await f();
  } finally {
    reading--;
    waiting.shift()?.();
  }
}

/** A small copy of a picture, drawn once; the original when no canvas can draw it (a test, an old engine). */
async function thumbOf(dataUrl: string): Promise<string> {
  try {
    const img = new Image();
    img.src = dataUrl;
    // A decode that never answers would leave the tile waiting for ever (rule 9).
    await Promise.race([img.decode(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DECODE_TIMEOUT')), DECODE_MS))]);
    const k = Math.min(1, THUMB_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  } catch (err) {
    console.warn('[lab-3d] series photo kept at full size (no small copy):', err);
    return dataUrl;
  }
}

function Tile({ path, chosen, locked, onToggle }: { path: string; chosen: boolean; locked: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let live = true;
    queued(() => doors.readPicture(path).then(thumbOf))
      .then((u) => { if (live) setUrl(u); })
      .catch((err: unknown) => {
        console.warn('[lab-3d] series photo not read:', err);
        if (live) setFailed(true);
      });
    return () => { live = false; };
  }, [near, path]);
  const name = path.split(/[\\/]/).pop() ?? path;
  return (
    <button ref={ref} type="button" className={`frame${url ? ' in' : ''}${failed ? ' failed' : ''}${chosen ? ' chosen' : ''}`}
      title={name} aria-label={name} aria-pressed={chosen} disabled={locked} onClick={onToggle}>
      {url && <img src={url} alt="" draggable={false} />}
      {chosen && <span className="frame-check" aria-hidden><Check size={16} /></span>}
    </button>
  );
}

/** Every photo of a series as a tile to pick, and the bar that sends the picked ones to the bin. */
export function SeriesPhotos({ w, seriesId, photos, locked, onRemoved }: {
  w: Dict;
  seriesId: string;
  /** The series' photos as paths, `001.jpg` first. */
  photos: readonly string[];
  /** The series is used by a day: nothing can be picked. */
  locked: boolean;
  /** The host answered: how many photos the series holds now (-1: unknown, read it again). */
  onRemoved: (left: number) => void;
}) {
  const p = w.phone;
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after each removal: the names are given to other photos, every tile reads its photo again.
  const [round, setRound] = useState(0);
  // Another series shown: nothing stays picked.
  useEffect(() => { setChosen(new Set()); setAsking(false); setError(null); }, [seriesId]);

  const toggle = (path: string) => setChosen((s) => {
    const next = new Set(s);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const remove = async () => {
    setAsking(false);
    setBusy(true);
    setError(null);
    const names = [...chosen].map((x) => x.split(/[\\/]/).pop()!);
    try {
      const res = await phoneDoors.removePhotos(seriesId, names, photos.length);
      onRemoved(res.photos);
    } catch (err) {
      console.warn('[lab-3d] series photos not removed:', err);
      setError(fill(p.removeFailed, { detail: err instanceof Error ? err.message : String(err) }));
      // Some may have gone before the failure, and the others were renumbered: read the series again.
      onRemoved(-1);
    } finally {
      // Whatever happened, the names now point at other photos: nothing stays picked, every tile reads again.
      setChosen(new Set());
      setRound((r) => r + 1);
      setBusy(false);
    }
  };

  return (
    <>
      {chosen.size > 0 && (
        <div className="phone-actions series-pick" role="group" aria-label={fill(p.picked, { n: chosen.size })}>
          <span className="phone-target">{fill(p.picked, { n: chosen.size })}</span>
          {asking ? (
            <>
              <span className="minor">{fill(p.removeSure, { n: chosen.size })}</span>
              <button className="danger" disabled={busy} onClick={() => void remove()}>{p.removeYes}</button>
              <button disabled={busy} onClick={() => setAsking(false)}>{p.removeKeep}</button>
            </>
          ) : (
            <>
              <button className="danger" disabled={busy} onClick={() => setAsking(true)}>{p.removePicked}</button>
              <button disabled={busy} onClick={() => setChosen(new Set())}>{p.pickNone}</button>
            </>
          )}
        </div>
      )}
      {error && <div className="error-line" role="alert">{error}</div>}
      <div className="frame-grid series-photos">
        {photos.map((x) => <Tile key={`${round}:${x}`} path={x} chosen={chosen.has(x)} locked={locked || busy} onToggle={() => toggle(x)} />)}
      </div>
    </>
  );
}
