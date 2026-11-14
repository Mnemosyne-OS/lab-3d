/**
 * PhotoView — what a spot shows at the hour on the timeline (« Une journée »):
 * the photo of its latest moment, appearing through ink over the one before.
 * Moving the timeline at a spot shows the moments one after the other: the
 * same stand photographed every half hour is the tattoo growing.
 *
 * @module features/day/PhotoView
 */
import { useEffect, useState } from 'react';
import { momentPhotos, spotAt, spotMoments, type Day, type Spot } from '../../core/dayModel';
import { fill, type Dict } from '../../i18n/words';
import { formatHour, formatInputTime } from '../../lib/format';
import { ChevronLeft, ChevronRight, Close, Trash } from '../../ui/Icon';
import { InkReveal } from './InkReveal';
import { prefetchPhotos, usePhoto } from './photoCache';

export function PhotoView({ w, lang, day, spot, t, photo, onPhoto, onJump, onClose, onRetime, onRemove }: {
  w: Dict; lang: string;
  day: Day; spot: Spot;
  /** The hour on the timeline. */
  t: number;
  /** Which photo of the moment (clamped to the moment's photos). */
  photo: number;
  onPhoto: (i: number) => void;
  /** Move the timeline to this hour (the spot's first moment). */
  onJump: (t: number) => void;
  onClose: () => void;
  /**
   * A placed moment is corrected here, where it is seen: its hour typed as
   * « 14:30 », or the moment removed (asked twice). The panel only reaches
   * the moments still to place.
   */
  onRetime?: (momentId: string, hhmm: string) => void;
  onRemove?: (momentId: string) => void;
}) {
  const d = w.day;
  const at = spotAt(day, spot.id, t);
  // « Remove » asked once belongs to the moment it was asked on.
  const [removing, setRemoving] = useState<string | null>(null);
  const paths = at ? momentPhotos(at.moment) : [];
  const i = Math.min(Math.max(0, photo), Math.max(0, paths.length - 1));
  const path = paths[i] ?? null;
  const { url, failed } = usePhoto(path);
  // The photo shown before this one stays under the ink until it is covered.
  const [layers, setLayers] = useState<{ cur: string | null; prev: string | null }>({ cur: null, prev: null });
  useEffect(() => {
    if (url) setLayers((l) => (l.cur === url ? l : { prev: l.cur, cur: url }));
  }, [url]);
  useEffect(() => { prefetchPhotos(paths.slice(i + 1, i + 2)); }, [paths.join('\n'), i]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = <button className="icon photo-close" title={d.closePhoto} aria-label={d.closePhoto} onClick={onClose}><Close /></button>;

  if (!at) {
    const first = spotMoments(day, spot.id)[0];
    return (
      <div className="day-photo empty" role="dialog" aria-label={spot.name}>
        {close}
        <div className="photo-empty">
          <strong>{spot.name}</strong>
          <span>{fill(d.nothingYet, { time: formatHour(t, lang) })}</span>
          {first && <button onClick={() => onJump(first.at)}>{fill(d.firstAt, { time: formatHour(first.at, lang) })}</button>}
        </div>
      </div>
    );
  }

  const m = at.moment;
  return (
    <div className="day-photo" role="dialog" aria-label={spot.name}>
      {close}
      <div className="photo-frame">
        {failed ? <div className="error-line" role="alert">{d.photoUnreadable}</div>
          : layers.cur ? <InkReveal key={layers.cur} src={layers.cur} below={layers.prev} alt={`${spot.name} · ${formatHour(m.at, lang)}`} />
            : <div className="photo-wait" aria-hidden />}
      </div>
      <div className="photo-caption">
        <strong>{spot.name}</strong>
        {onRetime
          ? <input className="photo-time" type="time" value={formatInputTime(m.at)} title={d.timeFrom[m.atFrom]} aria-label={d.momentTime}
              onChange={(e) => { if (e.target.value) onRetime(m.id, e.target.value); }} />
          : <span className="mono">{formatHour(m.at, lang)}</span>}
        <span className="minor" title={d.timeFrom[m.atFrom]}>{at.index + 1} / {at.count}</span>
        {onRemove && (removing === m.id
          ? <button className="danger" onClick={() => { setRemoving(null); onRemove(m.id); }}>{d.removeMomentSure}</button>
          : <button className="icon" title={d.removeMoment} aria-label={d.removeMoment} onClick={() => setRemoving(m.id)}><Trash size={16} /></button>)}
        {paths.length > 1 && (
          <span className="photo-step">
            <button className="icon" title={d.prevPhoto} aria-label={d.prevPhoto} disabled={i === 0} onClick={() => onPhoto(i - 1)}><ChevronLeft /></button>
            <span className="mono">{fill(d.photoOf, { i: i + 1, n: paths.length })}</span>
            <button className="icon" title={d.nextPhoto} aria-label={d.nextPhoto} disabled={i >= paths.length - 1} onClick={() => onPhoto(i + 1)}><ChevronRight /></button>
          </span>
        )}
      </div>
    </div>
  );
}
