/**
 * CompareTab — two dates of one place or thing (doc 163 §6, doc 166 lot 6).
 * The person picks two objects on a timeline of the dates they were FILMED;
 * the earlier is the reference. The host puts them in one frame and measures
 * how well (about a minute of the graphics card, on a click); the numbers and
 * the verdict are always shown, and a « not aligned » pair is never overlaid:
 * it would look aligned when it is not. An aligned pair goes on stage.
 *
 * One kind at a time (doc 166 §14.3): the objects, or the places. A walked
 * flat never pairs with a vase; when both kinds exist a switch says which
 * one the timeline shows, remembered.
 *
 * @module features/compare/CompareTab
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ALIGN_RUNNING, canOverlay, dateOf, dayKey, daysApart, friseGroups, hasAlignment, orderPair,
  type AlignJob, type Alignment, type FriseGroup,
} from '../../core/compareModel';
import { clock, idName, readWhole, scopeWord, type ObjectEntry } from '../../core/model';
import { doors, isPermissionRefusal } from '../../host/doors';
import { inMnemosyne, type HostState } from '../../host/hostState';
import { fill, type Dict } from '../../i18n/words';
import { readChoice, safeLocalStorage, writeChoice } from '../../lib/choiceStore';
import { HudPanel } from '../../ui/HudPanel';
import { Check, Retry, Stop } from '../../ui/Icon';
import { NeedsMnemosyne } from '../../ui/NeedsMnemosyne';
import { Notice } from '../../ui/Notice';
import { StepRail } from '../../ui/StepRail';
import { describeError } from '../create/createModel';
import { GALLERIES, galleryOf, type Gallery } from '../objects/libraryModel';
import { useObjects } from '../objects/useObjects';
import { CompareView, type ViewState } from './CompareView';
import { PAIR_KEY, compareRail, presentPicks, readPair, togglePick, type CompareGuide } from './compareTabModel';

type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'error'; error: string } | { state: 'ready'; data: T };

/** How often a running alignment is asked about. */
const POLL_MS = 1_500;
/** A frise label's width (hud.css `.frise-label`) and one label row's height. */
const LABEL_PX = 120;
const LANE_PX = 46;
/** The frise's width before it is measured: a constant, never 0 (every label would take a row). */
const UNMEASURED_PX = 360;
/** Where the kind the timeline shows is remembered. */
const KIND_KEY = 'lab3d.compareKind';

export function CompareTab({ w, lang, host, refreshKey = 0, active = true }: {
  w: Dict; lang: string; host: HostState | null; refreshKey?: number;
  /** Whether the tab is the one shown. Nothing is asked or loaded before it was opened once. */
  active?: boolean;
}) {
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const enabled = host !== null && inMnemosyne(host) && opened;
  const [round, setRound] = useState(0);
  const { objects, retry } = useObjects(enabled, refreshKey + round);
  // The last list read stays while the list is read again (after an alignment): the frise does not blink.
  const lastList = useRef<ObjectEntry[]>([]);
  if (objects.state === 'ready') lastList.current = objects.objects;
  const allList = objects.state === 'ready' ? objects.objects : lastList.current;
  const kindCounts = useMemo(() => {
    const places = allList.filter((o) => galleryOf(o.scope) === 'places').length;
    return { objects: allList.length - places, places };
  }, [allList]);
  const [kindAsked, setKindAsked] = useState<Gallery>(() => readChoice(safeLocalStorage(), KIND_KEY, GALLERIES, 'objects'));
  // A remembered kind with nothing in it never hides the other: the timeline shows what exists.
  const otherKind: Gallery = kindAsked === 'objects' ? 'places' : 'objects';
  const kind: Gallery = kindCounts[kindAsked] === 0 && kindCounts[otherKind] > 0 ? otherKind : kindAsked;
  const list = useMemo(() => allList.filter((o) => galleryOf(o.scope) === kind), [allList, kind]);

  const [picked, setPicked] = useState<string[]>(() => {
    try { return readPair(safeLocalStorage()?.getItem(PAIR_KEY) ?? null); } catch (err) { console.warn('[lab-3d] remembered pair unreadable:', err); return []; }
  });
  const [alignment, setAlignment] = useState<Load<Alignment>>({ state: 'idle' });
  const [job, setJob] = useState<AlignJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // What the stage says of the pair it shows: a state reported for another pair is not this one's.
  const [viewState, setViewState] = useState<{ key: string; state: ViewState } | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [friseEl, friseRef] = useState<HTMLDivElement | null>(null);
  const [friseWidth, setFriseWidth] = useState(UNMEASURED_PX);
  // Two presses in one instant (or one while the host answers) start ONE alignment.
  const starting = useRef(false);

  useEffect(() => {
    if (!friseEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (friseEl.clientWidth > 0) setFriseWidth(friseEl.clientWidth); });
    ro.observe(friseEl);
    return () => ro.disconnect();
  }, [friseEl]);

  const present = presentPicks(picked, list);
  const pairObjects = present.length === 2 ? present.map((id) => list.find((o) => o.id === id)!) : null;
  const pair = pairObjects ? orderPair(pairObjects[0]!, pairObjects[1]!) : null;
  const refId = pair?.ref.id ?? null;
  const movedId = pair?.moved.id ?? null;
  const running = !!job && (ALIGN_RUNNING as readonly string[]).includes(job.step);
  const jobHere = !!job && job.refId === refId && job.movedId === movedId;
  // The host's list says it, or the job that just finished here: the list is being read again.
  const aligned = !!pair && (hasAlignment(pair.ref, pair.moved) || (jobHere && job?.step === 'done'));

  const say = useCallback((e: unknown) => {
    setErr(isPermissionRefusal(e) ? w.compare.refused : describeError(e instanceof Error ? e.message : String(e), w.compare.errors));
  }, [w]);

  const readAlignment = useCallback(async (ref: string, moved: string) => {
    setAlignment({ state: 'loading' });
    const r = await readWhole((o) => doors.read(moved, `align-${ref}.json`, o));
    if (!r.ok) { console.warn('[lab-3d] alignment unreadable:', moved, ref, r.error); setAlignment({ state: 'error', error: r.error }); return; }
    try {
      setAlignment({ state: 'ready', data: JSON.parse(new TextDecoder().decode(r.bytes)) as Alignment });
    } catch (e) {
      console.warn('[lab-3d] alignment not JSON:', e);
      setAlignment({ state: 'error', error: 'NOT_JSON' });
    }
  }, []);

  useEffect(() => {
    if (enabled && refId && movedId && aligned) void readAlignment(refId, movedId);
    else setAlignment({ state: 'idle' });
  }, [enabled, refId, movedId, aligned, readAlignment]);

  const refreshJob = useCallback(async () => {
    try {
      setJob(await doors.alignStatus());
    } catch (e) {
      console.warn('[lab-3d] alignment status unreadable:', e);
      say(e);
    }
  }, [say]);
  useEffect(() => { if (enabled) void refreshJob(); }, [enabled, refreshJob]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => { void refreshJob(); setTick((n) => n + 1); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [running, refreshJob]);
  // An alignment that just finished: the list learns the new file once, the pair reads it.
  const doneKey = job?.step === 'done' ? `${job.refId}>${job.movedId}@${job.startedAt}` : null;
  useEffect(() => {
    if (!doneKey || !job) return;
    setRound((n) => n + 1);
    if (job.refId === refId && job.movedId === movedId) void readAlignment(job.refId, job.movedId);
    // Once per finished job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  const toggle = (id: string) => {
    setErr(null);
    setPicked((p) => {
      const next = togglePick(p, id);
      try { safeLocalStorage()?.setItem(PAIR_KEY, JSON.stringify(next)); } catch (e) { console.warn('[lab-3d] pair not remembered:', e); }
      return next;
    });
  };
  const startAlign = async () => {
    if (!pair || starting.current) return;
    starting.current = true;
    setErr(null);
    try {
      setJob(await doors.align(pair.ref.id, pair.moved.id));
    } catch (e) {
      console.warn('[lab-3d] alignment did not start:', e);
      say(e);
    } finally {
      starting.current = false;
    }
  };
  const cancelAlign = async () => {
    try { await doors.alignCancel(); } catch (e) { console.warn('[lab-3d] alignment not stopped:', e); say(e); }
    await refreshJob();
  };

  const gap = LABEL_PX / Math.max(1, friseWidth * 0.92);
  const groups = useMemo(() => friseGroups(list, gap), [list, gap]);
  const lanes = Math.max(1, ...groups.map((g) => g.lane + 1));
  const undated = list.filter((o) => dateOf(o) === null);
  const open = groups.find((g) => g.day === openDay && g.members.length > 1) ?? null;
  const time = (t: number) => new Date(t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const when = (o: ObjectEntry, withTime = false) => {
    const d = dateOf(o);
    if (d === null) return w.compare.dateUnknown;
    const date = new Date(d).toLocaleDateString(lang);
    return withTime ? fill(w.compare.filmedAt, { date, time: time(d) }) : fill(w.compare.filmed, { date });
  };
  // One object of a day: the time it was filmed, how it was made, and when (a redo of the same video differs only there).
  const memberLabel = (o: ObjectEntry) => [
    time(dateOf(o)!),
    // Among places every one is a place: the word would say nothing.
    kind === 'objects' && scopeWord(o.scope) ? w.compare[scopeWord(o.scope)!] : null,
    o.quality === 'full' ? w.compare.full : o.quality === 'preview' ? w.compare.quick : null,
    o.createdAt ? fill(w.compare.madeAt, { time: time(Date.parse(o.createdAt)) }) : null,
  ].filter(Boolean).join(' · ');
  // A day of several: counted in what the timeline shows.
  const friseCount = kind === 'places' ? w.compare.friseCountPlaces : w.compare.friseCount;
  const pickKind = (g: Gallery) => {
    setKindAsked(g);
    setOpenDay(null);
    writeChoice(safeLocalStorage(), KIND_KEY, g);
  };
  const pressDay = (g: FriseGroup) => {
    if (g.members.length === 1) toggle(g.members[0]!.id);
    else setOpenDay((d) => (d === g.day ? null : g.day));
  };
  const a = alignment.state === 'ready' ? alignment.data : null;
  const days = pair ? daysApart(pair.ref, pair.moved) : null;
  const refAt = pair ? dateOf(pair.ref) : null, movedAt = pair ? dateOf(pair.moved) : null;
  // Two objects of the same day: the date alone would read the same twice, the time tells them apart.
  const sameDay = refAt !== null && movedAt !== null && dayKey(refAt) === dayKey(movedAt);
  const apart = days === null ? null : sameDay ? w.compare.sameDay : fill(w.compare.apart, { days });
  const viewKey = pair && a ? `${pair.ref.id}>${pair.moved.id}@${a.measuredAt}` : '';

  const guide: CompareGuide = {
    pair: !!pair,
    align: !pair ? 'none'
      : jobHere && running ? 'running'
        : jobHere && job?.step === 'failed' ? 'stopped'
          : a ? a.verdict
            : alignment.state === 'error' ? 'stopped'
              : alignment.state === 'loading' ? 'reading' : 'none',
    view: a && canOverlay(a) ? (viewState?.key === viewKey ? viewState.state : 'loading') : 'idle',
  };

  if (host === null) return <div className="stage-wrap"><Notice scanning>{w.host.pending}</Notice></div>;
  if (!enabled) return <div className="stage-wrap"><NeedsMnemosyne w={w} /></div>;

  let stageScreen: ReactNode;
  if (!pair) stageScreen = <Notice><div className="drop-title">{list.length < 2 && objects.state === 'ready' ? w.compare.needTwo : w.compare.pickTwo}</div></Notice>;
  else if (jobHere && running && job) stageScreen = <Notice scanning><span>{w.compare.alignStep[job.step]} · {clock(Date.now() - job.startedAt)}</span></Notice>;
  else if (a && canOverlay(a)) {
    stageScreen = (
      <CompareView key={viewKey} w={w} refId={pair.ref.id} movedId={pair.moved.id} alignment={a}
        labels={[when(pair.ref, sameDay), when(pair.moved, sameDay)]}
        rows={[
          [w.compare.reference, `${when(pair.ref, sameDay)} · ${idName(pair.ref.id)}`],
          [w.compare.later, `${when(pair.moved, sameDay)} · ${idName(pair.moved.id)}`],
          ...(apart ? [[w.compare.gap, apart] as const] : []),
          [w.compare.align, w.compare.verdict[a.verdict]],
        ]}
        objectOnly={pair.ref.scope === 'object' || pair.moved.scope === 'object'}
        onState={(state) => setViewState({ key: viewKey, state })} />
    );
  } else if (a) stageScreen = <Notice><div className="drop-title">{w.compare.verdict[a.verdict]}</div><p className="notice-hint">{w.compare.failedNoOverlay}</p></Notice>;
  else stageScreen = <Notice><div className="drop-title">{w.compare.alignFirst}</div></Notice>;

  return (
    <div className={`decor-layout compare-layout${pair ? '' : ' idle'}`}>
      <div className="decor-stage">{stageScreen}</div>
      <aside className="decor-side" aria-label={w.compare.panel}>
        <HudPanel index="05" title={w.compare.panel}>
          <StepRail label={w.compare.panel} steps={compareRail(guide, { dates: w.compare.dates, align: w.compare.align, view: w.compare.view }, {
            dates: apart ?? undefined,
            align: a ? w.compare.verdict[a.verdict] : guide.align === 'running' && job ? w.compare.alignStep[job.step] : undefined,
          })} />
        </HudPanel>

        <HudPanel title={w.compare.dates}>
          {kindCounts.objects > 0 && kindCounts.places > 0 && (
            <div className="chips compare-kind" role="radiogroup" aria-label={w.objects.filter}>
              {GALLERIES.map((g) => (
                <button key={g} role="radio" aria-checked={kind === g} className={`chip${kind === g ? ' chosen' : ''}`} onClick={() => pickKind(g)}>
                  {kind === g && <Check size={13} />}{w.tabs[g]} <span className="chip-count">{kindCounts[g]}</span>
                </button>
              ))}
            </div>
          )}
          {objects.state === 'loading' && list.length === 0 && <p className="decor-note">{w.objects.loading}</p>}
          {objects.state === 'error' && (
            <p className="error-line" role="alert">
              {objects.refused ? w.objects.refused : fill(w.objects.unreadable, { detail: objects.detail })} <button onClick={retry}><Retry size={14} />{w.objects.retry}</button>
            </p>
          )}
          {objects.state === 'ready' && list.length < 2 && <p className="decor-note">{w.compare.needTwo}</p>}
          {list.length >= 2 && (
            <>
              {groups.length > 0 && (
                <div className="frise" ref={friseRef} role="group" aria-label={w.compare.pickTwo} style={{ height: 34 + LANE_PX * lanes }}>
                  <div className="frise-line" />
                  {groups.map((g) => {
                    const one = g.members.length === 1 ? g.members[0]! : null;
                    const chosen = g.members.some((o) => present.includes(o.id));
                    return (
                      <button key={g.day} data-testid={`day-${g.day}`} className={`frise-dot${chosen ? ' chosen' : ''}${open?.day === g.day ? ' open' : ''}`}
                        style={{ left: `${4 + 92 * g.position}%` }}
                        aria-pressed={one ? present.includes(one.id) : undefined} aria-expanded={one ? undefined : open?.day === g.day}
                        title={one ? `${idName(one.id)} · ${when(one, true)}` : `${when(g.members[0]!)} · ${fill(friseCount, { n: g.members.length })}`}
                        onClick={() => pressDay(g)}>
                        {/* The first and last labels stay inside the card: anchored on their dot's outer side. */}
                        <span className={`frise-label${g.position < 0.15 ? ' start' : g.position > 0.85 ? ' end' : ''}`} style={{ top: 22 + LANE_PX * g.lane }}>
                          {one ? idName(one.id) : fill(friseCount, { n: g.members.length })}<br /><span className="dim">{when(g.members[0]!)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {open && (
                <div className="chips" data-testid="day-members">
                  <span className="decor-note">{fill(w.compare.friseDay, { date: new Date(dateOf(open.members[0]!)!).toLocaleDateString(lang) })}</span>
                  {open.members.map((o) => (
                    <button key={o.id} className={`chip${present.includes(o.id) ? ' chosen' : ''}`} aria-pressed={present.includes(o.id)} title={idName(o.id)} onClick={() => toggle(o.id)}>{memberLabel(o)}</button>
                  ))}
                </div>
              )}
              {undated.length > 0 && (
                <div className="chips">
                  <span className="decor-note">{w.compare.dateUnknown}</span>
                  {undated.map((o) => (
                    <button key={o.id} className={`chip${present.includes(o.id) ? ' chosen' : ''}`} aria-pressed={present.includes(o.id)} onClick={() => toggle(o.id)}>{idName(o.id)}</button>
                  ))}
                </div>
              )}
              {/* The stage says it on a wide screen; on a phone the empty stage is gone, the panel says it. */}
              {!pair && <p className="decor-note phone-only">{w.compare.pickTwo}</p>}
            </>
          )}
        </HudPanel>

        {pair && (
          <HudPanel title={w.compare.align}>
            <div className="pair" data-testid="pair">
              <p><strong>{w.compare.reference}</strong> · {idName(pair.ref.id)} · <span className="dim">{when(pair.ref, sameDay)}</span></p>
              <p><strong>{w.compare.later}</strong> · {idName(pair.moved.id)} · <span className="dim">{when(pair.moved, sameDay)}</span></p>
              {apart && <p className="dim">{apart}</p>}
            </div>

            {jobHere && running && job && (
              <div className="align-run">
                <span>{w.compare.alignStep[job.step]}</span>
                <span className="mono">{clock(Date.now() - job.startedAt)}</span>
                <button onClick={() => void cancelAlign()}><Stop size={14} />{w.compare.stop}</button>
              </div>
            )}
            {jobHere && job?.step === 'failed' && job.error && (
              <p className="error-line" role="alert">{w.compare.alignStep.failed} · {describeError(job.error, w.compare.errors)}</p>
            )}

            {!aligned && !(jobHere && running) && (
              <div className="align-go">
                <p className="decor-note">{running ? w.compare.alignBusy : w.compare.alignIntro}</p>
                <button className="primary" disabled={running} onClick={() => void startAlign()}>{w.compare.alignStart}</button>
              </div>
            )}

            {aligned && alignment.state === 'loading' && <p className="decor-note">…</p>}
            {aligned && alignment.state === 'error' && (
              <p className="error-line" role="alert">
                {fill(w.compare.readError, { error: describeError(alignment.error, w.compare.errors) })}{' '}
                <button onClick={() => void readAlignment(pair.ref.id, pair.moved.id)}><Retry size={14} />{w.compare.retry}</button>
              </p>
            )}
            {a && <AlignmentCard a={a} w={w} />}
            {a && <button disabled={running} onClick={() => void startAlign()}>{w.compare.realign}</button>}
          </HudPanel>
        )}
        {err && <p className="error-line" role="alert">{err}</p>}
      </aside>
    </div>
  );
}

/** The four measured numbers, the verdict and its reasons: always shown, never hidden behind a « success ». */
function AlignmentCard({ a, w }: { a: Alignment; w: Dict }) {
  const dash = (v: number | null, digits: number) => (v === null ? '—' : v.toFixed(digits));
  return (
    <div className={`verdict verdict-${a.verdict}`} data-testid="alignment">
      <strong>{w.compare.verdict[a.verdict]}</strong>
      <p className="mono">{fill(w.compare.alignNumbers, {
        placed: a.placed, total: a.total, px: dash(a.reprojectionPx, 2), shared: a.sharedPoints, res: dash(a.residualPct, 2),
      })}</p>
      {typeof a.linked === 'number' && <p>{fill(w.compare.linkedLine, { linked: a.linked, placed: a.placed })}</p>}
      {a.reasons.map((r) => <p key={r}>{w.compare.reason[r] ?? r}</p>)}
      {a.verdict === 'failed' && <p>{w.compare.failedNoOverlay}</p>}
      <p className="dim">{w.compare.thresholdsChosen}</p>
    </div>
  );
}
