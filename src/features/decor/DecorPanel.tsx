/**
 * DecorPanel — the décors behind the object on stage: « None », « Choose a
 * picture » (one already on disk, free), the décors kept, and a new one drawn
 * from a place (a preset or typed) on the person's credits.
 *
 * Drawing costs money, so it is guarded twice: a synchronous lock (a second
 * click or Enter in the same instant is one picture, not two) and the button
 * itself. A refused permission asks the host to read it again and says the
 * answer; it never draws on its own after a yes (the next click does).
 *
 * @module features/decor/DecorPanel
 */
import { useEffect, useRef, useState } from 'react';
import { DECOR_PRESETS, MAX_PLACE_CHARS, PRESET_PLACE, formatUsd, type DecorEntry, type DecorPreset, type DecorQuality, type DecorState } from '../../core/decorModel';
import { doors, isPermissionRefusal } from '../../host/doors';
import { fill, type Dict } from '../../i18n/words';
import { Check, Close, Upload } from '../../ui/Icon';
import { describeError } from '../create/createModel';
import { decorPicture } from './decorStore';
import { decorName, fileName } from './decorTabModel';

export type DecorListState = 'loading' | 'ready' | { error: string };

export function DecorPanel({ w, lang, state, list, chosen, onRetry, onChoose, onForget, onPick, onDraw }: {
  w: Dict; lang: string; state: DecorState; list: DecorListState; chosen: string | null;
  onRetry: () => void; onChoose: (path: string | null) => void; onForget: (path: string) => void;
  onPick: () => Promise<void>;
  onDraw: (place: string, preset: DecorPreset | null, quality: DecorQuality) => Promise<DecorEntry>;
}) {
  const [typed, setTyped] = useState('');
  const [preset, setPreset] = useState<DecorPreset>('wood');
  const [quality, setQuality] = useState<DecorQuality>('fast');
  const [busySince, setBusySince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billed, setBilled] = useState<string | null>(null);
  // The locks a second press in the same instant reads: state would still be stale then.
  // One for the money path, one for the system's file dialog (two dialogs, the 2nd answer wins).
  const drawing = useRef(false);
  const pickingNow = useRef(false);
  const alive = useRef(true);
  const ready = list === 'ready';
  // A typed place wins over the presets; an emptied field falls back to the preset.
  const place = typed.trim() ? typed : PRESET_PLACE[preset];

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // The clock under « Drawing »: a counter proves the work goes on, a spinner only says so.
  useEffect(() => {
    if (busySince === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, [busySince]);

  const draw = async () => {
    if (drawing.current || asking || !ready || !place.trim()) return;
    drawing.current = true;
    setError(null);
    setBilled(null);
    const t0 = Date.now();
    setBusySince(t0);
    setNow(t0);
    try {
      const entry = await onDraw(place, typed.trim() ? null : preset, quality);
      if (alive.current) setBilled(formatUsd(entry.billedUsdMicro, lang));
    } catch (err) {
      console.warn('[lab-3d] décor not drawn:', err);
      if (!alive.current) return;
      if (!isPermissionRefusal(err)) {
        setError(fill(w.decor.drawError, { error: describeError(err instanceof Error ? err.message : String(err), w.decor.errors) }));
        return;
      }
      // The host reads permissions at start: one added since is refused until read again.
      // The answer is said; the picture is not drawn behind it, the next click draws it.
      setAsking(true);
      try {
        const granted = await doors.refreshPermission('image:generate');
        if (alive.current) setError(granted ? w.decor.allowed : w.decor.refused);
      } catch (e) {
        // Could not ask is not a « no »: the host's own words, not the refusal.
        console.warn('[lab-3d] permission not read again:', e);
        if (alive.current) setError(fill(w.decor.drawError, { error: e instanceof Error ? e.message : String(e) }));
      } finally {
        if (alive.current) setAsking(false);
      }
    } finally {
      drawing.current = false;
      if (alive.current) setBusySince(null);
    }
  };

  const pick = async () => {
    if (pickingNow.current || !ready) return;
    pickingNow.current = true;
    setPicking(true);
    setError(null);
    try {
      await onPick();
    } catch (err) {
      console.warn('[lab-3d] no picture chosen:', err);
      if (alive.current) setError(fill(w.decor.pickError, { error: describeError(err instanceof Error ? err.message : String(err), w.decor.errors) }));
    } finally {
      pickingNow.current = false;
      if (alive.current) setPicking(false);
    }
  };

  return (
    <div className="decor-panel">
      {list === 'loading' && <p className="decor-note">{w.decor.listLoading}</p>}
      {typeof list === 'object' && (
        <p className="error-line" role="alert">
          {fill(w.decor.listError, { error: list.error })} <button onClick={onRetry}>{w.decor.retry}</button>
        </p>
      )}
      {ready && (
        <div className="decor-tiles">
          <button className={`decor-tile none${chosen === null ? ' chosen' : ''}`} aria-pressed={chosen === null} onClick={() => onChoose(null)}>
            {chosen === null && <span className="choice-check" aria-hidden><Check size={12} /></span>}
            {w.decor.none}
          </button>
          <button className="decor-tile add" disabled={picking} onClick={() => void pick()}>
            <Upload size={18} />
            {w.decor.choosePicture}
          </button>
          {state.decors.map((d) => (
            <DecorTile key={d.path} d={d} name={decorName(d, w.decor.presets, w.decor.picked)} chosen={chosen === d.path} w={w}
              onChoose={() => onChoose(d.path)} onForget={() => onForget(d.path)} />
          ))}
        </div>
      )}

      <div className="opt-label">{w.decor.newDecor}</div>
      <div className="chips" role="radiogroup" aria-label={w.decor.newDecor}>
        {DECOR_PRESETS.map((p) => {
          const on = !typed.trim() && preset === p;
          return (
            <button key={p} role="radio" aria-checked={on} className={`chip${on ? ' chosen' : ''}`} onClick={() => { setPreset(p); setTyped(''); }}>
              {on && <Check size={12} />}{w.decor.presets[p]}
            </button>
          );
        })}
      </div>
      <input className="decor-place" value={typed} placeholder={w.decor.place} aria-label={w.decor.place} maxLength={MAX_PLACE_CHARS}
        onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void draw(); }} />
      <div className="decor-go">
        <div className="segmented" role="radiogroup" aria-label={`${w.decor.fast} · ${w.decor.quality}`}>
          {(['fast', 'quality'] as const).map((q) => (
            <button key={q} role="radio" aria-checked={quality === q} className={quality === q ? 'chosen wide' : 'wide'} onClick={() => setQuality(q)}>
              {q === 'fast' ? w.decor.fast : w.decor.quality}
            </button>
          ))}
        </div>
        <button className="primary" disabled={busySince !== null || asking || !ready || !place.trim()} onClick={() => void draw()}>
          {busySince !== null ? fill(w.decor.drawing, { s: Math.max(0, Math.round((now - busySince) / 1000)) }) : w.decor.draw}
        </button>
      </div>
      {asking && <p className="decor-note">{w.decor.asking}</p>}
      {billed && <p className="decor-note billed">{fill(w.decor.billed, { usd: billed })}</p>}
      {error && <p className="error-line" role="alert">{error}</p>}
    </div>
  );
}

/** One décor kept: its picture, green when chosen, a ✕ to take it off the list (the file stays on disk). */
function DecorTile({ d, name, chosen, w, onChoose, onForget }: { d: DecorEntry; name: string; chosen: boolean; w: Dict; onChoose: () => void; onForget: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    decorPicture(d.path).then(
      (url) => { if (!cancelled) setSrc(url); },
      (err: unknown) => {
        console.warn('[lab-3d] décor picture unreadable:', d.path, err);
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      },
    );
    return () => { cancelled = true; };
  }, [d.path]);
  return (
    <div className={`decor-tile pic${chosen ? ' chosen' : ''}`}>
      <button className="decor-pick" aria-pressed={chosen} title={`${name} · ${fileName(d.path)}`} aria-label={name} onClick={onChoose}>
        {src ? <img src={src} alt="" draggable={false} /> : <span className="decor-missing">{failed ? fill(w.decor.readError, { error: failed }) : ''}</span>}
        <span className="decor-name">{name}</span>
      </button>
      {chosen && <span className="choice-check" aria-hidden><Check size={12} /></span>}
      <button className="decor-forget icon" title={w.decor.forget} aria-label={w.decor.forget} onClick={onForget}><Close size={12} /></button>
    </div>
  );
}
