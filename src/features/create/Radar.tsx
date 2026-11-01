/**
 * Radar — where the cameras were, seen from above (the scene's real
 * vertical): one dot per frame COLMAP placed, read from cameras.json, around
 * the subject at the centre, the sector no camera filmed hatched. While COLMAP
 * places the frames nothing is written yet, so the radar only sweeps: no dot
 * is drawn before the file exists, never one at a time.
 *
 * @module features/create/Radar
 */
import { useId } from 'react';
import { radar, type Rig } from '../../core/stageModel';

export function Radar({ rig, sweeping, size = 220, label }: { rig: Rig | null; sweeping: boolean; size?: number; label?: string }) {
  const uid = useId().replace(/:/g, '');
  const { dots, gap } = radar(rig);
  const r = 92;
  const at = (deg: number, k = r) => [100 + k * Math.cos((deg * Math.PI) / 180), 100 + k * Math.sin((deg * Math.PI) / 180)] as const;
  let gapPath: string | null = null;
  if (gap) {
    const [x1, y1] = at(gap.from), [x2, y2] = at(gap.to);
    gapPath = `M100 100 L${x1} ${y1} A${r} ${r} 0 ${gap.to - gap.from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  }
  return (
    <svg className={`radar${sweeping ? ' sweeping' : ''}`} width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={label}>
      <defs>
        <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0v6" className="radar-hatch-line" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r={r} className="radar-face" />
      {[0.33, 0.66].map((k) => <circle key={k} cx="100" cy="100" r={r * k} className="radar-ring" />)}
      <path d="M100 8v184M8 100h184" className="radar-ring" />
      {gapPath && <path d={gapPath} fill={`url(#hatch-${uid})`} className="radar-gap" />}
      {sweeping && <g className="radar-sweep"><path d={`M100 100 L${100 + r} 100 A${r} ${r} 0 0 0 ${at(-40)[0]} ${at(-40)[1]} Z`} /></g>}
      {dots.map((d, i) => <circle key={i} cx={100 + d.x * r * 0.92} cy={100 + d.y * r * 0.92} r="2.6" className="radar-dot" />)}
      <circle cx="100" cy="100" r="5" className="radar-subject" />
    </svg>
  );
}
