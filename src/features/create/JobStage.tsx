/**
 * JobStage — a job, shown through what it makes (doc 163): its name, the
 * clock, the lit rail of its steps with what each one measured, and below it
 * the live view of the step at work. Stop while it runs, close once it ended.
 *
 * @module features/create/JobStage
 */
import type { ReactNode } from 'react';
import { clock, isRunning, scopeWord, type JobView } from '../../core/model';
import { num } from '../../core/stageModel';
import { describeError, elapsedMs, jobRail, sourceName, stepLabels } from './createModel';
import { fill, type Dict } from '../../i18n/words';
import { HudPanel } from '../../ui/HudPanel';
import { StepRail } from '../../ui/StepRail';
import { Close, Film, Phone, Photos, Stop } from '../../ui/Icon';
import { jobObjectId } from '../../host/doors';
import { DoneView, FramesView, MatteView, PosesView, TrainView, TurnView } from './StepViews';
import { UnplacedPhotos } from './UnplacedPhotos';

export function JobStage({ job, w, lang, now, acting = false, onAct, onView, onPutAway, onAddPhotos, afterDone, onRetryQuick, onPhone, onResume }: {
  job: JobView; w: Dict; lang: string; now: number;
  onAct: (a: 'continue' | 'cancel' | 'keep') => void; onView: () => void; onPutAway: () => void;
  /** More photos into this job's folder (a job from photos that stopped short); absent when the host cannot. */
  onAddPhotos?: () => void;
  /** Under a finished job: what is left to do with its source (where the phone photos go). */
  afterDone?: ReactNode;
  /** Make it again on the quick setting, which asks less of the card; absent when there is nothing to make it from. */
  onRetryQuick?: () => void;
  /** An action was sent and the host's answer is not read yet: every action button waits. */
  acting?: boolean;
  /** A paused job, done: resume it from its step (a new version). Absent: no such button. */
  onResume?: () => void;
  /** Take a new series with the phone while this one is built; absent on a host without the phone. */
  onPhone?: () => void;
}) {
  const id = jobObjectId(job);
  const running = isRunning(job);
  const waiting = job.step === 'needsConfirm';
  const props = { job, id, w, lang, now };
  // A host older than lot 4 says nothing: it made the whole scene.
  const scope = w.create[scopeWord(job.scope) ?? 'scopeScene'];
  const quality = job.quality === 'full' ? w.create.full : w.create.quick;
  // The whole job on one screen, no scroll (13/11): the head is one line of steps at every step.
  const compact = true;

  return (
    <div className="pane job" data-step={job.step}>
      <HudPanel index="03" title={sourceName(job.video)} className={`job-head${running ? ' running' : ''}${compact ? ' compact' : ''}`}
        aside={(
          <span className="job-head-tools">
            <span className="job-clock" title={w.create.elapsed}>{clock(elapsedMs(job, now))}</span>
            {running && onPhone && <button onClick={onPhone} title={w.phone.newSeries}><Phone size={14} />{w.phone.title}</button>}
            {/* Once Brush wrote an object, it can be kept as it is: « Stop » would throw it away. */}
            {job.step === 'train' && (job.trainStep ?? 0) > (job.trainFrom ?? 0) && <button className="primary" disabled={acting} aria-busy={acting} onClick={() => onAct('keep')} title={w.create.keepNowHint}>{acting ? w.create.acting : w.create.keepNow}</button>}
            {(running || waiting)
              ? <button className="danger" disabled={acting} onClick={() => onAct('cancel')}><Stop size={14} />{w.create.stop}</button>
              : <button className="icon" title={w.create.putAway} aria-label={w.create.putAway} onClick={onPutAway}><Close /></button>}
          </span>
        )}>
        <StepRail label={w.create.pipeline} working={running} steps={jobRail(job, stepLabels(job.scope, w.create.steps, w.create.placeSteps), lang)} />
        <div className="job-phase">
          {job.source === 'photos' ? <Photos size={14} /> : <Film size={14} />}
          <span className={`phase-word ${job.step}`}>{(job.step === 'frames' && job.source === 'photos' ? w.create.photosPhase : undefined) ?? (job.scope === 'place' ? w.create.placePhase[job.step as keyof typeof w.create.placePhase] : undefined) ?? w.create.phase[job.step]}</span>
          <span className="phase-dim">{quality} · {scope}{job.trainFrom ? ` · ${fill(w.create.resumedFrom, { step: num(job.trainFrom, lang) })}` : ''}</span>
        </div>
      </HudPanel>

      {job.step === 'frames' && <FramesView {...props} />}
      {job.step === 'poses' && <PosesView {...props} />}
      {(job.step === 'coverage' || waiting) && <TurnView {...props} acting={acting} onAct={onAct} />}
      {job.step === 'matte' && <MatteView {...props} />}
      {job.step === 'train' && <TrainView {...props} />}
      {job.step === 'done' && <DoneView {...props} onView={onView} onResume={onResume} acting={acting} />}
      {job.step === 'done' && afterDone}
      {job.step === 'failed' && (
        <HudPanel className="job-failed">
          <div className="error-line" role="alert">{job.error ? describeError(job.error, w.create.errors) : w.create.phase.failed}</div>
          {/* Brush or the card gave up: the quick setting asks less of it. */}
          {onRetryQuick && /^(GPU_LOST|TRAIN_FAILED)/.test(job.error ?? '') && (
            <div className="phone-actions"><button className="primary" disabled={acting} aria-busy={acting} onClick={onRetryQuick}>{acting ? w.create.acting : w.create.retryQuick}</button></div>
          )}
        </HudPanel>
      )}
      {job.step === 'failed' && ((job.unplacedPhotos?.length ?? 0) > 0 || onAddPhotos) && (
        <UnplacedPhotos w={w} paths={job.unplacedPhotos ?? []} onAddPhotos={onAddPhotos} />
      )}
    </div>
  );
}
