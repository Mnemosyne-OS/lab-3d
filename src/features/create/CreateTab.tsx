/**
 * CreateTab — the Create view of one gallery (doc 166 §14.2): a video or a
 * folder of photos becomes an object (the objects) or a place to walk
 * through (the places), made on this computer by Mnemosyne OS's engine
 * (doc 163). It shows the form, or the job while one runs. One job runs at a
 * time for the whole host: a job of the other gallery is said here with a
 * way to it, never drawn under this gallery's name, and a job started from
 * Objets 3D shows too. The engine is held by the app (useEngine), once for
 * both galleries. Outside Mnemosyne it says what it needs.
 *
 * @module features/create/CreateTab
 */
import { useState, type ReactNode } from 'react';
import type { JobView, Scope } from '../../core/model';
import { doors, isPermissionRefusal, jobObjectId, type Quality } from '../../host/doors';
import { hasCapability, inMnemosyne, type HostState } from '../../host/hostState';
import { PHONE_CAPABILITY } from '../../host/phoneDoors';
import { PhoneCapture } from '../phone/PhoneCapture';
import { SeriesAfterJob } from '../phone/SeriesAfterJob';
import { fill, type Dict } from '../../i18n/words';
import { readChoice, safeLocalStorage, writeChoice } from '../../lib/choiceStore';
import { ChevronLeft, Retry } from '../../ui/Icon';
import { NeedsMnemosyne } from '../../ui/NeedsMnemosyne';
import { Notice } from '../../ui/Notice';
import { galleryKey, galleryOf, type Gallery } from '../objects/libraryModel';
import { CreateForm } from './CreateForm';
import { DEFAULT_FRAMES, FRAME_PRESETS, OBJECT_SCOPES, describeError, engineVerdict, galleryScope, isLive, readFrameChoice, type FrameChoice } from './createModel';
import { JobStage } from './JobStage';
import { useClock, type EngineState } from './useEngine';

const QUALITY_KEY = 'lab3d.quality';
const SCOPE_KEY = 'lab3d.scope';
const FRAMES_KEY = 'lab3d.frames';

export function CreateTab({ w, lang, host, gallery, status, refresh, shown = true, onBack, onView, onShowJob }: {
  w: Dict; lang: string; host: HostState | null;
  /** The gallery this view makes for: what it offers, and which job is its own. */
  gallery: Gallery;
  /** The engine and its job, held by the app for both galleries. */
  status: EngineState; refresh: () => Promise<void>;
  /** Whether the view is on screen. Hidden it keeps its choices and draws nothing, so a running job's previews are not fetched for no one. */
  shown?: boolean;
  /** Back to the gallery. */
  onBack: () => void;
  /** Show this object in the gallery. */
  onView: (id: string) => void;
  /** Go to the Create view of the gallery whose job is running. */
  onShowJob: (g: Gallery) => void;
}) {
  const storage = safeLocalStorage();
  const [quality, setQuality] = useState<Quality>(() => readChoice(storage, galleryKey(QUALITY_KEY, gallery), ['preview', 'full'] as const, 'preview'));
  // The whole scene by default: it needs nothing more than the 3D engine. A place
  // remembered from before the two galleries is not an object's choice: the scene again.
  const [scope, setScope] = useState<Scope>(() => readChoice(storage, SCOPE_KEY, OBJECT_SCOPES, 'scene'));
  const [frames, setFrames] = useState<FrameChoice>(() => {
    try {
      return readFrameChoice(storage?.getItem(galleryKey(FRAMES_KEY, gallery)));
    } catch (err) {
      console.warn('[lab-3d] remembered image count unreadable:', err);
      return DEFAULT_FRAMES;
    }
  });
  const [error, setError] = useState<string | null>(null);
  // A dialog or a start in flight: one gesture at a time.
  const [busy, setBusy] = useState(false);
  // The phone capture is on screen in place of the form (doc 176).
  const [phone, setPhone] = useState(false);
  // A new series asked while another waits or a build runs: the waiting one is not offered first.
  const [phoneFresh, setPhoneFresh] = useState(false);
  // The waiting series the phone goes on with, when it was opened from a job that stopped short.
  const [phoneContinue, setPhoneContinue] = useState<string | null>(null);
  // The photos COLMAP left out of that series: the phone shows their sides in red.
  const [phoneRedo, setPhoneRedo] = useState<string[]>([]);
  // A finished, failed or cancelled job's stage, closed by the person: it comes back with the next job.
  const [putAway, setPutAway] = useState<string | null>(null);

  const say = (err: unknown) => setError(isPermissionRefusal(err) ? w.create.refused : describeError(err instanceof Error ? err.message : String(err), w.create.errors));

  const engine = status.state === 'ready' ? status.engine : null;
  const job = engine?.job ?? null;
  // What the host said it makes: a host older than places made a scene of a place asked.
  const jobGallery = job ? galleryOf(job.scope) : null;
  const objectReady = engine?.objectOnly === 'ready';
  const now = useClock(shown && isLive(job));
  const title = gallery === 'places' ? w.create.newPlace : w.create.newObject;

  const start = async (source: 'video' | 'photos' | 'phone') => {
    if (source === 'phone') { setError(null); setPhoneContinue(null); setPhoneRedo([]); setPhoneFresh(false); setPhone(true); return; }
    setError(null);
    setBusy(true);
    try {
      const picked = source === 'video' ? await doors.pickVideo() : await doors.pickPhotos();
      // The dialog was closed: nothing to say.
      if (!picked?.path) return;
      const s = galleryScope(gallery, scope, objectReady);
      // The default is sent as nothing: a host older than the choice keeps 100 as well.
      const n = frames === DEFAULT_FRAMES ? undefined : frames;
      if (source === 'video') await doors.start(picked.path, quality, s, n);
      else await doors.startPhotos(picked.path, quality, s, n);
      await refresh();
    } catch (err) {
      console.warn(`[lab-3d] start from ${source} failed:`, err);
      say(err);
    } finally {
      setBusy(false);
    }
  };

  // A series placed by the phone capture: the same job as a folder of photos, with the form's choices.
  const createFromPhone = async (photosDir: string) => {
    const n = frames === DEFAULT_FRAMES ? undefined : frames;
    await doors.startPhotos(photosDir, quality, galleryScope(gallery, scope, objectReady), n);
    await refresh();
    setPhone(false);
  };

  // The same video or folder again, on the quick setting: less asked of the card (doc 176 §18).
  const retryQuick = async (failed: JobView) => {
    setError(null);
    try {
      setPutAway(failed.id);
      const n = frames === DEFAULT_FRAMES ? undefined : frames;
      const s = failed.scope ?? 'scene';
      if (failed.source === 'photos') await doors.startPhotos(failed.video, 'preview', s, n);
      else await doors.start(failed.video, 'preview', s, n);
      await refresh();
    } catch (err) {
      console.warn('[lab-3d] quick retry failed:', err);
      say(err);
    }
  };

  const act = async (what: 'continue' | 'cancel' | 'keep') => {
    if (!job) return;
    setError(null);
    try {
      if (what === 'continue') await doors.continueJob(job.id);
      else if (what === 'keep') await doors.keepNow(job.id);
      else await doors.cancel(job.id);
      await refresh();
    } catch (err) {
      console.warn(`[lab-3d] ${what} failed:`, err);
      say(err);
    }
  };

  const openSettings = async (page: 'video' | 'theia') => {
    try {
      await doors.openSettings(page);
    } catch (err) {
      console.warn('[lab-3d] settings did not open:', err);
      say(err);
    }
  };

  let screen: ReactNode;
  if (!shown) {
    screen = null;
  } else if (host === null) {
    screen = <Notice scanning>{w.host.pending}</Notice>;
  } else if (!inMnemosyne(host)) {
    screen = <NeedsMnemosyne w={w} />;
  } else if (status.state === 'loading') {
    screen = <Notice scanning>{title}</Notice>;
  } else if (status.state === 'error') {
    screen = (
      <Notice>
        <div className="error-line" role="alert">{status.refused ? w.create.refused : fill(w.create.unreadable, { detail: status.detail })}</div>
        <button onClick={() => void refresh()}><Retry size={16} />{w.create.retry}</button>
      </Notice>
    );
  } else if (phone) {
    // Photos need no engine: they are taken while a build runs (Tony, 24/10: « je peux pas prendre de nouvelles photos »).
    screen = <PhoneCapture w={w} lang={lang} gallery={gallery} onCreate={createFromPhone} continueSeries={phoneContinue} redo={phoneRedo} fresh={phoneFresh}
      engineBusy={!!job && isLive(job)} platform={inMnemosyne(host) ? host.platform : null} />;
  } else if (job && jobGallery && jobGallery !== gallery && isLive(job)) {
    // The host makes one thing at a time: the other gallery's job is said, never drawn here.
    screen = (
      <Notice scanning>
        <div className="drop-title">{jobGallery === 'places' ? w.create.placeRunning : w.create.objectRunning}</div>
        <button className="primary" onClick={() => onShowJob(jobGallery)}>{w.create.seeIt}</button>
      </Notice>
    );
  } else if (job && jobGallery === gallery && job.step !== 'cancelled' && putAway !== job.id) {
    screen = (
      <>
        <JobStage job={job} w={w} lang={lang} now={now} onAct={(a) => void act(a)}
          onView={() => { setPutAway(job.id); onView(jobObjectId(job)); }} onPutAway={() => setPutAway(job.id)}
          onAddPhotos={job.source === 'photos' && hasCapability(host, PHONE_CAPABILITY)
            // A series waiting in the app is named by its folder; the host refuses any other.
            ? () => {
              setPutAway(job.id);
              setPhoneContinue(job.video.split(/[\\/]/).pop() ?? null);
              setPhoneRedo((job.unplacedPhotos ?? []).map((p) => p.split(/[\\/]/).pop() ?? '').filter(Boolean));
              setPhone(true);
            }
            : undefined}
          onRetryQuick={() => void retryQuick(job)}
          onPhone={hasCapability(host, PHONE_CAPABILITY) ? () => { setPhoneContinue(null); setPhoneFresh(true); setPhone(true); } : undefined}
          afterDone={job.source === 'photos' && hasCapability(host, PHONE_CAPABILITY)
            ? <SeriesAfterJob w={w} gallery={gallery} photosDir={job.video} />
            : undefined} />
        {error && <div className="floating-error" role="alert">{error}</div>}
      </>
    );
  } else {
    const verdict = engineVerdict(status.engine);
    if (verdict !== 'ready') {
      const reason = status.engine.unsupportedReason;
      const line = verdict === 'unsupported' ? (reason ? w.create.unsupportedWhy[reason] : w.create.unsupported)
        : verdict === 'notInstalled' ? w.create.notInstalled : w.create.noFrames;
      screen = (
        <Notice>
          <div className="drop-title">{line}</div>
          {verdict !== 'unsupported' && <button className="primary" onClick={() => void openSettings('video')}>{w.create.openVideoSettings}</button>}
        </Notice>
      );
    } else {
      // Only the object alone needs the image engine: a place never says so.
      const objectWhy = gallery === 'places' ? null
        : status.engine.objectOnly === 'noEngine' ? w.create.objectNoEngine : status.engine.objectOnly === 'noMatte' ? w.create.objectNoMatte : null;
      screen = (
        <CreateForm w={w} gallery={gallery} phone={hasCapability(host, PHONE_CAPABILITY)} quality={quality} scope={galleryScope(gallery, scope, objectReady)} objectReady={objectReady} objectWhy={objectWhy} busy={busy} error={error}
          onQuality={(q) => { setQuality(q); writeChoice(safeLocalStorage(), galleryKey(QUALITY_KEY, gallery), q); }}
          onScope={(s) => { setScope(s); writeChoice(safeLocalStorage(), SCOPE_KEY, s); }}
          frames={frames} presets={FRAME_PRESETS}
          onFrames={(f) => { setFrames(f); writeChoice(safeLocalStorage(), galleryKey(FRAMES_KEY, gallery), String(f)); }}
          onSource={(s) => void start(s)}
          onImageSettings={gallery === 'objects' && status.engine.objectOnly === 'noEngine' ? () => void openSettings('theia') : null} />
      );
    }
  }

  return (
    <div className="sub-view">
      <header className="lib-bar sub-bar">
        <button onClick={phone ? () => setPhone(false) : onBack}><ChevronLeft size={16} />{phone ? title : w.tabs[gallery]}</button>
        <h2 className="lib-title">{phone ? w.phone.title : title}</h2>
        <span className="rule" />
      </header>
      <div className="sub-body">{screen}</div>
    </div>
  );
}
