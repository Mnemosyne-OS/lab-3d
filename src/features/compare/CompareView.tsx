/**
 * CompareView — the two dates on stage (doc 163 §6, doc 166 lot 6). The
 * reference and the later date, carried into its frame by the similarity the
 * host measured, shown three ways:
 * - timeline: the later date fades in over the earlier as the slider moves;
 * - curtain: the later date right of a line the person drags;
 * - differences: both rendered from a viewpoint BOTH videos filmed, compared
 *   pixel by pixel (compareModel.colourDiff); what is measured is said under
 *   it, and what only one video saw is hatched, never « unchanged ».
 * A « weak » alignment carries a banner the whole time. Only ever mounted
 * on an alignment that passed (canOverlay).
 *
 * @module features/compare/CompareView
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { colourDiff, pct, sim3Pose, type Alignment, type DiffResult } from '../../core/compareModel';
import { CompareStage, type CompareMode } from '../../engine/CompareStage';
import { fill, type Dict } from '../../i18n/words';
import { Blend, ChevronLeft, ChevronRight, Diff, Flip, Target } from '../../ui/Icon';
import { Notice } from '../../ui/Notice';
import { loadScene } from '../objects/sceneLoad';
import { StageOverlay, ToolButton } from '../stage/StageOverlay';

type DiffState = { state: 'idle' } | { state: 'busy' } | { state: 'error'; error: string } | { state: 'ready'; data: DiffResult; base: Uint8ClampedArray };
export type ViewState = 'loading' | 'ready' | 'failed';

export function CompareView({ w, refId, movedId, alignment, labels, rows, objectOnly = false, onState }: {
  w: Dict; refId: string; movedId: string; alignment: Alignment;
  /** One of the two dates is an object alone (no room): the map compares only where the object stands. */
  objectOnly?: boolean;
  /** The two dates as the slider names them, earlier first. */
  labels: [string, string];
  /** The readout: what is compared, and how well it is aligned. */
  rows: ReadonlyArray<readonly [string, string]>;
  onState: (s: ViewState) => void;
}) {
  const mountA = useRef<HTMLDivElement>(null);
  const mountB = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const diffCanvas = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<CompareStage | null>(null);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const [loadPct, setLoadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<CompareMode>('fade');
  const [fade, setFade] = useState(0.5);
  const [curtain, setCurtain] = useState(0.5);
  const [viewIdx, setViewIdx] = useState(0);
  const [diff, setDiff] = useState<DiffState>({ state: 'idle' });
  const views = alignment.views.filter((v) => v.comparable);

  // Both scenes, read through the scene loader (`.spz`, else `.ply`: a freed object keeps one of them).
  useEffect(() => {
    const a = mountA.current, b = mountB.current, s = surface.current;
    if (!a || !b || !s) return;
    const stage = new CompareStage(a, b, s);
    stageRef.current = stage;
    let alive = true;
    setReady(false);
    setError(null);
    setLoadPct(0);
    onStateRef.current('loading');
    void (async () => {
      const ref = await loadScene(refId, (f) => { if (alive) setLoadPct(Math.round(f * 50)); });
      if (!ref.ok) throw new Error(ref.error);
      const moved = await loadScene(movedId, (f) => { if (alive) setLoadPct(50 + Math.round(f * 50)); });
      if (!moved.ok) throw new Error(moved.error);
      if (!alive) return;
      const start = alignment.views.find((v) => v.comparable)?.position ?? null;
      await stage.load({ bytes: ref.bytes, fileName: ref.fileName }, { bytes: moved.bytes, fileName: moved.fileName }, ref.rig, sim3Pose(alignment.sim3!), start);
      if (!alive) return;
      setReady(true);
      onStateRef.current('ready');
    })().catch((err: unknown) => {
      if (!alive) return;
      console.warn('[lab-3d] the two dates were not put on stage:', refId, movedId, err);
      setError(err instanceof Error ? err.message : String(err));
      onStateRef.current('failed');
    });
    return () => { alive = false; stageRef.current = null; stage.dispose(); };
    // One alignment, measured once, per pair: a new measure is a new viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refId, movedId, alignment.measuredAt]);

  const pickMode = (m: CompareMode) => { setMode(m); stageRef.current?.setMode(m); };

  // The difference: measured once per viewpoint asked, painted on its own canvas.
  useEffect(() => {
    if (mode !== 'diff' || !ready || !views.length) return;
    const v = views[Math.min(viewIdx, views.length - 1)]!;
    let alive = true;
    setDiff({ state: 'busy' });
    void (async () => {
      const stage = stageRef.current;
      if (!stage) throw new Error('NOT_READY');
      const shot = await stage.measure(v);
      if (!alive) return;
      const d = colourDiff(shot.a, shot.b, shot.w, shot.h);
      // The base under the map is the reference's own render, turned to top-first rows.
      const base = new Uint8ClampedArray(shot.w * shot.h * 4);
      for (let y = 0; y < shot.h; y++) base.set(shot.a.subarray((shot.h - 1 - y) * shot.w * 4, (shot.h - y) * shot.w * 4), y * shot.w * 4);
      setDiff({ state: 'ready', data: d, base });
    })().catch((err: unknown) => {
      console.warn('[lab-3d] difference not measured:', err);
      if (alive) setDiff({ state: 'error', error: err instanceof Error ? err.message : String(err) });
    });
    return () => { alive = false; };
    // The views come from the alignment, fixed for this viewer's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, viewIdx, ready]);

  useEffect(() => {
    const c = diffCanvas.current;
    if (!c || diff.state !== 'ready') return;
    const { data, base } = diff;
    c.width = data.width;
    c.height = data.height;
    const ctx = c.getContext('2d');
    if (!ctx) { console.warn('[lab-3d] no 2D canvas for the difference map'); return; }
    ctx.putImageData(new ImageData(new Uint8ClampedArray(base), data.width, data.height), 0, 0);
    const layer = document.createElement('canvas');
    layer.width = data.width;
    layer.height = data.height;
    layer.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(data.image), data.width, data.height), 0, 0);
    ctx.drawImage(layer, 0, 0);
  }, [diff]);

  // The curtain's line: it sits OVER the turning surface, so a drag on it never turns the scene.
  const dragLine = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    setCurtain(Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))));
  };

  const bStyle = mode === 'fade' ? { opacity: fade } : mode === 'curtain' ? { clipPath: `inset(0 0 0 ${curtain * 100}%)` } : { opacity: 0 };
  const hint = mode === 'fade' ? w.compare.fadeHint : mode === 'curtain' ? w.compare.curtainHint : w.compare.diffHint;
  const step = (d: number) => setViewIdx((i) => (i + d + views.length) % Math.max(1, views.length));

  return (
    <>
      <div ref={mountA} className="stage" />
      <div ref={mountB} className="stage" style={bStyle} />
      <div ref={surface} className="stage compare-surface" />
      {ready && mode === 'curtain' && (
        <div className="curtain-line" style={{ left: `${curtain * 100}%` }} role="separator" aria-label={w.compare.curtainHint}
          onPointerDown={dragLine} onPointerMove={dragLine} />
      )}
      {!ready && (
        error
          ? <Notice><p className="error-line" role="alert">{fill(w.compare.sceneError, { error })}</p></Notice>
          : <Notice scanning><span>{fill(w.compare.loading, { pct: loadPct })}</span></Notice>
      )}
      {/* Under the readout and the tools: the map is centred, they keep their corners. */}
      {ready && mode === 'diff' && (
        <div className="diff-panel" data-testid="diff-panel">
          {views.length === 0 ? <p className="diff-note">{w.compare.diffNoView}</p> : (
            <>
              {diff.state === 'ready'
                ? <canvas ref={diffCanvas} className="diff-canvas" />
                : <p className="diff-note">{diff.state === 'error' ? diff.error : w.compare.diffComputing}</p>}
              <div className="diff-legend">
                <div className="diff-views">
                  <button className="icon" aria-label={w.compare.prev} title={w.compare.prev} onClick={() => step(-1)}><ChevronLeft size={16} /></button>
                  <span>{fill(w.compare.diffView, { n: Math.min(viewIdx, views.length - 1) + 1, m: views.length })}</span>
                  <button className="icon" aria-label={w.compare.next} title={w.compare.next} onClick={() => step(1)}><ChevronRight size={16} /></button>
                </div>
                <p>{w.compare.diffWhat}</p>
                {objectOnly && <p className="diff-object-only">{w.compare.diffObjectOnly}</p>}
                {diff.state === 'ready' && (
                  <p className="diff-stats">{fill(w.compare.diffStats, { changed: pct(diff.data.changed, diff.data.covered), covered: pct(diff.data.covered, diff.data.total) })}</p>
                )}
                <p className="diff-chosen">{w.compare.thresholdsChosen}</p>
              </div>
            </>
          )}
        </div>
      )}
      {ready && (
        <StageOverlay
          rows={rows}
          hint={hint}
          tools={(
            <>
              <ToolButton label={w.compare.modeFade} on={mode === 'fade'} onClick={() => pickMode('fade')}><Blend /></ToolButton>
              <ToolButton label={w.compare.modeCurtain} on={mode === 'curtain'} onClick={() => pickMode('curtain')}><Flip /></ToolButton>
              <ToolButton label={w.compare.modeDiff} on={mode === 'diff'} onClick={() => pickMode('diff')}><Diff /></ToolButton>
              {mode !== 'diff' && <ToolButton label={w.compare.reset} onClick={() => stageRef.current?.resetView()}><Target /></ToolButton>}
            </>
          )}
        />
      )}
      {ready && mode === 'fade' && (
        <div className="fade-bar glass">
          <span>{labels[0]}</span>
          <input type="range" min={0} max={1} step={0.01} value={fade} aria-label={w.compare.fadeHint} onChange={(e) => setFade(Number(e.target.value))} />
          <span>{labels[1]}</span>
        </div>
      )}
      {ready && alignment.verdict === 'weak' && <div className="weak-banner" role="status">{w.compare.weakBanner}</div>}
    </>
  );
}
