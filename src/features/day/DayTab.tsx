/**
 * DayTab — one day in a place (« Une journée »): the place filmed empty in the
 * morning, walked through, with the day's photos laid in it at spots the
 * person pins, and a timeline that moves the hour.
 *
 * - Pin a spot where the eye stands (the host has no door that places a photo
 *   in a scene: the person does it, in one click).
 * - Photos come from the phone (the host's capture by QR, one series = one
 *   moment) or from a folder (cut into moments by their time).
 * - Moving the timeline lights the spots whose moments have passed; at a spot
 *   the photo of its latest moment appears through ink over the one before.
 * - Playing the day flies from spot to spot in the order of the day, each
 *   moment's photos shown in turn.
 *
 * Everything runs on doors the host already has (`splat.*`, `phoneCapture.*`,
 * `dialog.*`): nothing to install in Mnemosyne OS. A day keeps paths and
 * poses (dayStore), never a photo.
 *
 * @module features/day/DayTab
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addMoments, addSpot, applyPlacement, dayRange, momentEye, momentPhotos, newDay, phoneSeriesInDays, placeMoment, placedPhotosOf, playOrder, removeMoment, removeSpot, renameSpot, retimeMoment,
  sortedMoments, spotAt, spotLight, spotMoments, withDay, withoutDay, type Day, type DaysState, type Moment, type Spot,
} from '../../core/dayModel';
import { groupVersions, idName, mainVersionOf, type ObjectEntry } from '../../core/model';
import { doors, isPermissionRefusal, type Quality } from '../../host/doors';
import { hasCapability, inMnemosyne, type HostState } from '../../host/hostState';
import { PHONE_CAPABILITY, phoneDoors, type PhoneSeries } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { readChoice, safeLocalStorage, writeChoice } from '../../lib/choiceStore';
import { formatHour, pluralOf } from '../../lib/format';
import { ChevronLeft, Close, Layers, Retry, Spark, Target } from '../../ui/Icon';
import { HudPanel } from '../../ui/HudPanel';
import { NeedsMnemosyne } from '../../ui/NeedsMnemosyne';
import { Notice } from '../../ui/Notice';
import { Library } from '../objects/Library';
import { FILTERS, GRID_SIZES, galleryGroups, type Filter, type GridSize } from '../objects/libraryModel';
import { loadScene } from '../objects/sceneLoad';
import { removeGroup, useObjects } from '../objects/useObjects';
import { PaintingPhone } from '../painting/PaintingPhone';
import { madeFrom, sampleIndexes } from '../phone/phoneModel';
import { failureKind, loadRail, type LoadStep } from '../stage/loadModel';
import { LoadPanel } from '../stage/LoadPanel';
import { StageOverlay, ToolButton } from '../stage/StageOverlay';
import { useSceneLoader } from '../stage/useSceneLoader';
import { WalkPad } from '../stage/WalkPad';
import { guideOf } from '../../core/dayGuideModel';
import { DayGuide } from './DayGuide';
import { DayPanel, type ImportFrom } from './DayPanel';
import { momentOfSeries, momentsOfFolder, newId } from './dayImport';
import { CURRENT_DAY_KEY, readDaysState, writeDaysState } from './dayStore';
import { useAutoPlace, type PlaceNote } from './useAutoPlace';
import { describeError } from '../create/createModel';
import { INK_MS } from './inkModel';
import { photoUrl, prefetchPhotos } from './photoCache';
import { PhotoView } from './PhotoView';
import { SpotMarkers } from './SpotMarkers';
import { Timeline } from './Timeline';

/** A change is written this long after the last one (a spot's name typed letter by letter). */
const SAVE_MS = 400;
/** A playback shows up to this many photos of a moment, each this long. */
const PLAY_PHOTOS = 3;
const PHOTO_MS = INK_MS + 1700;
const GRID_KEY = 'lab3d.gridSize.day';
const FILTER_KEY = 'lab3d.filter.day';
/** Whether the guide shows over the scene (« on » unless the person hid it). */
const GUIDE_KEY = 'lab3d.day.guide';

type Kept = { state: 'loading' } | { state: 'error'; detail: string } | { state: 'ready'; days: DaysState };

function readCurrent(): string | null {
  try { return safeLocalStorage()?.getItem(CURRENT_DAY_KEY) ?? null; }
  catch (err) { console.warn('[lab-3d] the day open last could not be read:', err); return null; }
}

function writeCurrent(id: string | null): void {
  try {
    const s = safeLocalStorage();
    if (!s) return;
    if (id) s.setItem(CURRENT_DAY_KEY, id);
    else s.removeItem(CURRENT_DAY_KEY);
  } catch (err) { console.warn('[lab-3d] the day open last could not be kept:', err); }
}

export function DayTab({ w, lang, host, active = true, refreshKey = 0, onGoPlaces, onCreatePlace, onCreateObject, placeBuilding = false }: {
  w: Dict; lang: string; host: HostState | null;
  active?: boolean;
  /** Bumped when an object or a place was made elsewhere: the library is read again. */
  refreshKey?: number;
  /** Open the Places gallery. */
  onGoPlaces?: () => void;
  /** Open the Places' Create view: film the empty place, or see the place being built. */
  onCreatePlace?: () => void;
  /** Open the Objects' Create view: scan the finished tattoo. */
  onCreateObject?: () => void;
  /** The host is making a place now (the guide waits for it). */
  placeBuilding?: boolean;
}) {
  const d = w.day;
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const enabled = host !== null && inMnemosyne(host) && opened;
  const { objects, retry: retryObjects } = useObjects(enabled, refreshKey);
  const loader = useSceneLoader<{ placeId: string }>();
  const { view } = loader;

  // ── The days kept ────────────────────────────────────────────────────
  const [kept, setKept] = useState<Kept>({ state: 'loading' });
  const keptRef = useRef<Kept>(kept);
  const [readRound, setReadRound] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void readDaysState().then((r) => {
      if (!live) return;
      const next: Kept = r.ok ? { state: 'ready', days: r.state } : { state: 'error', detail: r.error };
      keptRef.current = next;
      setKept(next);
    });
    return () => { live = false; };
  }, [enabled, readRound]);

  const [dayId, setDayIdState] = useState<string | null>(readCurrent);
  const dayIdRef = useRef(dayId);
  const setDayId = (id: string | null) => { dayIdRef.current = id; setDayIdState(id); writeCurrent(id); };
  const day = kept.state === 'ready' ? kept.days.days.find((x) => x.id === dayId) ?? null : null;
  /** The day as it is now, for what runs after an await. */
  const currentDay = (): Day | null => {
    const k = keptRef.current;
    return k.state === 'ready' ? k.days.days.find((x) => x.id === dayIdRef.current) ?? null : null;
  };

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DaysState | null>(null);
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const s = pending.current;
    pending.current = null;
    if (s) void writeDaysState(s);
  }, []);
  useEffect(() => () => flush(), [flush]);
  const keep = (days: DaysState) => {
    const next: Kept = { state: 'ready', days };
    keptRef.current = next;
    setKept(next);
    pending.current = days;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, SAVE_MS);
  };
  /** Change the open day; nothing is written over days that could not be read. */
  const changeDay = (fn: (x: Day) => Day) => {
    const k = keptRef.current;
    const cur = currentDay();
    if (k.state !== 'ready' || !cur) return;
    keep(withDay(k.days, fn(cur)));
  };

  // ── The place on stage ───────────────────────────────────────────────
  const loadedFor = useRef<string | null>(null);
  // The place a day shows is the newest version of the one it was started on (a paused place resumed is
  // the same place): every version shares one COLMAP model, so its spots stand where they were pinned.
  // Until the library is read the day waits; a library that cannot be read shows the version kept.
  const shownPlace = !day ? null : objects.state === 'ready' ? mainVersionOf(objects.objects, day.placeId) : objects.state === 'error' ? day.placeId : null;
  useEffect(() => {
    if (!enabled || !day || !shownPlace) return;
    const key = `${day.id}|${shownPlace}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    const placeId = shownPlace;
    void loader.load(day.placeName || idName(placeId), async (onBytes) => {
      const scene = await loadScene(placeId, (share) => onBytes(share, 1));
      if (!scene.ok) throw new Error(scene.error);
      return { bytes: scene.bytes, fileName: scene.fileName, opts: { rig: scene.rig, walk: true }, meta: { placeId } };
    });
    // `loader.load` is rebuilt each render; the load runs once per day and version shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, day?.id, shownPlace]);
  const stage = view.kind === 'ready' ? loader.stage.current : null;

  // ── Each new moment placed by the host, at the viewpoint of its photos ──
  const placeNote = useAutoPlace({
    day, ready: view.kind === 'ready', placeId: shownPlace,
    onPlaced: (momentId, poses) => {
      const scale = loader.stage.current?.placeScale() ?? 1;
      changeDay((x) => applyPlacement(x, momentId, poses, scale, { id: () => newId('s'), spotName: (n) => fill(d.spotName, { n }), now: Date.now() }));
    },
  });

  // ── The hour ─────────────────────────────────────────────────────────
  const range = useMemo(() => dayRange(day ?? { moments: [] }, Date.now()), [day]);
  const [tAsked, setT] = useState(() => Date.now());
  const t = Math.min(range.end, Math.max(range.start, tAsked));
  const [open, setOpen] = useState<{ spotId: string; photo: number } | null>(null);
  // The guide does the day's steps: the panel of spots stays closed until asked.
  const [panel, setPanel] = useState(false);
  const [guideShown, setGuideShown] = useState(() => readChoice(safeLocalStorage(), GUIDE_KEY, ['on', 'off'] as const, 'on') === 'on');
  const showGuide = (on: boolean) => { setGuideShown(on); writeChoice(safeLocalStorage(), GUIDE_KEY, on ? 'on' : 'off'); };
  // « End of day » said for this day: the guide's last step.
  const [ended, setEnded] = useState<string | null>(null);
  // The spot the guide's next moment goes to, when the person picked one.
  const [momentSpot, setMomentSpot] = useState<string | null>(null);
  // The guide says « 18 min ago »: its clock moves every half minute.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // « Complete the place » asked, the host not answered yet: one at a time.
  const [completing, setCompleting] = useState(false);
  const [phoneFor, setPhoneFor] = useState<{ spotId: string | null } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // ── Playing the day ──────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const playRun = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const sleep = (ms: number) => new Promise<void>((resolve) => {
    const id = setTimeout(() => { timers.current.delete(id); resolve(); }, ms);
    timers.current.add(id);
  });
  const stopPlay = useCallback(() => {
    playRun.current++;
    for (const id of timers.current) clearTimeout(id);
    timers.current.clear();
    loader.stage.current?.stopFlight();
    setPlaying(false);
    // `loader.stage` is a ref: stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => stopPlay(), [stopPlay]);

  const play = async () => {
    const s = loader.stage.current;
    const x = currentDay();
    if (!s || !x) return;
    stopPlay();
    const run = ++playRun.current;
    const live = () => alive.current && playRun.current === run;
    setPlaying(true);
    setOpen(null);
    setError(null);
    const order = playOrder(x);
    for (let k = 0; k < order.length; k++) {
      const m = order[k]!;
      const spot = x.spots.find((sp) => sp.id === m.spotId);
      if (!spot) continue;
      const paths = momentPhotos(m);
      prefetchPhotos(sampleIndexes(paths.length, PLAY_PHOTOS).map((i) => paths[i]!));
      setOpen(null);
      setT(m.at);
      // Where its photos were really taken, when the host placed them; else the spot.
      const arrived = await s.flyTo(momentEye(m) ?? spot.pose);
      if (!live()) return;
      // The person took the eye (a drag, a key): the playback gives it back.
      if (!arrived) { stopPlay(); return; }
      for (const i of sampleIndexes(m.names.length, PLAY_PHOTOS)) {
        setOpen({ spotId: spot.id, photo: i });
        await sleep(PHOTO_MS);
        if (!live()) return;
      }
    }
    if (live()) { setPlaying(false); setOpen(null); }
  };

  // ── Gestures ─────────────────────────────────────────────────────────
  const goTo = async (spotId: string) => {
    stopPlay();
    setOpen(null);
    setError(null);
    const s = loader.stage.current;
    const x = currentDay();
    const spot = x?.spots.find((sp) => sp.id === spotId);
    if (!s || !x || !spot) return;
    const arrived = await s.flyTo(spot.pose);
    if (!alive.current) return;
    if (!arrived) {
      if (s.placeScale() === null) setError(d.flyFailed);
      return;
    }
    const list = spotMoments(x, spot.id);
    if (list.length === 0) return;
    if (!spotAt(x, spot.id, t)) setT(list[0]!.at);
    setOpen({ spotId: spot.id, photo: 0 });
  };

  const pinSpot = (): Spot | null => {
    const eye = loader.stage.current?.eye();
    const x = currentDay();
    if (!eye || !x) { setError(d.noEye); return null; }
    setError(null);
    return { id: newId('s'), name: fill(d.spotName, { n: x.spots.length + 1 }), pose: eye, createdAt: Date.now() };
  };

  const addFound = (found: Moment[]) => {
    if (found.length === 0) return;
    changeDay((x) => addMoments(x, found));
    setT(Math.max(...found.map((m) => m.at)));
    const spotId = found[0]!.spotId;
    if (spotId) setOpen({ spotId, photo: 0 });
  };

  const importFrom = async (from: ImportFrom, spotId: string | null) => {
    stopPlay();
    setError(null);
    if (from === 'phone') { setPhoneFor({ spotId }); return; }
    let dir: string | null = null;
    try { dir = await doors.selectFolder(); }
    catch (err) {
      console.warn('[lab-3d] day: the folder dialog failed:', err);
      setError(fill(d.importFailed, { detail: err instanceof Error ? err.message : String(err) }));
      return;
    }
    if (!dir || !alive.current) return;
    setBusy(true);
    try {
      const entries = await doors.readDir(dir);
      const found = await momentsOfFolder(dir, entries, spotId, Date.now(), photoUrl);
      if (!alive.current) return;
      if (found.length === 0) setError(d.folderEmpty);
      else addFound(found);
    } catch (err) {
      console.warn('[lab-3d] day: the folder could not be read:', err);
      if (alive.current) setError(fill(d.importFailed, { detail: err instanceof Error ? err.message : String(err) }));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  /** A closed phone series becomes a moment at `spotId`: from « Done », or picked up from the host's waiting list. */
  const takeSeries = async (series: { id?: string; dir: string; photos: number; startedAt: number | null }, spotId: string | null) => {
    setPhoneFor(null);
    if (series.id) setWaiting((ws) => ws.filter((x) => x.id !== series.id));
    setBusy(true);
    try {
      const m = await momentOfSeries(series, spotId, Date.now(), photoUrl);
      if (alive.current) addFound([m]);
    } catch (err) {
      console.warn('[lab-3d] day: the phone series could not be read:', err);
      if (alive.current) setError(fill(d.importFailed, { detail: err instanceof Error ? err.message : String(err) }));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const startDay = (o: ObjectEntry) => {
    const k = keptRef.current;
    if (k.state !== 'ready') return;
    const x = newDay(newId('day'), o.id, idName(o.id), Date.now());
    keep(withDay(k.days, x));
    setDayId(x.id);
    setT(Date.now());
  };

  const closeDay = () => {
    stopPlay();
    flush();
    setOpen(null);
    setPhoneFor(null);
    setError(null);
    loadedFor.current = null;
    loader.close();
    setDayId(null);
  };

  /** The open day is closed, then dropped from the days kept; its photos stay on disk. */
  const removeOpenDay = (id: string) => {
    closeDay();
    const k = keptRef.current;
    if (k.state === 'ready') keep(withoutDay(k.days, id));
  };

  // ── Screens ──────────────────────────────────────────────────────────
  const [size, setSize] = useState<GridSize>(() => readChoice(safeLocalStorage(), GRID_KEY, GRID_SIZES, 'medium'));
  const [filter, setFilter] = useState<Filter>(() => readChoice(safeLocalStorage(), FILTER_KEY, FILTERS, 'all'));
  const [removing, setRemoving] = useState<string | null>(null);
  const places = useMemo(() => (objects.state === 'ready' ? galleryGroups(groupVersions(objects.objects), 'places') : []), [objects]);
  const guide = guideOf({
    day, placeIds: places.map((p) => p.main.id), building: placeBuilding, ended: !!day && ended === day.id,
    now: Math.max(clock, ...(day?.moments.map((m) => m.at) ?? [])),
    // A day started on an older version of the newest place is that place's day: resumed, never doubled.
    days: kept.state === 'ready' ? kept.days.days.map((x) => (objects.state === 'ready' ? { ...x, placeId: mainVersionOf(objects.objects, x.placeId) } : x)) : [],
  });
  const newestPlace = guide.newest ? places.find((p) => p.main.id === guide.newest)?.main ?? null : null;
  const guideSpot = momentSpot && day?.spots.some((s) => s.id === momentSpot) ? momentSpot : guide.spotId;
  const canPhone = host !== null && hasCapability(host, PHONE_CAPABILITY);

  // Phone series closed without « Done »: the host closes one after 10 min without a photo, and
  // « Back » closes the open one. Their photos wait in the host's list; the guide picks them up.
  // Only series opened since the day began, used by no day, and not made into 3D (the tattoo's scan).
  const [waiting, setWaiting] = useState<PhoneSeries[]>([]);
  const objectsRef = useRef<ObjectEntry[]>([]);
  objectsRef.current = objects.state === 'ready' ? objects.objects : [];
  const watchSeries = enabled && canPhone && !!day && view.kind === 'ready' && !phoneFor;
  useEffect(() => {
    if (!watchSeries) return;
    let live = true;
    const read = () => {
      phoneDoors.status().then((st) => {
        const k = keptRef.current;
        const cur = currentDay();
        if (!live || k.state !== 'ready' || !cur) return;
        const used = phoneSeriesInDays(k.days);
        setWaiting((st?.series ?? []).filter((s) => s.photos > 0 && !!s.dir && s.startedAt !== null && s.startedAt >= cur.createdAt
          && !used.has(s.id) && !madeFrom(s.id, objectsRef.current)));
      }, (err: unknown) => console.warn('[lab-3d] day: the waiting phone series could not be read:', err));
    };
    // A series closed on leaving the phone screen lands in the list a moment later.
    const first = setTimeout(read, 1500);
    const every = setInterval(read, 60_000);
    return () => { live = false; clearTimeout(first); clearInterval(every); };
    // `currentDay` reads refs; the watch restarts with the day and the screens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchSeries, day?.id]);
  const labels: Record<LoadStep, string> = { read: w.objects.stepFetch, decode: w.stage.stepDecode, stage: w.stage.stepStage };
  const spotName = (id: string | null) => (id ? day?.spots.find((s) => s.id === id)?.name ?? '' : d.unplaced);

  // The place made again with the day's placed photos (doc 166 §16.y): a new version, then the job is shown.
  const completePlace = async (x: Day, placeId: string, quality: Quality) => {
    if (completing) return;
    const photos = placedPhotosOf(x);
    if (photos.length === 0) return;
    setError(null);
    setCompleting(true);
    try {
      await doors.complete(placeId, photos, quality);
      (onCreatePlace ?? onGoPlaces)?.();
    } catch (err) {
      console.warn('[lab-3d] day: the place was not completed:', err);
      if (alive.current) setError(isPermissionRefusal(err) ? w.create.refused : describeError(err instanceof Error ? err.message : String(err), w.create.errors));
    } finally {
      if (alive.current) setCompleting(false);
    }
  };

  let screen: ReactNode;
  if (host === null) {
    screen = <Notice scanning>{w.host.pending}</Notice>;
  } else if (!enabled) {
    screen = <NeedsMnemosyne w={w} />;
  } else if (kept.state === 'loading') {
    screen = <Notice scanning>{w.tabs.day}</Notice>;
  } else if (kept.state === 'error') {
    screen = (
      <Notice>
        <div className="error-line" role="alert">{fill(d.readFailed, { detail: kept.detail })}</div>
        <button onClick={() => setReadRound((r) => r + 1)}><Retry size={16} />{d.retry}</button>
      </Notice>
    );
  } else if (day && phoneFor) {
    screen = (
      <PaintingPhone w={w} platform={host.kind === 'mnemosyne' ? host.platform ?? null : null}
        texts={{ title: d.phoneTitle, hint: d.phoneHint, back: d.back }}
        onTaken={(series) => void takeSeries(series, phoneFor.spotId)} onCancel={() => setPhoneFor(null)} />
    );
  } else if (day && view.kind === 'loading') {
    screen = <LoadPanel title={view.name} label={w.tabs.day} steps={loadRail(view.at, false, view.took, view.readShare, labels, lang)} />;
  } else if (day && view.kind === 'failed') {
    const kind = failureKind(view.reason, view.at);
    const why = /NOT_FOUND/.test(view.reason) ? d.placeGone : kind === 'empty' ? w.stage.empty : fill(d.loadFailed, { detail: view.reason });
    screen = (
      <LoadPanel title={view.name} label={w.tabs.day} steps={loadRail(view.at, true, view.took, '', labels, lang)} error={why}
        action={<button onClick={closeDay}><ChevronLeft size={16} />{d.pickTitle}</button>} />
    );
  } else if (day && view.kind === 'ready') {
    const openSpot = open ? day.spots.find((s) => s.id === open.spotId) ?? null : null;
    screen = (
      <>
        <SpotMarkers stage={stage} spots={day.spots} lightOf={(id) => spotLight(day, id, t)} hideId={openSpot?.id ?? null} onPick={(s) => void goTo(s.id)} />
        <StageOverlay
          hint={d.hint}
          rows={[
            [d.place, day.placeName || idName(day.placeId)],
            [d.time, formatHour(t, lang)],
            [d.spots, String(day.spots.length), true],
            [d.moments, String(day.moments.length), true],
          ]}
          tools={(
            <>
              <ToolButton label={d.guide.show} on={guideShown} onClick={() => showGuide(!guideShown)}><Spark /></ToolButton>
              <ToolButton label={d.panel} on={panel} onClick={() => setPanel((p) => !p)}><Layers /></ToolButton>
              <ToolButton label={d.start} onClick={() => { stopPlay(); setOpen(null); loader.stage.current?.resetView(); }}><Target /></ToolButton>
              <ToolButton label={d.close} onClick={closeDay}><Close /></ToolButton>
            </>
          )}
        >
          {!openSpot && <WalkPad w={w} onHold={(h) => loader.stage.current?.setPad(h)} />}
          {guideShown && !openSpot && !playing && (
            <DayGuide w={w} lang={lang} guide={guide} where="stage" spots={day.spots} spotId={guideSpot} canPhone={canPhone} busy={busy}
              placedPhotos={placedPhotosOf(day).length} completing={completing} building={placeBuilding}
              onComplete={shownPlace ? (q) => void completePlace(day, shownPlace, q) : undefined}
              // The panel says the error itself when it is open: once is enough.
              error={panel ? null : error}
              waitingPhotos={waiting[0]?.photos ?? 0} canReplay={playOrder(day).length > 0} note={noteText(placeNote, d)}
              onSpot={setMomentSpot}
              onPinSpot={() => { const s = pinSpot(); if (s) changeDay((x) => addSpot(x, s)); }}
              onMoment={(from) => void importFrom(from, guideSpot)}
              onTakeWaiting={() => { const s = waiting[0]; if (s?.dir) void takeSeries({ ...s, dir: s.dir }, guideSpot); }}
              onEnd={(on) => setEnded(on ? day.id : null)}
              onRemoveDay={() => removeOpenDay(day.id)}
              onScan={onCreateObject}
              onReplay={() => void play()} />
          )}
          {/* Neither the guide nor the panel on screen: what failed is still said, over the scene. */}
          {error && !panel && !(guideShown && !openSpot && !playing) && <div className="day-alert error-line" role="alert">{error}</div>}
          {openSpot && (
            <PhotoView w={w} lang={lang} day={day} spot={openSpot} t={t} photo={open!.photo}
              onPhoto={(i) => setOpen({ spotId: openSpot.id, photo: i })} onJump={(x) => setT(x)}
              onClose={() => { stopPlay(); setOpen(null); }}
              onRetime={(mid, hhmm) => {
                const x = currentDay();
                const moved = x ? retimeMoment(x, mid, hhmm) : null;
                if (!moved) return;
                changeDay(() => moved);
                // The hour follows the moment: the photo on screen stays the one corrected.
                const m = moved.moments.find((y) => y.id === mid);
                if (m) setT(m.at);
              }}
              onRemove={(mid) => changeDay((x) => removeMoment(x, mid))} />
          )}
          {panel && (
            <DayPanel w={w} lang={lang} day={day} busy={busy} error={error} canPhone={canPhone}
              onAddSpot={() => { const s = pinSpot(); if (s) changeDay((x) => addSpot(x, s)); }}
              onRename={(id, name) => changeDay((x) => renameSpot(x, id, name))}
              onGo={(id) => void goTo(id)}
              onRemoveSpot={(id) => { if (open?.spotId === id) setOpen(null); changeDay((x) => removeSpot(x, id)); }}
              onImport={(from, spotId) => void importFrom(from, spotId)}
              onPlace={(mid, sid) => changeDay((x) => placeMoment(x, mid, sid))}
              onPlaceHere={(mid) => { const s = pinSpot(); if (s) changeDay((x) => placeMoment(addSpot(x, s), mid, s.id)); }}
              onRemoveMoment={(mid) => changeDay((x) => removeMoment(x, mid))}
              onRetime={(mid, hhmm) => changeDay((x) => retimeMoment(x, mid, hhmm) ?? x)} />
          )}
          <Timeline w={w} lang={lang} range={range} t={t} moments={sortedMoments(day)} spotName={spotName}
            playing={playing} canPlay={playOrder(day).length > 0}
            onScrub={(x) => { if (playing) stopPlay(); setT(x); setOpen((o) => (o ? { ...o, photo: 0 } : o)); }}
            onPick={(m) => { setT(m.at); if (m.spotId) void goTo(m.spotId); else setPanel(true); }}
            onPlay={() => void play()} onStop={stopPlay} />
        </StageOverlay>
      </>
    );
  } else if (day) {
    // The place is asked: its load starts on the next effect.
    screen = <Notice scanning>{day.placeName}</Notice>;
  } else if (objects.state === 'loading') {
    screen = <Notice scanning>{w.objects.loading}</Notice>;
  } else if (objects.state === 'error') {
    screen = (
      <Notice>
        <div className="error-line" role="alert">{objects.refused ? w.objects.refused : fill(w.objects.unreadable, { detail: objects.detail })}</div>
        <button onClick={retryObjects}><Retry size={16} />{w.objects.retry}</button>
      </Notice>
    );
  } else {
    const days = kept.days.days;
    screen = (
      <div className="pane day-pick">
        <DayGuide w={w} lang={lang} guide={guide} where="pick" newestName={newestPlace ? idName(newestPlace.id) : ''}
          onFilmPlace={onCreatePlace ?? onGoPlaces} onSeeBuilding={onCreatePlace ?? onGoPlaces}
          onStartDay={() => { if (newestPlace) startDay(newestPlace); }}
          onResume={() => { if (guide.resumeId) { setDayId(guide.resumeId); setT(Date.now()); } }} />
        {days.length > 0 && (
          <HudPanel title={d.kept} className="day-kept">
            <ul>
              {days.map((x) => (
                <li key={x.id}>
                  <strong>{x.placeName || idName(x.placeId)}</strong>
                  <span className="minor">{new Date(x.createdAt).toLocaleDateString(lang)} · {fill(pluralOf(x.moments.length, lang, d.momentOne, d.momentsN), { n: x.moments.length })}</span>
                  <span className="spot-actions">
                    <button className="primary" onClick={() => { setDayId(x.id); setT(Date.now()); }}>{d.open}</button>
                    {removing === x.id ? (
                      <>
                        <span className="minor">{d.removeSure}</span>
                        <button className="danger" onClick={() => { setRemoving(null); keep(withoutDay(kept.days, x.id)); }}>{d.removeYes}</button>
                        <button onClick={() => setRemoving(null)}>{d.keep}</button>
                      </>
                    ) : <button onClick={() => setRemoving(x.id)}>{d.removeDay}</button>}
                  </span>
                </li>
              ))}
            </ul>
          </HudPanel>
        )}
        {places.length > 0 && (
          <>
            <p className="decor-note day-pick-line">{d.guide.orPick}</p>
            <Library groups={places} w={w} lang={lang} title={d.pickTitle} onOpen={startDay} showScope={false}
              onRemove={(g) => removeGroup(g, retryObjects)}
              size={size} onSize={(s) => { setSize(s); writeChoice(safeLocalStorage(), GRID_KEY, s); }}
              filter={filter} onFilter={(f) => { setFilter(f); writeChoice(safeLocalStorage(), FILTER_KEY, f); }} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`stage-wrap day-stage${panel ? ' with-panel' : ''}`}>
      <div ref={loader.hostRef} className="stage" style={{ visibility: day && view.kind === 'ready' && !phoneFor ? 'visible' : 'hidden' }} />
      {screen}
    </div>
  );
}

/** What the guide says of the placement of the last moment, or nothing. */
function noteText(note: PlaceNote | null, d: Dict['day']): string | null {
  if (!note) return null;
  if (note.kind === 'placing') return d.placing;
  if (note.kind === 'waitingClick') return d.placeWaitClick;
  if (note.kind === 'failed') return fill(d.placeFailed, { detail: note.detail });
  return note.placed === 0 ? d.placedNone : fill(d.placedN, { n: note.placed, total: note.total });
}
