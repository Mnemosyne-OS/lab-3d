/**
 * ObjectsTab — one gallery of what was made in Mnemosyne OS (the folder
 * Objets 3D fills): the objects, or the places (doc 166 §14.2), each with its
 * own Create button. Then one on stage: it opens on a viewpoint the person
 * filmed, turns around the scene's real vertical, and an object cut out of
 * its video stands on a floor at its measured base. A scene or a place can be
 * walked through instead (doc 166 §14); a place opens inside. Outside
 * Mnemosyne it says what it needs.
 *
 * @module features/objects/ObjectsTab
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { groupVersions, idDate, idName, type ObjectEntry } from '../../core/model';
import { inMnemosyne, type HostState } from '../../host/hostState';
import { fill, type Dict } from '../../i18n/words';
import { readChoice, safeLocalStorage, writeChoice } from '../../lib/choiceStore';
import { formatBytes, formatCount, formatMs } from '../../lib/format';
import type { StageMode } from '../../engine/SplatStage';
import { ChevronLeft, ChevronRight, Close, Cube, Orbit, Retry, Spark, Target, Walk } from '../../ui/Icon';
import { NeedsMnemosyne } from '../../ui/NeedsMnemosyne';
import { Notice } from '../../ui/Notice';
import { failureKind, loadRail, type LoadStep } from '../stage/loadModel';
import { LoadPanel } from '../stage/LoadPanel';
import { StageOverlay, ToolButton } from '../stage/StageOverlay';
import { useSceneLoader } from '../stage/useSceneLoader';
import { WalkPad } from '../stage/WalkPad';
import { Library } from './Library';
import { FILTERS, FILTER_KEY, GRID_SIZES, GRID_SIZE_KEY, galleryGroups, galleryKey, type Filter, type Gallery, type GridSize } from './libraryModel';
import { loadScene } from './sceneLoad';
import { useObjects } from './useObjects';

export function ObjectsTab({ w, lang, host, gallery = 'objects', refreshKey = 0, openId = null, onOpenHandled, active = true, onCreate, jobLive = false }: {
  w: Dict; lang: string; host: HostState | null;
  /** Which gallery: the objects, or the places. */
  gallery?: Gallery;
  /** Bumped when an object was made elsewhere (the Create tab): the library is read again. */
  refreshKey?: number;
  /** An object to put on stage as soon as the library lists it (« look at it » after a job). */
  openId?: string | null;
  onOpenHandled?: () => void;
  /** Whether the tab is the one shown. The library is not asked before it was opened once. */
  active?: boolean;
  /** Open this gallery's Create view; no button without it. */
  onCreate?: () => void;
  /** A job of this gallery is being made: the button says so, and leads to it. */
  jobLive?: boolean;
}) {
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const enabled = host !== null && inMnemosyne(host) && opened;
  const { objects, retry } = useObjects(enabled, refreshKey);
  const loader = useSceneLoader<ObjectEntry>();
  const { view } = loader;
  const sizeKey = galleryKey(GRID_SIZE_KEY, gallery);
  const [size, setSize] = useState<GridSize>(() => readChoice(safeLocalStorage(), sizeKey, GRID_SIZES, 'medium'));
  const [filter, setFilter] = useState<Filter>(() => readChoice(safeLocalStorage(), FILTER_KEY, FILTERS, 'all'));
  const [rotate, setRotate] = useState(false);
  // The filmed view stepped to; null: the one the stage opened on (a visit starts on the best-covered one).
  const [viewAt, setViewAt] = useState<number | null>(null);
  // The mode the person switched to on this object; null: as it was staged.
  const [modeAsked, setModeAsked] = useState<StageMode | null>(null);
  const groups = useMemo(() => (objects.state === 'ready' ? galleryGroups(groupVersions(objects.objects), gallery) : []), [objects, gallery]);
  const galleryName = w.tabs[gallery];
  const createButton = onCreate && (
    <button className="primary" onClick={onCreate}>
      {jobLive ? <span className="live-dot" aria-hidden /> : <Spark size={16} />}
      {jobLive ? w.create.jobRunning : gallery === 'places' ? w.create.newPlace : w.create.newObject}
    </button>
  );

  const labels: Record<LoadStep, string> = { read: w.objects.stepFetch, decode: w.stage.stepDecode, stage: w.stage.stepStage };
  // The id asked from outside: opened once listed; a list without it is read once more, then given up.
  const retriedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!openId || objects.state !== 'ready') return;
    const entry = objects.objects.find((o) => o.id === openId);
    if (entry) {
      onOpenHandled?.();
      open(entry);
    } else if (retriedFor.current !== openId) {
      retriedFor.current = openId;
      retry();
    } else {
      console.warn('[lab-3d] the object to open is not in the library:', openId);
      onOpenHandled?.();
    }
    // `open` and `retry` are rebuilt each render; the effect runs on what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, objects]);

  const open = (o: ObjectEntry) => {
    setViewAt(null);
    setModeAsked(null);
    void loader.load(
      idName(o.id),
      async (onBytes) => {
        const scene = await loadScene(o.id, (share) => onBytes(share, 1));
        if (!scene.ok) throw new Error(scene.error);
        // A place is visited from inside; what the manifest says wins over the library's line.
        const scope = scene.scope ?? o.scope ?? null;
        return { bytes: scene.bytes, fileName: scene.fileName, opts: { rig: scene.rig, floor: scope === 'object', walk: scope === 'place' }, meta: { ...o, scope } };
      },
      (s) => s.setAutoRotate(rotate),
    );
  };

  const step = (delta: number) => {
    const at = loader.stage.current?.stepViewpoint(delta);
    if (at !== null && at !== undefined) setViewAt(at);
  };

  const failure = (reason: string, at: number): string => {
    const kind = failureKind(reason, at);
    return kind === 'empty' ? w.stage.empty : fill(kind === 'read' ? w.objects.fetchFailed : w.stage.decodeFailed, { detail: reason });
  };

  let screen: ReactNode;
  if (host === null) {
    screen = <Notice scanning>{w.host.pending}</Notice>;
  } else if (!enabled) {
    screen = <NeedsMnemosyne w={w} />;
  } else if (view.kind === 'loading') {
    screen = <LoadPanel title={view.name} label={galleryName} steps={loadRail(view.at, false, view.took, view.readShare, labels, lang)} />;
  } else if (view.kind === 'failed') {
    screen = (
      <LoadPanel title={view.name} label={galleryName} steps={loadRail(view.at, true, view.took, '', labels, lang)}
        error={failure(view.reason, view.at)}
        action={<button onClick={loader.close}><ChevronLeft size={16} />{galleryName}</button>} />
    );
  } else if (view.kind === 'ready') {
    const o = view.meta;
    const date = idDate(o.id);
    const n = view.info.viewpoints;
    const mode = modeAsked ?? view.info.mode;
    const walking = mode === 'walk';
    // Walking around an object alone shows nothing more than turning it.
    const walkable = view.info.walkable && o.scope !== 'object';
    screen = (
      <StageOverlay
        hint={walking ? w.stage.walkHint : w.stage.hint}
        rows={[
          [o.scope === 'place' ? w.objects.placeName : w.objects.name, view.name],
          [w.objects.date, date ? date.toLocaleDateString(lang) : '—', true],
          [w.objects.quality, o.quality ? (o.quality === 'full' ? w.objects.full : w.objects.quick) : '—', true],
          [w.stage.points, formatCount(view.info.splats, lang), true],
          [w.stage.size, formatBytes(o.sceneBytes, lang), true],
          // The arc around the middle of a place is no measure of it: not said.
          ...(o.scope === 'place' ? [] : [[w.objects.coverage, o.coverageDeg !== null ? `${o.coverageDeg}°` : '—'] as const]),
          [w.objects.viewpoint, n > 0 ? `${(viewAt ?? view.info.viewAt) + 1} / ${n}` : '—'],
          [w.stage.time, formatMs(view.ms, lang), true],
        ]}
        tools={(
          <>
            {walkable && (
              <ToolButton label={w.stage.walk} on={walking}
                onClick={() => { const m = loader.stage.current?.setMode(walking ? 'orbit' : 'walk'); if (m) setModeAsked(m); }}><Walk /></ToolButton>
            )}
            {!walking && <ToolButton label={w.stage.rotate} on={rotate} onClick={() => { const on = !rotate; setRotate(on); loader.stage.current?.setAutoRotate(on); }}><Orbit /></ToolButton>}
            {n > 1 && <ToolButton label={w.objects.prevView} onClick={() => step(-1)}><ChevronLeft /></ToolButton>}
            {n > 1 && <ToolButton label={w.objects.nextView} onClick={() => step(1)}><ChevronRight /></ToolButton>}
            <ToolButton label={walking ? w.stage.walkStart : n > 0 ? w.objects.firstView : w.stage.reset}
              onClick={() => { const s = loader.stage.current; s?.resetView(); setViewAt(s?.viewIndex ?? 0); }}><Target /></ToolButton>
            <ToolButton label={w.stage.close} onClick={loader.close}><Close /></ToolButton>
          </>
        )}
      >
        {walking && <WalkPad w={w} onHold={(h) => loader.stage.current?.setPad(h)} />}
      </StageOverlay>
    );
  } else if (objects.state === 'loading') {
    screen = <Notice scanning>{w.objects.loading}</Notice>;
  } else if (objects.state === 'error') {
    screen = (
      <Notice>
        <div className="error-line" role="alert">{objects.refused ? w.objects.refused : fill(w.objects.unreadable, { detail: objects.detail })}</div>
        <button onClick={retry}><Retry size={16} />{w.objects.retry}</button>
      </Notice>
    );
  } else if (groups.length === 0) {
    screen = (
      <Notice>
        <span className="notice-mark" aria-hidden>{gallery === 'places' ? <Walk size={30} /> : <Cube size={30} />}</span>
        <div className="drop-title">{gallery === 'places' ? w.objects.emptyPlaces : w.objects.empty}</div>
        {createButton}
      </Notice>
    );
  } else {
    screen = (
      <div className="pane">
        <Library groups={groups} w={w} lang={lang} title={galleryName} onOpen={open} action={createButton} showScope={gallery === 'objects'}
          size={size} onSize={(s) => { setSize(s); writeChoice(safeLocalStorage(), sizeKey, s); }}
          filter={filter} onFilter={(f) => { setFilter(f); writeChoice(safeLocalStorage(), FILTER_KEY, f); }} />
      </div>
    );
  }

  return (
    <div className="stage-wrap">
      <div ref={loader.hostRef} className="stage" style={{ visibility: view.kind === 'ready' ? 'visible' : 'hidden' }} />
      {screen}
    </div>
  );
}
