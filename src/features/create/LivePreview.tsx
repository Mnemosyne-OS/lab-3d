/**
 * LivePreview — the cloud Brush is training, live (doc 163): each time Brush
 * writes a file, the host compresses it into `work/exports/live.spz` and says
 * its step (`liveStep`); this reads it and replaces the cloud on the same
 * stage, so what sharpens on screen IS the training. It starts on a filmed
 * viewpoint and turns by itself (a way of showing a shape, not a progress),
 * not at all under « reduce motion ». A file that cannot be read keeps the
 * last cloud.
 *
 * @module features/create/LivePreview
 */
import { useEffect, useRef, useState } from 'react';
import { readWhole } from '../../core/model';
import type { Rig } from '../../core/stageModel';
import { SplatStage } from '../../engine/SplatStage';
import { doors } from '../../host/doors';

const LIVE_FILE = 'work/exports/live.spz';

export function LivePreview({ id, step, rig, onShown }: { id: string; step: number; rig: Rig | null; onShown: (step: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<SplatStage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = new SplatStage(el);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.setAutoRotate(!reduced);
    stage.current = s;
    return () => { s.dispose(); stage.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readWhole((o) => doors.read(id, LIVE_FILE, o)).then(async (r) => {
      if (cancelled) return;
      if (!r.ok) { console.warn('[lab-3d] live cloud unreadable:', step, r.error); setFailed(true); return; }
      try {
        await stage.current?.load(r.bytes, 'live.spz', { rig, keepView: true });
        if (!cancelled) { setFailed(false); onShown(step); }
      } catch (err) {
        // A newer cloud asked meanwhile is the normal case, not a failure.
        if (cancelled || (err instanceof Error && err.message === 'SUPERSEDED')) return;
        console.warn('[lab-3d] live cloud could not be drawn:', step, err);
        setFailed(true);
      }
    });
    return () => { cancelled = true; };
  }, [id, step, rig, onShown]);

  return <div ref={host} className={`live-stage${failed ? ' failed' : ''}`} />;
}
