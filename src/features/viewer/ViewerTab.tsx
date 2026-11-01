/**
 * ViewerTab — the tab that works anywhere: drop or pick a splat scene (.spz,
 * .ply, .splat, .ksplat) and turn around it. No host needed: the file is read
 * in the page, Spark draws it.
 *
 * @module features/viewer/ViewerTab
 */
import { useRef, useState, type DragEvent } from 'react';
import { HudPanel } from '../../ui/HudPanel';
import { StepRail } from '../../ui/StepRail';
import { Close, Flip, Orbit, Target, Upload } from '../../ui/Icon';
import { fill, type Dict } from '../../i18n/words';
import { formatBytes, formatCount, formatMs } from '../../lib/format';
import { failureKind, loadRail, type LoadStep } from '../stage/loadModel';
import { useSceneLoader } from '../stage/useSceneLoader';
import { LoadPanel } from '../stage/LoadPanel';
import { StageOverlay, ToolButton } from '../stage/StageOverlay';
import { readFileBytes } from './readFile';
import { SCENE_EXTENSIONS, isSceneFile } from './viewerModel';

export function ViewerTab({ w, lang }: { w: Dict; lang: string }) {
  const loader = useSceneLoader<{ size: number }>();
  const { view } = loader;
  const [over, setOver] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [flipped, setFlipped] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const labels: Record<LoadStep, string> = { read: w.viewer.stepRead, decode: w.stage.stepDecode, stage: w.stage.stepStage };

  const open = (file: File) => {
    if (!isSceneFile(file.name)) {
      loader.refuse(file.name, 'UNSUPPORTED');
      return;
    }
    void loader.load(
      file.name,
      async (onBytes) => ({ bytes: await readFileBytes(file, onBytes), fileName: file.name, meta: { size: file.size } }),
      (s) => { s.setFlipped(flipped); s.setAutoRotate(rotate); },
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) open(file);
  };

  const failure = (reason: string, at: number, name: string): string => {
    if (reason === 'UNSUPPORTED') return fill(w.viewer.unsupported, { name });
    const kind = failureKind(reason, at);
    return kind === 'empty' ? w.stage.empty : fill(kind === 'read' ? w.viewer.readFailed : w.stage.decodeFailed, { detail: reason });
  };

  return (
    <div className="stage-wrap" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDrop={onDrop}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}>
      {/* The canvas lives as long as the tab: a scene replaces the last one on the same stage. */}
      <div ref={loader.hostRef} className="stage" style={{ visibility: view.kind === 'ready' ? 'visible' : 'hidden' }} />

      <input ref={input} type="file" accept={SCENE_EXTENSIONS.join(',')} hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) open(f); }} />

      {(view.kind === 'idle' || view.kind === 'failed') && (
        <div className={`dropzone${over ? ' over' : ''}`}>
          <HudPanel index="01" title={w.viewer.panel}>
            <div className="drop-body">
              <div className="scanner" aria-hidden>
                <span className="ring" /><span className="ring r2" /><span className="ring r3" /><span className="sweep" /><span className="core" />
              </div>
              <div className="drop-title">{w.viewer.dropTitle}</div>
              <div className="formats">{SCENE_EXTENSIONS.map((x) => <span key={x}>{x}</span>)}</div>
              <button className="primary" onClick={() => input.current?.click()}><Upload size={16} />{w.viewer.pick}</button>
              {view.kind === 'failed' && (
                <>
                  {view.at > 0 && <StepRail label={w.viewer.panel} steps={loadRail(view.at, true, view.took, '', labels, lang)} />}
                  <div className="error-line" role="alert">{failure(view.reason, view.at, view.name)}</div>
                </>
              )}
            </div>
          </HudPanel>
        </div>
      )}

      {view.kind === 'loading' && (
        <LoadPanel title={view.name} label={w.viewer.panel} steps={loadRail(view.at, false, view.took, view.readShare, labels, lang)} />
      )}

      {view.kind === 'ready' && (
        <StageOverlay
          hint={w.stage.hint}
          rows={[
            [w.viewer.file, view.name],
            [w.stage.size, formatBytes(view.meta.size, lang), true],
            [w.stage.points, formatCount(view.info.splats, lang)],
            [w.stage.time, formatMs(view.ms, lang), true],
          ]}
          tools={(
            <>
              <ToolButton label={w.stage.rotate} on={rotate} onClick={() => { const on = !rotate; setRotate(on); loader.stage.current?.setAutoRotate(on); }}><Orbit /></ToolButton>
              <ToolButton label={w.viewer.flip} on={flipped} onClick={() => { const on = !flipped; setFlipped(on); loader.stage.current?.setFlipped(on); }}><Flip /></ToolButton>
              <ToolButton label={w.stage.reset} onClick={() => loader.stage.current?.resetView()}><Target /></ToolButton>
              <ToolButton label={w.stage.close} onClick={loader.close}><Close /></ToolButton>
            </>
          )}
        />
      )}
    </div>
  );
}
