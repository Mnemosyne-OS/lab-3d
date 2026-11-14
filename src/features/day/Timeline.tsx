/**
 * Timeline — the day under the scene (« Une journée »): the hours, a light per
 * moment (cyan placed, amber still to place), and the cursor. Dragging the
 * cursor moves the hour: the spots light up as their moments pass. The
 * keyboard moves it too (arrows: 5 minutes, Shift: an hour, Home / End).
 *
 * @module features/day/Timeline
 */
import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { fractionOf, hourTicks, timeAt, type Moment, type Range } from '../../core/dayModel';
import type { Dict } from '../../i18n/words';
import { formatHour as hhmm } from '../../lib/format';
import { Play, Stop } from '../../ui/Icon';

const STEP_MS = 5 * 60_000;
const HOUR_MS = 3_600_000;

export function Timeline({ w, lang, range, t, moments, spotName, playing, canPlay, onScrub, onPick, onPlay, onStop }: {
  w: Dict; lang: string;
  range: Range;
  /** The time on the cursor. */
  t: number;
  moments: readonly Moment[];
  /** The name of a moment's spot, for its light's title. */
  spotName: (spotId: string | null) => string;
  playing: boolean;
  /** Whether there is a placed moment to play. */
  canPlay: boolean;
  onScrub: (t: number) => void;
  onPick: (m: Moment) => void;
  onPlay: () => void;
  onStop: () => void;
}) {
  const d = w.day;
  const track = useRef<HTMLDivElement>(null);
  const pct = (x: number) => `${(fractionOf(range, x) * 100).toFixed(3)}%`;

  const at = (clientX: number): number => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return t;
    return timeAt(range, (clientX - r.left) / r.width);
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onScrub(at(e.clientX));
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) onScrub(at(e.clientX));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? HOUR_MS : STEP_MS;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? t + step
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? t - step
        : e.key === 'Home' ? range.start : e.key === 'End' ? range.end : null;
    if (next === null) return;
    e.preventDefault();
    // The scene walks and turns on the window's arrow keys: a key that moved the hour goes no further.
    e.stopPropagation();
    onScrub(Math.min(range.end, Math.max(range.start, next)));
  };

  return (
    <div className="day-timeline">
      {playing
        ? <button className="icon on" title={d.stop} aria-label={d.stop} onClick={onStop}><Stop /></button>
        : <button className="icon" title={d.play} aria-label={d.play} disabled={!canPlay} onClick={onPlay}><Play /></button>}
      <div ref={track} className="tl-track" role="slider" tabIndex={0} aria-label={d.timeline}
        aria-valuemin={range.start} aria-valuemax={range.end} aria-valuenow={Math.round(t)} aria-valuetext={hhmm(t, lang)}
        onPointerDown={down} onPointerMove={move} onKeyDown={key}>
        <div className="tl-line" />
        <div className="tl-fill" style={{ width: pct(t) }} />
        {hourTicks(range).map((h) => (
          <span key={h} className="tl-tick" style={{ left: pct(h) }}><span>{hhmm(h, lang)}</span></span>
        ))}
        {moments.map((m) => (
          <button key={m.id} className={`tl-moment${m.spotId ? '' : ' unplaced'}${m.at <= t ? ' passed' : ''}`} style={{ left: pct(m.at) }}
            title={`${hhmm(m.at, lang)} · ${spotName(m.spotId)}`} aria-label={`${hhmm(m.at, lang)} · ${spotName(m.spotId)}`}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => onPick(m)} />
        ))}
        {/* The label slides from left-aligned to right-aligned along the track: it never leaves it at either end. */}
        <div className="tl-head" style={{ left: pct(t) }}><span style={{ transform: `translateX(-${(fractionOf(range, t) * 100).toFixed(1)}%)` }}>{hhmm(t, lang)}</span></div>
      </div>
    </div>
  );
}
