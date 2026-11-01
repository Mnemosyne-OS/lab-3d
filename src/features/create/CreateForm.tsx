/**
 * CreateForm — making something new for one gallery (doc 166 §14.2): the
 * quality, for the objects what to keep (the object alone or the whole
 * scene; a place is the places' own Create), the number of images, and two
 * big sources (a video, a folder of photos). The sources ARE the start: a
 * press opens the system's dialog and the job starts with the choices shown
 * above. Under it, the steps the engine will run, unlit until it runs them.
 *
 * @module features/create/CreateForm
 */
import { useState, type ReactNode } from 'react';
import type { Scope } from '../../core/model';
import type { Quality } from '../../host/doors';
import type { Dict } from '../../i18n/words';
import type { Gallery } from '../objects/libraryModel';
import { HudPanel } from '../../ui/HudPanel';
import { StepRail } from '../../ui/StepRail';
import { DEFAULT_FRAMES, MAX_FRAME_CHOICE, MIN_FRAME_CHOICE, madeScope, readFrameChoice, stepLabels, type FrameChoice } from './createModel';
import { fill } from '../../i18n/words';
import { Check, Film, Phone, Photos } from '../../ui/Icon';

function Choice({ chosen, disabled, title, sub, why, onPick }: {
  chosen: boolean; disabled?: boolean; title: string; sub?: string; why?: string; onPick: () => void;
}) {
  return (
    <button role="radio" aria-checked={chosen} disabled={disabled} title={why} className={`choice${chosen ? ' chosen' : ''}`} onClick={onPick}>
      {chosen && <span className="choice-check" aria-hidden><Check size={12} /></span>}
      <strong>{title}</strong>
      {sub && <span>{sub}</span>}
    </button>
  );
}

/**
 * The number of images, a value the person types: a tile like the others, lit
 * green once it holds the choice. Kept as typed until it is committed (Enter
 * or leaving the field), then brought within the bounds.
 */
function FramesInput({ w, frames, presets, onFrames }: { w: Dict; frames: FrameChoice; presets: readonly number[]; onFrames: (f: FrameChoice) => void }) {
  const custom = typeof frames === 'number' && !presets.includes(frames);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    if (draft.trim() !== '') onFrames(readFrameChoice(draft));
    setDraft(null);
  };
  const bounds = fill(w.create.framesBounds, { min: MIN_FRAME_CHOICE, max: MAX_FRAME_CHOICE });
  return (
    <label className={custom ? 'choice choice-input chosen' : 'choice choice-input'} title={bounds}>
      {custom && <span className="choice-check" aria-hidden><Check size={12} /></span>}
      <strong>{w.create.framesOther}</strong>
      <input type="number" inputMode="numeric" min={MIN_FRAME_CHOICE} max={MAX_FRAME_CHOICE} step={10} placeholder={bounds} aria-label={w.create.framesOther}
        value={draft ?? (custom ? String(frames) : '')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </label>
  );
}

function Source({ icon, title, sub, disabled, onPick }: { icon: ReactNode; title: string; sub: string; disabled: boolean; onPick: () => void }) {
  return (
    <button className="source" disabled={disabled} onClick={onPick}>
      <span className="source-icon" aria-hidden>{icon}</span>
      <strong>{title}</strong>
      <span>{sub}</span>
    </button>
  );
}

export function CreateForm({ w, gallery, quality, scope, frames, presets, objectReady, objectWhy, busy, error, phone, onQuality, onScope, onFrames, onSource, onImageSettings }: {
  w: Dict; gallery: Gallery; quality: Quality; scope: Scope; frames: FrameChoice; presets: readonly number[]; objectReady: boolean; objectWhy: string | null; busy: boolean; error: string | null;
  /** Whether the host announces the phone capture (doc 176); an older host is told to update, never shown a dead source. */
  phone: boolean;
  onQuality: (q: Quality) => void; onScope: (s: Scope) => void; onFrames: (f: FrameChoice) => void; onSource: (s: 'video' | 'photos' | 'phone') => void; onImageSettings: (() => void) | null;
}) {
  const chosenScope: Scope = madeScope(scope, objectReady);
  const place = chosenScope === 'place';
  const labels = stepLabels(chosenScope, w.create.steps, w.create.placeSteps);
  const steps = (['frames', 'poses', 'coverage', 'matte', 'train'] as const)
    .filter((s) => s !== 'matte' || chosenScope === 'object')
    .map((s) => ({ id: s, label: labels[s], state: 'pending' as const }));
  return (
    <div className="pane create split">
      {/* The choices on the left, the sources they apply to on the right (Tony, 26/10).
          The view's bar already says what is made here: the panel carries no second title. */}
      <HudPanel className="split-opts">
        <div className="create-opts">
          <div className="opt-group" role="radiogroup" aria-label={w.create.quality}>
            <span className="opt-label">{w.create.quality}</span>
            <div className="choices">
              <Choice chosen={quality === 'preview'} title={w.create.quick} sub={w.create.timeQuick} onPick={() => onQuality('preview')} />
              <Choice chosen={quality === 'full'} title={w.create.full} sub={w.create.timeFull} onPick={() => onQuality('full')} />
            </div>
          </div>
          {gallery === 'objects' && (
            <div className="opt-group" role="radiogroup" aria-label={w.create.scope}>
              <span className="opt-label">{w.create.scope}</span>
              <div className="choices">
                <Choice chosen={chosenScope === 'scene'} title={w.create.scopeScene} sub={w.create.scopeSceneSub} onPick={() => onScope('scene')} />
                <Choice chosen={chosenScope === 'object'} disabled={!objectReady} why={objectWhy ?? undefined}
                  title={w.create.scopeObject} sub={w.create.scopeObjectSub} onPick={() => onScope('object')} />
              </div>
            </div>
          )}
          <div className="opt-group" role="radiogroup" aria-label={w.create.frames}>
            <span className="opt-label">{w.create.frames}</span>
            <div className="choices">
              {presets.map((n, i) => (
                // A larger count says how many times longer it runs than the default (measured: 300 took 3.4×).
                <Choice key={n} chosen={frames === n} title={String(n)} onPick={() => onFrames(n)}
                  sub={i === 0 ? w.create.framesFast : fill(w.create.framesLonger, { n: Math.round(n / DEFAULT_FRAMES) })} />
              ))}
              <FramesInput w={w} frames={frames} presets={presets} onFrames={onFrames} />
            </div>
          </div>
        </div>
        {objectWhy && (
          <div className="create-why">
            <span>{objectWhy}</span>
            {onImageSettings && <button onClick={onImageSettings}>{w.create.openImageSettings}</button>}
          </div>
        )}
      </HudPanel>
      <div className="split-visual">
        <div className="sources">
          <Source icon={<Film size={34} />} title={w.create.video} sub={place ? w.create.videoSubPlace : w.create.videoSub} disabled={busy} onPick={() => onSource('video')} />
          <Source icon={<Photos size={34} />} title={w.create.photos} sub={place ? w.create.photosSubPlace : w.create.photosSub} disabled={busy} onPick={() => onSource('photos')} />
          {phone && <Source icon={<Phone size={34} />} title={w.phone.source} sub={w.phone.sourceSub} disabled={busy} onPick={() => onSource('phone')} />}
        </div>
        {!phone && <div className="create-why">{w.phone.needsUpdate}</div>}
        {error && <div className="error-line" role="alert">{error}</div>}
        <HudPanel index="04" title={w.create.pipeline} className="pipeline-preview">
          <StepRail label={w.create.pipeline} steps={steps} />
        </HudPanel>
      </div>
    </div>
  );
}
