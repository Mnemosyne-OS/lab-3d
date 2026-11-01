/**
 * PaintingTab — a painting brought to life (doc 166 §15): the photo of a
 * painting, chosen on disk, shown at once; its depth read on this machine (no
 * credit, the décor's door `image.depth`), then the painting laid on it while
 * the camera drifts slowly inside and follows the pointer. The drift pauses
 * on a click, and starts paused for a person who asked for less motion.
 *
 * The dive (doc 166 §15.5) replaces the stage: the painting on a 2D canvas,
 * and « Dive further » has the image model paint a level inside it, one per
 * click, on the credits; the levels are kept per painting in this window.
 *
 * The recent paintings are a convenience of this window (localStorage): the
 * files stay where they are, nothing is copied. Outside Mnemosyne it says
 * what it needs.
 *
 * @module features/painting/PaintingTab
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { doors, isPermissionRefusal } from '../../host/doors';
import { hasCapability, inMnemosyne, type HostState } from '../../host/hostState';
import { PHONE_CAPABILITY, phoneDoors, type PhoneSeries, type Placed } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { readChoice, safeLocalStorage, writeChoice } from '../../lib/choiceStore';
import { readDepthPicture } from '../../engine/relief';
import { PaintingStage } from '../../engine/PaintingStage';
import { straightened } from '../../engine/straighten';
import { uprightPicture } from '../../engine/uprightPicture';
import { retouched, worldPictures } from '../../engine/worldCanvases';
import { describeError } from '../create/createModel';
import { decorPicture, depthReady, pictureDepth } from '../decor/decorStore';
import { HudPanel } from '../../ui/HudPanel';
import { Check, Close, Dive, Expand, Layers, Orbit, Painting, Phone, Scan, Spark, Upload } from '../../ui/Icon';
import { NeedsMnemosyne } from '../../ui/NeedsMnemosyne';
import { Notice } from '../../ui/Notice';
import { StageOverlay, ToolButton } from '../stage/StageOverlay';
import { PlaceSeries } from '../phone/PlaceSeries';
import { PaintingPhone } from './PaintingPhone';
import { findCanvasQuad, uprightDepth } from './canvasCrop';
import { addRecent, movedPaths, paintingName, parseRecent, seriesPhotos } from './paintingModel';
import { formatUsd } from '../../core/decorModel';
import { DiveView } from './DiveView';
import { DIVE_MODEL, DIVE_PROMPT, DIVE_RATIO, parseDives, type DiveLevel } from './diveModel';

const RECENT_KEY = 'lab3d.paintings';
const CROP_KEY = 'lab3d.paintingCrop';
const MODE_KEY = 'lab3d.paintingMode';
const RETOUCH_KEY = 'lab3d.paintingRetouch';
const DIVES_KEY = 'lab3d.paintingDives';

/** The painting on stage: none chosen, its picture being read, shown, or why not. */
type View = { state: 'none' } | { state: 'loading' } | { state: 'shown' } | { state: 'error'; error: string };
/** Its depth: nothing to say yet, the engine or the model missing, being read, on, the canvas alone (flat), or why it stays flat. */
type Depth = 'idle' | 'noEngine' | 'missing' | 'reading' | 'on' | 'canvas' | { error: string };
/** The crop: nothing to say (off, or not read yet), the canvas cut out and straightened, or no canvas found in the photo. */
type Canvas = 'idle' | 'cropped' | 'notFound';
/** What the stage shows: the picture flat, laid on its relief, or cut into its world. */
type Look = 'flat' | 'relief' | 'world';

function readRecent(): string[] {
  try {
    const raw = safeLocalStorage()?.getItem(RECENT_KEY);
    return raw ? parseRecent(JSON.parse(raw)) : [];
  } catch (err) {
    console.warn('[lab-3d] recent paintings unreadable:', err);
    return [];
  }
}

function writeRecent(list: string[]): void {
  try { safeLocalStorage()?.setItem(RECENT_KEY, JSON.stringify(list)); }
  catch (err) { console.warn('[lab-3d] recent paintings not remembered:', err); }
}

function readDives(): Record<string, DiveLevel[]> {
  try {
    const raw = safeLocalStorage()?.getItem(DIVES_KEY);
    return raw ? parseDives(JSON.parse(raw)) : {};
  } catch (err) {
    console.warn('[lab-3d] painting dives unreadable:', err);
    return {};
  }
}

function writeDives(all: Record<string, DiveLevel[]>): void {
  try { safeLocalStorage()?.setItem(DIVES_KEY, JSON.stringify(all)); }
  catch (err) { console.warn('[lab-3d] painting dives not remembered:', err); }
}

/** Whether the person asked the system for less motion: the drift then starts paused. */
function prefersStill(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; }
  catch (err) { console.warn('[lab-3d] reduced-motion preference unreadable:', err); return false; }
}

export function PaintingTab({ w, lang = 'en', host, active = true }: {
  w: Dict; host: HostState | null;
  /** For the price of a level. */
  lang?: string;
  /** Whether the tab is the one shown. No WebGL context is made before it was opened once. */
  active?: boolean;
}) {
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const enabled = host !== null && inMnemosyne(host) && opened;

  const [recent, setRecent] = useState<string[]>(readRecent);
  const [chosen, setChosen] = useState<string | null>(() => recent[0] ?? null);
  const [view, setView] = useState<View>(chosen ? { state: 'loading' } : { state: 'none' });
  const [depth, setDepth] = useState<Depth>('idle');
  const [depthBytes, setDepthBytes] = useState<number | null>(null);
  const [moving, setMoving] = useState(() => !prefersStill());
  const [wide, setWide] = useState(false);
  // The canvas cut out of its photo: on unless switched off, remembered.
  const [crop, setCrop] = useState(() => readChoice(safeLocalStorage(), CROP_KEY, ['on', 'off'] as const, 'on') === 'on');
  const [canvas, setCanvas] = useState<Canvas>('idle');
  // The world (its colour masses as floating layers) or the relief: the world unless switched, remembered.
  const [mode, setMode] = useState(() => readChoice(safeLocalStorage(), MODE_KEY, ['world', 'relief'] as const, 'world'));
  // The retouch of a photo taken in dim light: on unless switched off, remembered.
  const [retouch, setRetouch] = useState(() => readChoice(safeLocalStorage(), RETOUCH_KEY, ['on', 'off'] as const, 'on') === 'on');
  const [look, setLook] = useState<Look>('flat');
  const [masses, setMasses] = useState(0);
  const [stageError, setStageError] = useState<string | null>(null);
  // The phone: its QR screen open, the series just taken (waiting in the app), and where it goes.
  const [phone, setPhone] = useState(false);
  const [taken, setTaken] = useState<(PhoneSeries & { dir: string }) | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedNote, setPlacedNote] = useState<string | null>(null);
  // The dive: on screen in place of the stage, the picture it starts from (as shown), the levels per painting.
  const [dive, setDive] = useState(false);
  const [shownCanvas, setShownCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dives, setDives] = useState<Record<string, DiveLevel[]>>(readDives);
  const [diveSince, setDiveSince] = useState<number | null>(null);
  const [diveNow, setDiveNow] = useState(() => Date.now());
  const [diveNote, setDiveNote] = useState<string | null>(null);
  const [diveError, setDiveError] = useState<string | null>(null);
  const divingNow = useRef(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<PaintingStage | null>(null);
  const [stageReady, setStageReady] = useState(false);

  // One WebGL stage for the tab's life, made once it was opened inside Mnemosyne.
  useEffect(() => {
    const el = hostRef.current;
    if (!enabled || !el) return;
    let stage: PaintingStage;
    try {
      stage = new PaintingStage(el);
    } catch (err) {
      console.warn('[lab-3d] the painting stage could not start:', err);
      setStageError(err instanceof Error ? err.message : String(err));
      return;
    }
    stageRef.current = stage;
    setStageReady(true);
    return () => {
      stage.dispose();
      stageRef.current = null;
      setStageReady(false);
    };
  }, [enabled]);

  useEffect(() => { stageRef.current?.setMoving(moving); }, [moving, stageReady]);

  // The chosen painting: its picture first, as stored, then what this machine can read of it.
  // The depth says where the canvas is (the crop) and lays the photo on its relief; the world
  // (doc 166 §15.4) needs no depth: the painting's colour masses, each a layer at its own depth.
  // What is shown is the canvas alone when it was cut, retouched when the retouch is on.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stageReady || !stage) return;
    if (!chosen) { setView({ state: 'none' }); setDepth('idle'); setCanvas('idle'); setLook('flat'); return; }
    let cancelled = false;
    setView({ state: 'loading' });
    setDepth('idle');
    setCanvas('idle');
    setLook('flat');
    setShownCanvas(null);
    void (async () => {
      let url: string;
      try {
        url = await decorPicture(chosen);
        if (cancelled || !(await stage.show(url)) || cancelled) return;
        setView({ state: 'shown' });
      } catch (err) {
        console.warn('[lab-3d] painting unreadable:', chosen, err);
        if (!cancelled) setView({ state: 'error', error: err instanceof Error ? err.message : String(err) });
        return;
      }
      let grey: { grey: Uint8Array; width: number; height: number } | null = null;
      const ready = await depthReady();
      if (cancelled) return;
      if (ready.state === 'noEngine') setDepth('noEngine');
      else if (ready.state === 'missing') { setDepthBytes(ready.downloadBytes); setDepth('missing'); }
      // A host from before the relief: nothing is said about a door it lacks.
      else if (ready.state === 'ready') {
        setDepth('reading');
        try {
          // A phone stores its photo sideways and the browser shows it upright: a host that
          // read it as stored (older than the image engine v15) gives a depth to turn here.
          const made = await pictureDepth(chosen);
          const raw = await readDepthPicture(made.url);
          grey = made.upright ? raw : uprightDepth(url, raw);
          if (!cancelled) setDepth('idle');
        } catch (err) {
          console.warn('[lab-3d] painting depth failed:', chosen, err);
          if (!cancelled) setDepth({ error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (cancelled) return;
      try {
        const quad = crop && grey ? findCanvasQuad(grey.grey, grey.width, grey.height) : null;
        setCanvas(quad ? 'cropped' : crop && grey ? 'notFound' : 'idle');
        let source: HTMLCanvasElement | null = quad ? await straightened(url, quad)
          : retouch || mode === 'world' ? await uprightPicture(url) : null;
        if (cancelled) return;
        if (source && retouch) source = retouched(source);
        // The dive starts from the painting as it is shown: cut out, retouched.
        if (source) setShownCanvas(source);
        if (source && (!(await stage.show(source)) || cancelled)) return;
        if (mode === 'world' && source) {
          const world = worldPictures(source);
          console.log(`[lab-3d] painting world: ${world.count} masses in ${world.ms} ms`);
          if (cancelled) return;
          if (stage.setWorld(world.layers)) { setMasses(world.count); setLook('world'); }
          else setDepth({ error: 'WORLD_NOT_BUILT' });
          return;
        }
        if (quad) { setDepth('canvas'); return; }
        if (grey) {
          if (stage.setDepth(grey)) { setDepth('on'); setLook('relief'); }
          else setDepth({ error: 'RELIEF_NOT_BUILT' });
        }
      } catch (err) {
        console.warn('[lab-3d] painting not laid out:', chosen, err);
        if (!cancelled) setDepth({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [chosen, stageReady, crop, retouch, mode]);

  // A painting shown as it was stored (the relief, no crop nor retouch): the dive reads it upright itself.
  useEffect(() => {
    if (!dive || !chosen || shownCanvas || view.state !== 'shown') return;
    let live = true;
    decorPicture(chosen).then(uprightPicture).then(
      (c) => { if (live) setShownCanvas(c); },
      (err: unknown) => {
        console.warn('[lab-3d] painting not read for the dive:', chosen, err);
        if (live) setDiveError(fill(w.painting.readError, { error: err instanceof Error ? err.message : String(err) }));
      },
    );
    return () => { live = false; };
  }, [dive, chosen, shownCanvas, view.state, w]);

  // The seconds under « Dive further » while the model paints: a counter proves the work goes on.
  useEffect(() => {
    if (diveSince === null) return;
    const t = window.setInterval(() => setDiveNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, [diveSince]);

  // The levels belong to the picture they were cut from: the whole photo and its cut-out canvas are two.
  const diveKey = chosen ? `${chosen}|${canvas === 'cropped' ? 'cut' : 'whole'}` : '';
  const levels = dives[diveKey] ?? [];

  const keepDives = (key: string, list: DiveLevel[] | null) => {
    setDives((all) => {
      const next = { ...all };
      if (list && list.length) next[key] = list; else delete next[key];
      writeDives(next);
      return next;
    });
  };

  // One level per click, on the credits: the window cut from the deepest level, repainted by the model.
  const diveFurther = async (win: { x: number; y: number; w: number; h: number }, dataUrl: string) => {
    if (divingNow.current) return;
    divingNow.current = true;
    const key = diveKey;
    const before = levels;
    setDiveError(null);
    setDiveNote(null);
    const t0 = Date.now();
    setDiveSince(t0);
    setDiveNow(t0);
    try {
      const res = await doors.editPicture(DIVE_PROMPT, DIVE_RATIO, DIVE_MODEL, dataUrl);
      if (!res?.path) throw new Error('NO_PICTURE_RETURNED');
      keepDives(key, [...before, { path: res.path, ...win }]);
      setDiveNote(fill(w.painting.diveNote, { n: before.length + 1, usd: formatUsd(res.billedUsdMicro ?? null, lang) ?? '—' }));
    } catch (err) {
      console.warn('[lab-3d] no new level painted:', err);
      if (!isPermissionRefusal(err)) {
        setDiveError(fill(w.painting.diveError, { error: describeError(err instanceof Error ? err.message : String(err), w.decor.errors) }));
      } else {
        // The host reads permissions at start: one added since is asked again, and the next click paints.
        try {
          const granted = await doors.refreshPermission('image:generate');
          setDiveError(granted ? w.painting.diveAllowed : w.painting.diveRefused);
        } catch (e) {
          console.warn('[lab-3d] permission not read again:', e);
          setDiveError(fill(w.painting.diveError, { error: e instanceof Error ? e.message : String(e) }));
        }
      }
    } finally {
      divingNow.current = false;
      setDiveSince(null);
    }
  };

  const choose = (path: string) => {
    setChosen(path);
    const next = addRecent(recent, path);
    setRecent(next);
    writeRecent(next);
  };

  // The series is shown at once, its last photo on stage: the one taken when the framing was right.
  const onTaken = (series: PhoneSeries & { dir: string }) => {
    setPhone(false);
    setTaken(series);
    setPlacedNote(null);
    const photos = seriesPhotos(series.dir, series.photos);
    const last = photos[photos.length - 1];
    if (last) choose(last);
  };

  const place = async (how: () => Promise<Placed | null>) => {
    if (!taken) return;
    setPlaceError(null);
    setPlaceBusy(true);
    try {
      const res = await how();
      // A closed dialog places nothing: the series still waits.
      if (!res) return;
      const next = movedPaths(recent, taken.dir, res.dir);
      setRecent(next);
      writeRecent(next);
      if (chosen) setChosen(movedPaths([chosen], taken.dir, res.dir)[0]!);
      setTaken(null);
      setPlacing(false);
      setPlacedNote(fill(w.painting.placedNote, { n: res.photos, dir: res.dir }));
    } catch (err) {
      console.warn('[lab-3d] painting photos not put away:', err);
      setPlaceError(describeError(err instanceof Error ? err.message : String(err), w.phone.errors));
    } finally {
      setPlaceBusy(false);
    }
  };

  const discard = async () => {
    if (!taken) return;
    setPlaceError(null);
    setPlaceBusy(true);
    try {
      await phoneDoors.discard(taken.id);
      const gone = new Set(seriesPhotos(taken.dir, taken.photos));
      const next = recent.filter((p) => !gone.has(p));
      setRecent(next);
      writeRecent(next);
      if (chosen && gone.has(chosen)) setChosen(next[0] ?? null);
      setTaken(null);
      setPlacing(false);
    } catch (err) {
      console.warn('[lab-3d] painting photos not deleted:', err);
      setPlaceError(describeError(err instanceof Error ? err.message : String(err), w.phone.errors));
    } finally {
      setPlaceBusy(false);
    }
  };

  const forget = (path: string) => {
    const next = recent.filter((p) => p !== path);
    setRecent(next);
    writeRecent(next);
    if (chosen === path) setChosen(next[0] ?? null);
  };

  const onPick = async () => {
    try {
      const path = await doors.selectImage(w.painting.pictures);
      // The dialog was closed: nothing to add, nothing to say.
      if (path) choose(path);
    } catch (err) {
      console.warn('[lab-3d] no painting chosen:', err);
      setView({ state: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const openImageSettings = () => {
    doors.openSettings('theia').catch((err: unknown) => {
      console.warn('[lab-3d] Settings › Images did not open:', err);
      setDepth({ error: err instanceof Error ? err.message : String(err) });
    });
  };

  if (host === null) return <div className="stage-wrap"><Notice scanning>{w.host.pending}</Notice></div>;
  if (!inMnemosyne(host)) return <div className="stage-wrap"><NeedsMnemosyne w={w} /></div>;

  const name = chosen ? paintingName(chosen) : '';
  const withPhone = hasCapability(host, PHONE_CAPABILITY);
  const openPhone = () => { setPlacing(false); setPhone(true); };
  const over = phone || (placing && !!taken);
  const diving = dive && view.state === 'shown' && !over;
  let screen: ReactNode = null;
  if (phone) {
    screen = <PaintingPhone w={w} platform={host.kind === 'mnemosyne' ? host.platform ?? null : null} onTaken={onTaken} onCancel={() => setPhone(false)} />;
  } else if (placing && taken) {
    screen = <PlaceSeries w={w} gallery="objects" vaultBase={w.painting.panel} series={taken} busy={placeBusy} error={placeError}
      onPlace={(how) => void place(how)} onDiscard={() => void discard()} />;
  } else if (stageError) {
    screen = <Notice><p className="error-line" role="alert">{fill(w.painting.stageError, { error: stageError })}</p></Notice>;
  } else if (view.state === 'none') {
    screen = (
      <Notice>
        <span className="notice-mark" aria-hidden><Painting size={30} /></span>
        <div className="drop-title">{w.painting.title}</div>
        <p>{w.painting.intro}</p>
        <div className="phone-actions painting-start">
          <button className="primary" onClick={() => void onPick()}><Upload size={16} />{w.painting.choose}</button>
          {withPhone && <button onClick={openPhone}><Phone size={16} />{w.painting.phone}</button>}
        </div>
      </Notice>
    );
  } else if (view.state === 'loading') {
    screen = <Notice scanning>{w.painting.loading}</Notice>;
  } else if (view.state === 'error') {
    screen = <Notice><p className="error-line" role="alert">{fill(w.painting.readError, { error: view.error })}</p></Notice>;
  } else if (diving) {
    screen = shownCanvas
      ? <DiveView w={w} lang={lang} source={shownCanvas} levels={levels} busy={diveSince !== null}
        seconds={diveSince === null ? 0 : Math.max(0, Math.round((diveNow - diveSince) / 1000))}
        error={diveError} note={diveNote} onDive={(win, url) => void diveFurther(win, url)}
        onForget={() => { keepDives(diveKey, null); setDiveNote(null); }} onClose={() => setDive(false)} />
      : <Notice scanning>{w.painting.loading}</Notice>;
  } else {
    screen = (
      <StageOverlay
        hint={w.painting.hint}
        rows={[
          [w.painting.painting, name],
          [w.painting.depth, look === 'world' ? w.painting.world : look === 'relief' ? w.painting.relief : depth === 'reading' ? w.painting.reading : w.painting.flat],
          ...(canvas === 'idle' ? [] : [[w.painting.canvas, canvas === 'cropped' ? w.painting.cropped : w.painting.notFound] as const]),
          [w.painting.motion, moving ? w.painting.drifting : w.painting.still, true],
        ]}
        tools={(
          <>
            <ToolButton label={w.painting.motion} on={moving} onClick={() => setMoving((m) => !m)}><Orbit /></ToolButton>
            <ToolButton label={w.painting.worldMode} on={mode === 'world'} onClick={() => { const m = mode === 'world' ? 'relief' : 'world'; setMode(m); writeChoice(safeLocalStorage(), MODE_KEY, m); }}><Layers /></ToolButton>
            <ToolButton label={w.painting.retouch} on={retouch} onClick={() => { const on = !retouch; setRetouch(on); writeChoice(safeLocalStorage(), RETOUCH_KEY, on ? 'on' : 'off'); }}><Spark /></ToolButton>
            <ToolButton label={w.painting.crop} on={crop} onClick={() => { const on = !crop; setCrop(on); writeChoice(safeLocalStorage(), CROP_KEY, on ? 'on' : 'off'); }}><Scan /></ToolButton>
            <ToolButton label={w.painting.wide} on={wide} onClick={() => setWide((v) => !v)}><Expand /></ToolButton>
            <ToolButton label={w.painting.diveMode} onClick={() => { setDiveError(null); setDive(true); }}><Dive /></ToolButton>
          </>
        )}
      />
    );
  }

  return (
    <div className={`decor-layout painting-layout${wide ? ' wide' : ''}${chosen ? '' : ' idle'}`}>
      <div className="decor-stage">
        <div ref={hostRef} className="stage" style={{ visibility: view.state === 'shown' && !over && !diving ? 'visible' : 'hidden' }} />
        {screen}
      </div>
      {!wide && (
        <aside className="decor-side" aria-label={w.painting.panel}>
          <HudPanel index="05" title={w.painting.panel}>
            <button className="primary painting-choose" onClick={() => void onPick()}><Upload size={16} />{w.painting.choose}</button>
            {withPhone && <button className="painting-choose" onClick={openPhone}><Phone size={16} />{w.painting.phone}</button>}
            {placedNote && <p className="decor-note relief-on">{placedNote}</p>}
            {look === 'world' && <p className="decor-note relief-on">{fill(w.painting.worldNote, { n: masses })}</p>}
            <DepthNote w={w} depth={depth} depthBytes={depthBytes} onOpenSettings={openImageSettings} />
          </HudPanel>
          {taken && (
            <HudPanel title={fill(w.painting.fromPhone, { n: taken.photos })}>
              <div className="decor-tiles">
                {seriesPhotos(taken.dir, taken.photos).map((p) => <PaintingTile key={p} path={p} chosen={p === chosen} w={w} onChoose={() => choose(p)} />)}
              </div>
              <button className="painting-choose" disabled={placeBusy} onClick={() => { setPhone(false); setPlacing(true); }}>{w.painting.putAway}</button>
            </HudPanel>
          )}
          {recent.length > 0 && (
            <HudPanel title={w.painting.recent}>
              <div className="decor-tiles">
                {recent.map((p) => <PaintingTile key={p} path={p} chosen={p === chosen} w={w} onChoose={() => choose(p)} onForget={() => forget(p)} />)}
              </div>
            </HudPanel>
          )}
        </aside>
      )}
    </div>
  );
}

/** What the depth is doing, in one line: nothing before there is anything to say. */
function DepthNote({ w, depth, depthBytes, onOpenSettings }: { w: Dict; depth: Depth; depthBytes: number | null; onOpenSettings: () => void }) {
  if (depth === 'idle') return null;
  if (depth === 'reading') return <p className="decor-note">{w.painting.reading}</p>;
  if (depth === 'on') return <p className="decor-note relief-on">{w.painting.reliefOn}</p>;
  if (depth === 'canvas') return <p className="decor-note relief-on">{w.painting.canvasNote}</p>;
  if (depth === 'noEngine' || depth === 'missing') {
    const line = depth === 'noEngine' ? w.decor.reliefNoEngine
      : depthBytes ? fill(w.decor.reliefMissing, { mb: Math.round(depthBytes / 1e6) }) : w.decor.reliefMissingNoSize;
    return <p className="decor-note">{line} <button onClick={onOpenSettings}>{w.decor.openImageSettings}</button></p>;
  }
  return <p className="error-line" role="alert">{fill(w.painting.flatBecause, { error: describeError(depth.error, w.decor.reliefErrors) })}</p>;
}

/** One recent painting: its picture and name, green when on stage, ✕ to take it off the list (the file stays). */
function PaintingTile({ path, chosen, w, onChoose, onForget }: { path: string; chosen: boolean; w: Dict; onChoose: () => void; onForget?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    decorPicture(path).then(
      (url) => { if (!cancelled) setSrc(url); },
      (err: unknown) => {
        console.warn('[lab-3d] painting picture unreadable:', path, err);
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      },
    );
    return () => { cancelled = true; };
  }, [path]);
  const name = paintingName(path);
  return (
    <div className={`decor-tile pic${chosen ? ' chosen' : ''}`}>
      <button className="decor-pick" aria-pressed={chosen} title={path} aria-label={name} onClick={onChoose}>
        {src ? <img src={src} alt="" draggable={false} /> : <span className="decor-missing">{failed ? fill(w.painting.readError, { error: failed }) : ''}</span>}
        <span className="decor-name">{name}</span>
      </button>
      {chosen && <span className="choice-check" aria-hidden><Check size={12} /></span>}
      {onForget && <button className="decor-forget icon" title={w.painting.forget} aria-label={w.painting.forget} onClick={onForget}><Close size={12} /></button>}
    </div>
  );
}
