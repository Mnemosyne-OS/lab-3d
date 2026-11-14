/**
 * SpotMarkers — the day's spots as lights over the scene (« Une journée »):
 * dark before their first moment, lit after, brighter just after a moment.
 * They follow the camera frame by frame: the stage says where each one falls
 * on screen after it draws, and the lights are moved by hand (no React render
 * per frame). A light behind the eye, or the spot the eye stands on, is hidden.
 *
 * @module features/day/SpotMarkers
 */
import { useEffect, useRef } from 'react';
import { anchorOf, type Spot, type SpotLight } from '../../core/dayModel';
import type { SplatStage } from '../../engine/SplatStage';

/** Closer than this share of the place's size, the eye stands on the spot: its light is hidden. */
const ON_SPOT_SHARE = 0.06;

export function SpotMarkers({ stage, spots, lightOf, hideId, onPick }: {
  stage: SplatStage | null;
  spots: readonly Spot[];
  lightOf: (spotId: string) => SpotLight;
  /** The spot whose photo is open: its light would sit on the photo. */
  hideId: string | null;
  onPick: (s: Spot) => void;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!stage) return;
    const scale = stage.placeScale() ?? 1;
    const anchors = spots.map((s) => anchorOf(s.pose, scale));
    stage.setFrameListener(() => {
      const shown = stage.project(anchors);
      spots.forEach((s, i) => {
        const el = refs.current.get(s.id);
        const p = shown[i];
        if (!el || !p) return;
        const show = p.inFront && p.distance > scale * ON_SPOT_SHARE && s.id !== hideId;
        el.style.visibility = show ? 'visible' : 'hidden';
        if (!show) return;
        // Far lights are smaller: the depth reads at a glance.
        const size = Math.min(1.25, Math.max(0.55, 1.35 - p.distance / (scale * 1.2)));
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${size.toFixed(3)})`;
      });
    });
    return () => stage.setFrameListener(null);
  }, [stage, spots, hideId]);

  return (
    <div className="day-markers">
      {spots.map((s) => (
        <button key={s.id} className={`day-marker ${lightOf(s.id)}`} style={{ visibility: 'hidden' }} title={s.name} aria-label={s.name}
          ref={(el) => { if (el) refs.current.set(s.id, el); else refs.current.delete(s.id); }}
          onClick={() => onPick(s)}>
          <span className="dot" aria-hidden />
          <span className="label">{s.name}</span>
        </button>
      ))}
    </div>
  );
}
