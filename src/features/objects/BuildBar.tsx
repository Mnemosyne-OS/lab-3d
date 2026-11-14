/**
 * BuildBar — on an object or a place open in the viewer, what can be made of
 * it again (13/11: « pause a build and take it up later »).
 *
 * Paused (« Pause » on the job kept it at a step) or stopped by a crash (the
 * object of its last step was kept): « Resume » goes on from that step to the
 * total it was started with. Always: « Make again » in Quick
 * or Full, from its frames and placement. Both are a new version; the one on
 * screen stays. Once the host took it, the job is shown (`onShowJob`).
 *
 * The host makes one thing at a time: while a job of this gallery runs, the
 * bar says so and shows it instead of offering a start the host would refuse,
 * and a refusal for a job elsewhere (ALREADY_RUNNING) offers to show it too
 * (13/11: « Resume » clicked four times on a resume already running).
 *
 * @module features/objects/BuildBar
 */
import { useState } from 'react';
import type { ObjectEntry } from '../../core/model';
import { num } from '../../core/stageModel';
import { doors, type Quality } from '../../host/doors';
import { fill, type Dict } from '../../i18n/words';
import { HudPanel } from '../../ui/HudPanel';
import { describeError } from '../create/createModel';

/** What can be made again of the object open in the viewer, and the job shown once the host took it. */
export function BuildBar({ w, lang, o, live = false, onShowJob }: {
  w: Dict; lang: string; o: ObjectEntry;
  /** A job of this gallery runs: nothing can start, it can be shown. */
  live?: boolean;
  /** Show the job: after a start, or the one already running. */
  onShowJob: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; running: boolean } | null>(null);

  const go = async (what: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await what();
      onShowJob();
    } catch (err) {
      console.warn('[lab-3d] build not started:', err);
      const why = err instanceof Error ? err.message : String(err);
      setError({ text: fill(w.objects.buildFailed, { detail: describeError(why, w.create.errors) }), running: /ALREADY_RUNNING/.test(why) });
    } finally {
      setBusy(false);
    }
  };
  const scope = o.scope ?? 'scene';
  const redo = (q: Quality) => () => doors.redo(o.id, q, scope);

  if (live) {
    return (
      <HudPanel className="build-bar">
        <div className="build-row">
          <span className="live-dot" aria-hidden />
          <span className="build-state">{scope === 'place' ? w.create.placeRunning : w.create.objectRunning}</span>
          <button className="primary" onClick={onShowJob}>{w.create.seeIt}</button>
        </div>
      </HudPanel>
    );
  }

  return (
    <HudPanel className="build-bar">
      {o.paused && (
        <div className="build-row">
          <span className="build-state">{fill(o.paused.reason && o.paused.reason !== 'KEPT' ? w.objects.crashedAt : w.objects.pausedAt, { step: num(o.paused.step, lang), of: num(o.paused.of, lang) })}</span>
          <button className="primary" disabled={busy} aria-busy={busy} onClick={() => void go(() => doors.resume(o.id))}>{busy ? w.create.acting : w.objects.resume}</button>
        </div>
      )}
      <div className="build-row">
        <span className="build-state">{w.objects.redo}</span>
        <button disabled={busy} onClick={() => void go(redo('preview'))}>{w.objects.redoQuick}</button>
        <button disabled={busy} onClick={() => void go(redo('full'))}>{w.objects.redoFull}</button>
      </div>
      {error && (
        <div className="build-row">
          <div className="error-line" role="alert">{error.text}</div>
          {error.running && <button onClick={onShowJob}>{w.create.seeIt}</button>}
        </div>
      )}
    </HudPanel>
  );
}
