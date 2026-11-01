/**
 * StepViews — what each step of a job shows: the files it writes as they
 * land (frames read, frames kept, cut-outs, the training cloud) and the
 * numbers the host measured. What moves on its own (the sweep, the radar's
 * beam) says the engine runs, never how far it is: every bar and count comes
 * from the host, and a number nobody measured is « — ».
 *
 * @module features/create/StepViews
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { clock, mattePct, trainPct, trainTiming, type JobView } from '../../core/model';
import { colmapFraction, keptMarks, newestFrames, num } from '../../core/stageModel';
import { fill, type Dict } from '../../i18n/words';
import { useFileUrl, useFrameNames, useRig } from '../../host/useHostFiles';
import { HudPanel } from '../../ui/HudPanel';
import { Close, Cube, Expand } from '../../ui/Icon';
import { LivePreview } from './LivePreview';
import { Radar } from './Radar';

export type ViewProps = { job: JobView; id: string; w: Dict; lang: string; now: number };

/** A big measured number and what it counts. */
function Figure({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`figure${accent ? ' accent' : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/** A bar over a MEASURED share only: no bar at all when nothing was measured. */
function Bar({ pct }: { pct: number }) {
  return <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>;
}

/** One frame of the job, read from the host; a frame the host refused says so. */
function FrameTile({ id, file, className = '', children }: { id: string; file: string; className?: string; children?: ReactNode }) {
  const { url, failed } = useFileUrl(id, file);
  return (
    <div className={`frame ${className}${url ? ' in' : ''}${failed ? ' failed' : ''}`} data-file={file}>
      {url && <img src={url} alt="" draggable={false} />}
      {children}
    </div>
  );
}

/** A grid of frames that keeps the one being worked on in view; only the grid scrolls, never while the person scrolls it. */
function FollowGrid({ at, children }: { at: string | undefined; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const touched = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!el || !at || Date.now() - touched.current < 4_000) return;
    // Compared, not put in a selector: a file name from the host is data, never CSS.
    const tile = [...el.querySelectorAll<HTMLElement>('[data-file]')].find((t) => t.dataset.file?.endsWith(at));
    if (!tile) return;
    const top = tile.offsetTop - el.offsetTop;
    if (top < el.scrollTop || top + tile.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2);
  }, [at]);
  return <div ref={box} className="frame-grid" onWheel={() => { touched.current = Date.now(); }}>{children}</div>;
}

/** Side panel of a step: a HUD column of figures. */
function Side({ children }: { children: ReactNode }) {
  return <HudPanel className="job-side">{children}</HudPanel>;
}

/** Reading the video: the frames as they are written, then the sharpest kept on the video's timeline. */
export function FramesView({ job, id, w, lang }: ViewProps) {
  const reading = job.framesKept === null;
  const all = useFrameNames(id, 'all', reading ? job.framesSeen : 'read');
  const kept = useFrameNames(id, 'frames', job.framesKept);
  const strip = newestFrames(all ?? [], 10, reading);
  const folder = reading ? 'work/all/' : 'frames-all/';
  const newest = strip.at(-1);
  const marks = keptMarks(job.framesTotal, kept ?? []);
  return (
    <div className="job-split">
      <HudPanel className="job-main">
        {/* The newest frame written, large: the video being read, as it is read. */}
        {newest ? <FrameTile key={newest} id={id} file={folder + newest} className={`hero-frame${reading ? ' scanning' : ''}`} /> : <div className="frame hero-frame waiting" />}
        <div className="filmstrip">
          {strip.map((n) => <FrameTile key={n} id={id} file={folder + n} />)}
        </div>
        {!reading && marks.length > 0 && (
          <div className="timeline" role="img" aria-label={`${num(job.framesKept, lang)} / ${num(job.framesTotal, lang)}`}>
            {marks.map((m, i) => <span key={i} style={{ left: `${m * 100}%` }} />)}
          </div>
        )}
      </HudPanel>
      <Side>
        <Figure value={num(job.framesSeen ?? job.framesTotal, lang)} label={job.source === 'photos' ? w.create.photosRead : w.create.framesRead} />
        {!reading && <Figure accent value={num(job.framesKept, lang)} label={job.blurRead ? w.create.keptSharp : w.create.keptEven} />}
      </Side>
    </div>
  );
}

/** After this long with nothing new from COLMAP while it counts, the silence is said (26/10: 30 min frozen on the card). */
const COLMAP_SILENT_MS = 60_000;

/** When `key` last changed: each poll hands a new progress object, so it is compared by what it says. */
function useLastChange(key: string): number {
  const last = useRef({ key, at: Date.now() });
  if (last.current.key !== key) last.current = { key, at: Date.now() };
  return last.current.at;
}

/** COLMAP at work: each kept frame lights up with the points it found, then the comparison, then the placement. */
export function PosesView({ job, id, w, lang, now }: ViewProps) {
  const kept = useFrameNames(id, 'frames', 'kept') ?? [];
  const c = job.colmap ?? null;
  const points = c?.points ?? {};
  const frac = colmapFraction(c);
  const found = Object.values(points);
  const total = found.length ? found.reduce((s, n) => s + n, 0) : null;
  const scanning = c?.phase === 'features' && c.done !== null ? kept[c.done] : undefined;
  const changedAt = useLastChange(c ? `${c.phase}|${c.done}|${c.of}|${found.length}` : '');
  // The mapping prints nothing that counts: only the steps that count can fall silent.
  const silentMs = c && c.phase !== 'mapping' ? now - changedAt : 0;
  return (
    <div className="job-split">
      <HudPanel className="job-main">
        <FollowGrid at={scanning}>
          {kept.map((n) => (
            <FrameTile key={n} id={id} file={`frames/${n}`} className={points[n] != null ? 'scanned' : n === scanning ? 'scanning' : 'waiting'}>
              {points[n] != null && <span className="frame-badge">{num(points[n], lang)}</span>}
            </FrameTile>
          ))}
        </FollowGrid>
      </HudPanel>
      <Side>
        <Radar rig={null} sweeping size={180} label={w.create.steps.poses} />
        <p className="side-phase">{c ? w.create.colmap[c.phase] : w.create.phase.poses}</p>
        {c && c.done !== null && c.of !== null && <p className="side-count">{num(c.done, lang)} / {num(c.of, lang)}</p>}
        {frac !== null && <Bar pct={Math.round(frac * 100)} />}
        {total !== null && <Figure value={num(total, lang)} label={w.create.pointsFound} />}
        {silentMs >= COLMAP_SILENT_MS && <p className="warn-line" role="status">{fill(w.create.colmapSilent, { t: clock(silentMs) })}</p>}
      </Side>
    </div>
  );
}

/** The cameras COLMAP placed, from above, and the turn measured; a short turn waits for a decision here. */
export function TurnView({ job, id, w, lang, onAct }: ViewProps & { onAct: (a: 'continue' | 'cancel') => void }) {
  const rig = useRig(id, job.coverageDeg !== null || job.step === 'needsConfirm');
  const short = job.step === 'needsConfirm';
  return (
    <div className="job-split">
      <HudPanel className="job-main center">
        <Radar rig={rig} sweeping={!rig} size={300} label={job.scope === 'place' ? w.create.placeSteps.coverage : w.create.steps.coverage} />
      </HudPanel>
      <Side>
        <Figure accent value={num(job.posesPlaced, lang)} label={fill(w.create.placedOf, { of: num(job.framesKept, lang) })} />
        {job.scope !== 'place' && <Figure value={job.coverageDeg === null ? '—' : `${job.coverageDeg}°`} label={w.create.turnFilmed} />}
        {short && (
          <>
            <p className="warn-line">{job.coverageDeg === null ? w.create.coverageUnknown : fill(w.create.coverageShort, { deg: job.coverageDeg })}</p>
            <div className="side-actions">
              <button className="primary" onClick={() => onAct('continue')}>{w.create.continue}</button>
              <button onClick={() => onAct('cancel')}>{w.create.stop}</button>
            </div>
          </>
        )}
      </Side>
    </div>
  );
}

/** Cutting out the object: each frame turns into its cut-out as the file lands. */
export function MatteView({ job, id, w, lang }: ViewProps) {
  const kept = useFrameNames(id, 'frames', 'kept') ?? [];
  const masked = new Set(useFrameNames(id, 'masked', job.framesMatted) ?? []);
  const pct = mattePct(job);
  const next = kept.find((n) => !masked.has(n.replace(/\.jpg$/, '.png')));
  const lastCut = [...masked].sort().at(-1);
  return (
    <div className="job-split">
      <HudPanel className="job-main">
        <FollowGrid at={next}>
          {kept.map((n) => {
            const png = n.replace(/\.jpg$/, '.png');
            return masked.has(png)
              ? <FrameTile key={n} id={id} file={`frames-masked/${png}`} className="cutout" />
              : <FrameTile key={n} id={id} file={`frames/${n}`} className={n === next ? 'scanning' : 'waiting'} />;
          })}
        </FollowGrid>
      </HudPanel>
      <Side>
        {lastCut && <FrameTile key={lastCut} id={id} file={`frames-masked/${lastCut}`} className="cutout big" />}
        <Figure accent value={`${num(job.framesMatted ?? null, lang)} / ${num(job.matteTotal ?? null, lang)}`} label={w.create.cutOut} />
        {pct !== null ? <Bar pct={pct} /> : <p className="side-phase">{w.create.matteWaiting}</p>}
      </Side>
    </div>
  );
}

/** Brush training: its last file, live and turning; the steps it wrote and the time measured. */
export function TrainView({ job, id, w, lang, now }: ViewProps) {
  const rig = useRig(id, true);
  // Brush prints nothing: before its first file there is no step to show, only
  // when it will come and how long Brush has been at it (Tony, 24/10: « pourquoi 0 % »).
  const before = job.liveStep == null && !(job.trainStep && job.trainStep > 0);
  const pct = before ? null : trainPct(job);
  const timing = before ? null : trainTiming(job, now);
  const first = job.trainExportEvery;
  const working = first ? fill(w.create.trainWorking, { step: num(first, lang) }) : w.create.trainWorkingSoon;
  const elapsed = clock(Math.max(0, now - job.stepStartedAt));
  // The cloud being built, as big as the window: the board stays where it was underneath.
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);
  const [shown, setShown] = useState<number | null>(null);
  const onShown = useCallback((step: number) => setShown(step), []);
  const ring = 2 * Math.PI * 52;
  return (
    <div className="job-split train">
      <HudPanel className={full ? 'job-main live full' : 'job-main live'}>
        <button className="icon live-full" aria-pressed={full} title={full ? w.create.liveSmall : w.create.liveFull}
          aria-label={full ? w.create.liveSmall : w.create.liveFull} onClick={() => setFull((f) => !f)}>
          {full ? <Close size={16} /> : <Expand size={16} />}
        </button>
        {job.liveStep != null
          ? <LivePreview id={id} step={job.liveStep} rig={rig} onShown={onShown} />
          : <div className="live-wait"><span className="notice-mark"><Cube size={34} /></span><span>{working}</span></div>}
        {shown !== null && <span className="live-tag">{fill(w.create.liveAt, { step: num(shown, lang) })}</span>}
      </HudPanel>
      <Side>
        <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={pct === null ? working : `${pct} %`}>
          <circle cx="60" cy="60" r="52" className="ring-track" />
          {/* Turning says Brush runs, never how far: the share comes only from its files. */}
          {before && <circle cx="60" cy="60" r="52" className="ring-spin" strokeDasharray={`${ring / 5} ${ring}`} />}
          {pct !== null && <circle cx="60" cy="60" r="52" className="ring-fill" strokeDasharray={`${(ring * pct) / 100} ${ring}`} />}
          <text x="60" y="66" textAnchor="middle" className="ring-text">{before ? elapsed : pct === null ? '—' : `${pct}%`}</text>
        </svg>
        {/* Before Brush writes its first file there is no step: nothing rather than « step 0 ». */}
        {before && first && <p className="side-count">{fill(w.create.trainFirst, { step: num(first, lang) })}</p>}
        {before && <p className="side-dim">{fill(w.create.trainFor, { t: elapsed })}</p>}
        {!before && job.trainStep != null && <p className="side-count">{fill(w.create.trainStep, { step: num(job.trainStep, lang), steps: num(job.trainSteps, lang) })}</p>}
        {timing?.leftMs != null && <p className="side-phase">{fill(w.create.trainLeft, { left: clock(timing.leftMs) })}</p>}
        {timing && <p className="side-dim">{fill(w.create.trainAgo, { ago: clock(timing.sinceMs) })}</p>}
      </Side>
    </div>
  );
}

/** Done: the object is there; one press shows it in the library. */
export function DoneView({ job, id, w, lang, onView }: ViewProps & { onView: () => void }) {
  const kept = useFrameNames(id, 'frames', 'kept') ?? [];
  const cover = kept[Math.floor(kept.length / 3)];
  return (
    <div className="job-split">
      <HudPanel className="job-main center">
        {cover ? <FrameTile id={id} file={`frames/${cover}`} className="done-cover" /> : <span className="notice-mark"><Cube size={48} /></span>}
      </HudPanel>
      <Side>
        {/* Brush stopped early: the object is the one it had written, and that is said, never hidden. */}
        {job.trainStopped && (
          <p className="warn-line" role="status">
            {fill(w.create.stoppedAt, { step: num(job.trainStopped.step, lang), of: num(job.trainSteps, lang) })}
            {' '}{job.trainStopped.reason === 'KEPT' ? w.create.stoppedKept : job.trainStopped.reason === 'GPU_LOST' ? w.create.stoppedGpu : fill(w.create.stoppedOther, { detail: job.trainStopped.detail })}
          </p>
        )}
        <Figure accent value={num(job.posesPlaced, lang)} label={fill(w.create.placedOf, { of: num(job.framesKept, lang) })} />
        {job.scope !== 'place' && <Figure value={job.coverageDeg === null ? '—' : `${job.coverageDeg}°`} label={w.create.turnFilmed} />}
        <button className="primary big" onClick={onView}><Cube size={18} />{w.create.view}</button>
      </Side>
    </div>
  );
}
