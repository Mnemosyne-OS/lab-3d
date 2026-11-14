/**
 * DayPanel — the spots of the day and the photos still to place (« Une
 * journée »), beside the scene. A spot is pinned where the eye stands; each
 * spot takes photos from the phone or from a folder, and goes there in a
 * flight. Photos taken without a spot wait under « To place », with the time
 * they were read at, which the person can correct.
 *
 * @module features/day/DayPanel
 */
import { useState } from 'react';
import { momentPhotos, spotMoments, unplacedMoments, type Day, type Moment } from '../../core/dayModel';
import { fill, type Dict } from '../../i18n/words';
import { formatHour, formatInputTime as inputTime, pluralOf } from '../../lib/format';
import { HudPanel } from '../../ui/HudPanel';
import { Folder, Phone, Pin, Target, Trash } from '../../ui/Icon';
import { usePhoto } from './photoCache';

export type ImportFrom = 'phone' | 'folder';

function Cover({ m }: { m: Moment }) {
  const { url, failed } = usePhoto(momentPhotos(m)[0] ?? null);
  return <span className={`moment-cover${failed ? ' failed' : ''}`}>{url && <img src={url} alt="" draggable={false} />}</span>;
}

export function DayPanel({ w, lang, day, busy, error, canPhone, onAddSpot, onRename, onGo, onRemoveSpot, onImport, onPlace, onPlaceHere, onRemoveMoment, onRetime }: {
  w: Dict; lang: string; day: Day;
  /** Photos are being read: the import buttons wait. */
  busy: boolean;
  error: string | null;
  /** The host announces its phone capture (`phone.photos`): without it, only folders. */
  canPhone: boolean;
  onAddSpot: () => void;
  onRename: (spotId: string, name: string) => void;
  onGo: (spotId: string) => void;
  onRemoveSpot: (spotId: string) => void;
  onImport: (from: ImportFrom, spotId: string | null) => void;
  onPlace: (momentId: string, spotId: string) => void;
  onPlaceHere: (momentId: string) => void;
  onRemoveMoment: (momentId: string) => void;
  onRetime: (momentId: string, hhmm: string) => void;
}) {
  const d = w.day;
  const unplaced = unplacedMoments(day);
  // A spot about to be removed asks once more, on its own row.
  const [removing, setRemoving] = useState<string | null>(null);
  const count = (n: number) => fill(pluralOf(n, lang, d.momentOne, d.momentsN), { n });

  return (
    <HudPanel className="day-panel" title={d.spotsTitle}>
      <button className="primary" onClick={onAddSpot}><Pin size={16} />{d.addSpot}</button>
      {error && <div className="error-line" role="alert">{error}</div>}
      {busy && <div className="create-why" role="status">{d.reading}</div>}
      {/* A greyed button says nothing on its own: the reason is written once, here. */}
      {!canPhone && <p className="decor-note">{d.phoneMissing}</p>}
      {day.spots.length === 0 && <p className="decor-note">{d.noSpots}</p>}
      {/* Only the lists scroll: the panel's lit corners sit 1 px outside it and would give it a scrollbar. */}
      <div className="day-panel-body">
      <ul className="day-spots">
        {day.spots.map((s) => {
          const n = spotMoments(day, s.id).length;
          return (
            <li key={s.id} className="day-spot">
              <input className="spot-name" value={s.name} aria-label={d.rename} maxLength={60}
                onChange={(e) => onRename(s.id, e.target.value)} />
              <span className="spot-count">{count(n)}</span>
              <div className="spot-actions">
                <button className="icon" title={d.goTo} aria-label={d.goTo} onClick={() => onGo(s.id)}><Target size={16} /></button>
                <button className="icon" title={d.addPhone} aria-label={`${d.addPhone} · ${s.name}`} disabled={busy || !canPhone} onClick={() => onImport('phone', s.id)}><Phone size={16} /></button>
                <button className="icon" title={d.addFolder} aria-label={`${d.addFolder} · ${s.name}`} disabled={busy} onClick={() => onImport('folder', s.id)}><Folder size={16} /></button>
                {removing === s.id
                  ? <button className="danger" onClick={() => { setRemoving(null); onRemoveSpot(s.id); }}>{d.removeSpot}</button>
                  : <button className="icon" title={d.removeSpot} aria-label={`${d.removeSpot} · ${s.name}`} onClick={() => setRemoving(s.id)}><Trash size={16} /></button>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="day-unplaced-head">
        <span className="opt-label">{d.unplaced}</span>
        <span className="spot-actions">
          <button className="icon" title={d.addPhone} aria-label={`${d.addPhone} · ${d.unplaced}`} disabled={busy || !canPhone} onClick={() => onImport('phone', null)}><Phone size={16} /></button>
          <button className="icon" title={d.addFolder} aria-label={`${d.addFolder} · ${d.unplaced}`} disabled={busy} onClick={() => onImport('folder', null)}><Folder size={16} /></button>
        </span>
      </div>
      <ul className="day-unplaced">
        {unplaced.map((m) => (
          <li key={m.id} className="day-moment">
            <Cover m={m} />
            <div className="moment-body">
              <label className="moment-time" title={d.timeFrom[m.atFrom]}>
                <span className="sr-only">{d.momentTime}</span>
                <input type="time" value={inputTime(m.at)} aria-label={`${d.momentTime} · ${formatHour(m.at, lang)}`}
                  onChange={(e) => { if (e.target.value) onRetime(m.id, e.target.value); }} />
              </label>
              <span className="minor">{fill(pluralOf(m.names.length, lang, d.photoOne, d.photosN), { n: m.names.length })}</span>
              <div className="spot-actions">
                <button title={d.placeHere} onClick={() => onPlaceHere(m.id)}><Pin size={14} />{d.placeHere}</button>
                {day.spots.length > 0 && (
                  <select aria-label={d.placeAt} value="" onChange={(e) => { if (e.target.value) onPlace(m.id, e.target.value); }}>
                    <option value="">{d.placeAt}</option>
                    {day.spots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {/* Asked twice, like a spot or a day: one click alone takes nothing away. */}
                {removing === m.id
                  ? <button className="danger" onClick={() => { setRemoving(null); onRemoveMoment(m.id); }}>{d.removeMomentSure}</button>
                  : <button className="icon" title={d.removeMoment} aria-label={d.removeMoment} onClick={() => setRemoving(m.id)}><Trash size={14} /></button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      </div>
    </HudPanel>
  );
}
