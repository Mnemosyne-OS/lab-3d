/**
 * DecorTab — an object made in Mnemosyne OS, put in front of a décor (doc
 * 163, « the décor »): the stage on one side, on the other the guide's lit
 * rail (object, décor, framing), the objects alone to choose from, and the
 * décors. The person turns the object, places it with a right-drag, sizes it
 * with the wheel; where the camera is left is kept for this object in this
 * décor. When the décor's depth can be read on this machine (local, no
 * credit), it is laid in relief: the room moves behind the object as it
 * turns, within RELIEF_TURN_DEG of the view it was built from. A switch puts
 * it flat again, remembered. Outside Mnemosyne it says what it needs.
 *
 * @module features/decor/DecorTab
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EMPTY_DECOR_STATE, addDecor, chooseDecor, forgetDecor, framingKey, keepFraming, type DecorPreset, type DecorQuality, type DecorState, type Framing } from '../../core/decorModel';
import { groupVersions, idName, type ObjectEntry } from '../../core/model';
import { doors } from '../../host/doors';
import { inMnemosyne, type HostState } from '../../host/hostState';
import { useFileUrl } from '../../host/useHostFiles';
import { fill, type Dict } from '../../i18n/words';
import { readChoice, safeLocalStorage, writeChoice } from '../../lib/choiceStore';
import { RELIEF_TURN_DEG } from '../../core/reliefModel';
import { readDepthPicture } from '../../engine/relief';
import { describeError } from '../create/createModel';
import { formatCount } from '../../lib/format';
import { HudPanel } from '../../ui/HudPanel';
import { Check, Cube, Orbit, Relief, Retry, Target } from '../../ui/Icon';
import { NeedsMnemosyne } from '../../ui/NeedsMnemosyne';
import { Notice } from '../../ui/Notice';
import { StepRail } from '../../ui/StepRail';
import { useObjects } from '../objects/useObjects';
import { loadScene } from '../objects/sceneLoad';
import { failureKind, loadRail, type LoadStep } from '../stage/loadModel';
import { LoadPanel } from '../stage/LoadPanel';
import { StageOverlay, ToolButton } from '../stage/StageOverlay';
import { useSceneLoader } from '../stage/useSceneLoader';
import { DecorPanel, type DecorListState } from './DecorPanel';
import { decorDepthPicture, decorPicture, depthReady, drawDecor, pickedDecor, readDecorState, writeDecorState } from './decorStore';
import { decorKeyOf, decorName, guideRail, objectsAlone, type GuideState } from './decorTabModel';

const OBJECT_KEY = 'lab3d.decorObject';
const RELIEF_KEY = 'lab3d.relief';

/**
 * Where the shown décor's relief stands: off (switched off by the person),
 * idle (flat, nothing to say: no décor, or a host that cannot tell), the
 * image engine or the depth model not on this machine, being read, on, or
 * failed (the host's words).
 */
type ReliefState = 'off' | 'idle' | 'noEngine' | 'missing' | 'reading' | 'on' | { error: string };
/** A placement is written this long after the person stops moving the camera. */
const FRAMING_SAVE_MS = 500;
/** Where « Choose a picture » opens: the folder Mnemosyne writes its pictures to, under the home. */
const PICTURES_START_IN = '.mnemosyne/generations';

export function DecorTab({ w, lang, host, refreshKey = 0, active = true }: {
  w: Dict; lang: string; host: HostState | null; refreshKey?: number;
  /** Whether the tab is the one shown. Nothing is asked or loaded before it was opened once. */
  active?: boolean;
}) {
  // A hidden tab stays mounted: without this, every start of the app would read the
  // library and the décors, download the remembered object and make a WebGL context, for nobody.
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const enabled = host !== null && inMnemosyne(host) && opened;
  const { objects, retry } = useObjects(enabled, refreshKey);
  const groups = useMemo(() => (objects.state === 'ready' ? objectsAlone(groupVersions(objects.objects)) : []), [objects]);
  const [objectId, setObjectId] = useState<string | null>(() => {
    try { return safeLocalStorage()?.getItem(OBJECT_KEY) ?? null; } catch (err) { console.warn('[lab-3d] remembered object unreadable:', err); return null; }
  });
  const loader = useSceneLoader<ObjectEntry>();
  const { view } = loader;
  const [rotate, setRotate] = useState(false);
  const [decors, setDecors] = useState<DecorState>(EMPTY_DECOR_STATE);
  const [list, setList] = useState<DecorListState>('loading');
  const [decorView, setDecorView] = useState<{ state: GuideState['decor']; error: string | null }>({ state: 'none', error: null });
  // Wanted by default, and remembered: a person who compared and preferred flat keeps flat.
  const [reliefWanted, setReliefWanted] = useState(() => readChoice(safeLocalStorage(), RELIEF_KEY, ['on', 'off'] as const, 'on') === 'on');
  const [relief, setRelief] = useState<ReliefState>('idle');
  const [depthBytes, setDepthBytes] = useState<number | null>(null);
  const decorsRef = useRef(decors);
  decorsRef.current = decors;
  const listRef = useRef(list);
  listRef.current = list;

  // The chosen object, if it is still an object alone in the library (a remembered one may be gone).
  const entry = groups.find((g) => g.main.id === objectId)?.main ?? null;
  const key = entry ? decorKeyOf(entry) : null;
  const chosen = key ? decors.chosen[key] ?? null : null;
  const grounded = view.kind === 'ready' && view.info.grounded;

  const readList = useCallback(() => {
    setList('loading');
    void readDecorState().then((r) => {
      if (r.ok) { decorsRef.current = r.state; setDecors(r.state); setList('ready'); }
      else setList({ error: r.error });
    });
  }, []);
  useEffect(() => { if (enabled) readList(); }, [enabled, readList]);

  /**
   * Change what is kept, here and on disk, from what is kept at that moment.
   * Until the kept décors were read nothing is written: an empty list written
   * then would replace them.
   */
  const keep = useCallback((change: (s: DecorState) => DecorState) => {
    if (listRef.current !== 'ready') return;
    const next = change(decorsRef.current);
    decorsRef.current = next;
    setDecors(next);
    void writeDecorState(next);
  }, []);

  // The chosen object goes on stage, standing on its floor.
  const entryId = entry?.id ?? null;
  useEffect(() => {
    if (!entry) return;
    void loader.load(
      idName(entry.id),
      async (onBytes) => {
        const scene = await loadScene(entry.id, (share) => onBytes(share, 1));
        if (!scene.ok) throw new Error(scene.error);
        return { bytes: scene.bytes, fileName: scene.fileName, opts: { rig: scene.rig, floor: true }, meta: entry };
      },
      (s) => s.setAutoRotate(rotate),
    );
    // Loaded again only when the object changes, not when the library is read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  // The chosen décor goes behind the object once it stands on its floor.
  useEffect(() => {
    const stage = loader.stage.current;
    if (!grounded || !stage || !key) {
      // Nothing is behind an object that is loading or has no floor, whatever is remembered.
      setDecorView((d) => (d.state === 'none' && d.error === null ? d : { state: 'none', error: null }));
      return;
    }
    let cancelled = false;
    if (!chosen) {
      void stage.setBackdrop(null, null).then(() => { if (!cancelled) setDecorView({ state: 'none', error: null }); });
      return () => { cancelled = true; };
    }
    setDecorView({ state: 'loading', error: null });
    const framing = decorsRef.current.framing[framingKey(key, chosen)] ?? null;
    decorPicture(chosen)
      .then((url) => stage.setBackdrop(url, framing))
      .then((applied) => { if (!cancelled && applied) setDecorView({ state: 'shown', error: null }); })
      .catch((err: unknown) => {
        console.warn('[lab-3d] décor not shown:', chosen, err);
        if (cancelled) return;
        setDecorView({ state: 'failed', error: err instanceof Error ? err.message : String(err) });
        void stage.setBackdrop(null, null);
      });
    return () => { cancelled = true; };
    // `view` is in the deps so a new load (a new stage scene) re-applies the décor.
  }, [grounded, chosen, key, view, loader.stage]);

  // The décor shown is laid on its depth when wanted and possible; flat otherwise, and why is said.
  useEffect(() => {
    const stage = loader.stage.current;
    if (decorView.state !== 'shown' || !stage || !chosen) {
      setRelief((r) => (r === 'idle' ? r : 'idle'));
      return;
    }
    if (!reliefWanted) {
      stage.setRelief(null);
      setRelief('off');
      return;
    }
    let cancelled = false;
    setRelief('idle');
    void (async () => {
      const depth = await depthReady();
      if (cancelled) return;
      if (depth.state === 'noEngine') { setRelief('noEngine'); return; }
      if (depth.state === 'missing') { setDepthBytes(depth.downloadBytes); setRelief('missing'); return; }
      // A host from before the relief: the décor stays flat, and nothing is said about a door it lacks.
      if (depth.state === 'unknown') return;
      setRelief('reading');
      try {
        const grey = await readDepthPicture(await decorDepthPicture(chosen));
        if (cancelled) return;
        setRelief(stage.setRelief(grey) ? 'on' : 'idle');
      } catch (err) {
        console.warn('[lab-3d] the décor stays flat, its depth was not read:', chosen, err);
        if (!cancelled) setRelief({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [decorView.state, chosen, reliefWanted, loader.stage]);

  const switchRelief = () => {
    const on = !reliefWanted;
    setReliefWanted(on);
    writeChoice(safeLocalStorage(), RELIEF_KEY, on ? 'on' : 'off');
  };

  const openImageSettings = () => {
    doors.openSettings('theia').catch((err: unknown) => {
      console.warn('[lab-3d] Settings › Images did not open:', err);
      setRelief({ error: err instanceof Error ? err.message : String(err) });
    });
  };

  // Where the person leaves the camera is kept for this object in this décor, taken at the gesture's end.
  useEffect(() => {
    const stage = loader.stage.current;
    if (decorView.state !== 'shown' || !stage || !key || !chosen) return;
    let pending: (() => void) | null = null;
    let timer: number | null = null;
    const flush = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      const save = pending;
      pending = null;
      save?.();
    };
    stage.setViewListener((f: Framing) => {
      pending = () => keep((s) => keepFraming(s, key, chosen, f));
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(flush, FRAMING_SAVE_MS);
    });
    // A placement released just before the décor or the object changes is written, not dropped.
    return () => { stage.setViewListener(null); flush(); };
  }, [decorView.state, key, chosen, keep, loader.stage]);

  const pickObject = (id: string) => {
    setObjectId(id);
    writeChoice(safeLocalStorage(), OBJECT_KEY, id);
  };

  const onDraw = async (place: string, preset: DecorPreset | null, quality: DecorQuality) => {
    const el = loader.hostRef.current;
    const made = await drawDecor(place, preset, quality, { width: el?.clientWidth || 1600, height: el?.clientHeight || 900 });
    // Added to what is kept NOW: choices and placements made while it drew stay.
    const k = key;
    keep((s) => (k ? chooseDecor(addDecor(s, made), k, made.path) : addDecor(s, made)));
    return made;
  };

  const onPick = async () => {
    const path = await doors.selectImage(w.decor.pictures, PICTURES_START_IN);
    // The dialog was closed: nothing to add, nothing to say.
    if (!path) return;
    const k = key;
    keep((s) => (k ? chooseDecor(addDecor(s, pickedDecor(path)), k, path) : addDecor(s, pickedDecor(path))));
  };

  const labels: Record<LoadStep, string> = { read: w.objects.stepFetch, decode: w.stage.stepDecode, stage: w.stage.stepStage };
  const chosenEntry = chosen ? decors.decors.find((d) => d.path === chosen) ?? null : null;
  const guide: GuideState = {
    object: !entry ? 'none' : view.kind === 'ready' ? (view.info.grounded ? 'ready' : 'noFloor') : view.kind === 'failed' ? 'failed' : 'loading',
    decor: chosen ? decorView.state : 'none',
    framed: !!(key && chosen && decors.framing[framingKey(key, chosen)]),
  };

  if (host === null) return <div className="stage-wrap"><Notice scanning>{w.host.pending}</Notice></div>;
  if (!enabled) return <div className="stage-wrap"><NeedsMnemosyne w={w} /></div>;

  let stageScreen: ReactNode = null;
  if (!entry) {
    stageScreen = <Notice><span className="notice-mark" aria-hidden><Cube size={30} /></span><div className="drop-title">{w.decor.pickObject}</div></Notice>;
  } else if (view.kind === 'loading') {
    stageScreen = <LoadPanel title={view.name} label={w.decor.panel} steps={loadRail(view.at, false, view.took, view.readShare, labels, lang)} />;
  } else if (view.kind === 'failed') {
    const kind = failureKind(view.reason, view.at);
    stageScreen = <LoadPanel title={view.name} label={w.decor.panel} steps={loadRail(view.at, true, view.took, '', labels, lang)}
      error={kind === 'empty' ? w.stage.empty : fill(kind === 'read' ? w.objects.fetchFailed : w.stage.decodeFailed, { detail: view.reason })} />;
  } else if (view.kind === 'ready') {
    const inDecor = decorView.state === 'shown';
    stageScreen = (
      <StageOverlay
        hint={inDecor && relief === 'on' ? fill(w.decor.hintRelief, { deg: RELIEF_TURN_DEG }) : w.decor.hint}
        rows={[
          [w.decor.object, view.name],
          [w.stage.points, formatCount(view.info.splats, lang)],
          // What is behind the object now, never what is remembered for it.
          [w.decor.decor, chosenEntry && decorView.state === 'shown' ? decorName(chosenEntry, w.decor.presets, w.decor.picked) : w.decor.none],
          ...(inDecor ? [[w.decor.relief, relief === 'on' ? fill(w.decor.reliefShort, { deg: RELIEF_TURN_DEG }) : w.decor.flat] as const] : []),
        ]}
        tools={(
          <>
            <ToolButton label={w.stage.rotate} on={rotate} onClick={() => { const on = !rotate; setRotate(on); loader.stage.current?.setAutoRotate(on); }}><Orbit /></ToolButton>
            {inDecor && <ToolButton label={w.decor.relief} on={reliefWanted} onClick={switchRelief}><Relief /></ToolButton>}
            <ToolButton label={w.stage.reset} onClick={() => loader.stage.current?.resetView()}><Target /></ToolButton>
          </>
        )}
      />
    );
  }

  return (
    <div className={`decor-layout${entry ? '' : ' idle'}`}>
      <div className="decor-stage">
        <div ref={loader.hostRef} className="stage" style={{ visibility: view.kind === 'ready' ? 'visible' : 'hidden' }} />
        {stageScreen}
      </div>
      <aside className="decor-side" aria-label={w.decor.panel}>
        <HudPanel index="04" title={w.decor.panel}>
          <StepRail label={w.decor.panel} steps={guideRail(guide, { object: w.decor.object, decor: w.decor.decor, scene: w.decor.scene }, {
            object: view.kind === 'ready' ? formatCount(view.info.splats, lang) : undefined,
            decor: chosenEntry ? decorName(chosenEntry, w.decor.presets, w.decor.picked) : undefined,
            scene: guide.framed ? w.decor.framed : undefined,
          })} />
          {decorView.error && <div className="error-line" role="alert">{fill(w.decor.readError, { error: decorView.error })}</div>}
        </HudPanel>

        <HudPanel title={w.decor.object}>
          {objects.state === 'loading' && <p className="decor-note">{w.objects.loading}</p>}
          {objects.state === 'error' && (
            <p className="error-line" role="alert">
              {objects.refused ? w.objects.refused : fill(w.objects.unreadable, { detail: objects.detail })} <button onClick={retry}><Retry size={14} />{w.objects.retry}</button>
            </p>
          )}
          {objects.state === 'ready' && groups.length === 0 && <p className="decor-note">{w.decor.noObjects} · {w.decor.noObjectsHint}</p>}
          {groups.length > 0 && (
            <div className="object-strip" role="radiogroup" aria-label={w.decor.pickObject}>
              {groups.map((g) => <ObjectChip key={g.key} o={g.main} chosen={g.main.id === objectId} onPick={() => pickObject(g.main.id)} />)}
            </div>
          )}
        </HudPanel>

        {entry && view.kind === 'ready' && (
          <HudPanel title={w.decor.decor}>
            {grounded
              ? <DecorPanel w={w} lang={lang} state={decors} list={list} chosen={chosen} onRetry={readList}
                  onChoose={(path) => { if (key) keep((s) => chooseDecor(s, key, path)); }}
                  onForget={(path) => keep((s) => forgetDecor(s, path))}
                  onPick={onPick} onDraw={onDraw} />
              : <p className="decor-note">{w.decor.noFloor}</p>}
            {grounded && <ReliefNote w={w} relief={relief} depthBytes={depthBytes} onOpenSettings={openImageSettings} />}
          </HudPanel>
        )}
      </aside>
    </div>
  );
}

/** What the relief is doing, in one line: nothing when flat by choice or with nothing to say. */
function ReliefNote({ w, relief, depthBytes, onOpenSettings }: { w: Dict; relief: ReliefState; depthBytes: number | null; onOpenSettings: () => void }) {
  if (relief === 'off' || relief === 'idle') return null;
  if (relief === 'reading') return <p className="decor-note">{w.decor.reliefReading}</p>;
  if (relief === 'on') return <p className="decor-note relief-on">{fill(w.decor.reliefOn, { deg: RELIEF_TURN_DEG })}</p>;
  if (relief === 'noEngine' || relief === 'missing') {
    const line = relief === 'noEngine' ? w.decor.reliefNoEngine
      : depthBytes ? fill(w.decor.reliefMissing, { mb: Math.round(depthBytes / 1e6) }) : w.decor.reliefMissingNoSize;
    return (
      <p className="decor-note">
        {line} <button onClick={onOpenSettings}>{w.decor.openImageSettings}</button>
      </p>
    );
  }
  return <p className="error-line" role="alert">{fill(w.decor.reliefError, { error: describeError(relief.error, w.decor.reliefErrors) })}</p>;
}

/** One object alone to put in a décor: its picture and name, green when chosen. */
function ObjectChip({ o, chosen, onPick }: { o: ObjectEntry; chosen: boolean; onPick: () => void }) {
  const { url } = useFileUrl(o.id, o.thumb);
  const name = idName(o.id);
  return (
    <button role="radio" aria-checked={chosen} className={`object-chip${chosen ? ' chosen' : ''}`} title={name} onClick={onPick}>
      <span className="object-chip-pic">{url ? <img src={url} alt="" draggable={false} /> : <Cube size={20} />}</span>
      <span className="object-chip-name">{name}</span>
      {chosen && <span className="choice-check" aria-hidden><Check size={12} /></span>}
    </button>
  );
}
