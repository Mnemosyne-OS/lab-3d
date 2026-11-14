/**
 * DayGuide — the guide of « Une journée » (dayGuideModel): the four steps in a
 * bar, the one to do now in a sentence, and one big button. Nothing to read
 * before acting: the button IS the next thing to do.
 *
 * On the choice of the place it sits on top of the library; over the scene it
 * sits in the bottom-left corner, above the timeline.
 *
 * @module features/day/DayGuide
 */
import { useState } from 'react';
import type { Guide } from '../../core/dayGuideModel';
import type { Quality } from '../../host/doors';
import { agoOf, stepStates } from '../../core/dayGuideModel';
import type { Spot } from '../../core/dayModel';
import { fill, type Dict } from '../../i18n/words';
import { formatHour } from '../../lib/format';
import { Check, Cube, Folder, Phone, Pin, Play, Spark } from '../../ui/Icon';

export function DayGuide({ w, lang, guide, where, spots = [], spotId = null, canPhone = true, busy = false, newestName = '', error = null,
  waitingPhotos = 0, canReplay = true, note = null, placedPhotos = 0, completing = false, building = false,
  onSpot, onFilmPlace, onSeeBuilding, onStartDay, onResume, onPinSpot, onMoment, onTakeWaiting, onEnd, onScan, onReplay, onRemoveDay, onComplete }: {
  w: Dict; lang: string; guide: Guide;
  /** On the choice of the place, or over the scene. */
  where: 'pick' | 'stage';
  spots?: readonly Spot[];
  /** The spot the next moment goes to. */
  spotId?: string | null;
  canPhone?: boolean;
  /** Photos are being read: said here, the panel being closed. */
  busy?: boolean;
  /** The newest place's name, at « Place ready ». */
  newestName?: string;
  /** What failed, said here when the panel that also says it is closed. */
  error?: string | null;
  /** Photos of a phone series closed without « Done » (the host closes one after 10 min idle): 0 when none. */
  waitingPhotos?: number;
  /** A placed moment exists: the day can be played. */
  canReplay?: boolean;
  /** What the placement of the photos says now (placing, placed, failed); null: nothing. */
  note?: string | null;
  onSpot?: (id: string) => void;
  onFilmPlace?: () => void;
  onSeeBuilding?: () => void;
  onStartDay?: () => void;
  onResume?: () => void;
  onPinSpot?: () => void;
  onMoment?: (from: 'phone' | 'folder') => void;
  onTakeWaiting?: () => void;
  onEnd?: (ended: boolean) => void;
  onScan?: () => void;
  onReplay?: () => void;
  /** Deletes the open day (asked once here first); absent on the choice of the place. */
  onRemoveDay?: () => void;
  /** Photos of the day the host placed in the place: what « Complete the place » takes. */
  placedPhotos?: number;
  /** A completion was asked and the host has not answered yet. */
  completing?: boolean;
  /** A build runs (this place or another): nothing can start, the button waits. */
  building?: boolean;
  /** The place made again with the day's placed photos, in this quality (doc 166 §16.y); absent: not offered. */
  onComplete?: (quality: Quality) => void;
}) {
  const [askingRemove, setAskingRemove] = useState(false);
  const [askingComplete, setAskingComplete] = useState(false);
  const g = w.day.guide;
  const since = guide.sinceMin === null ? null : agoOf(guide.sinceMin);
  const ago = !since ? '' : since.kind === 'now' ? g.justNow : since.kind === 'min' ? fill(g.minutesAgo, { n: since.n }) : fill(g.hoursAgo, { h: since.h, m: since.m });

  let title = '';
  let line = '';
  let main: { label: string; icon: JSX.Element; onClick?: () => void; disabled?: boolean } | null = null;
  const more: Array<{ label: string; onClick?: () => void; disabled?: boolean }> = [];

  if (guide.step === 'place') {
    if (guide.place === 'building') {
      title = g.buildingTitle; line = g.buildingLine;
      main = { label: g.buildingGo, icon: <Spark size={18} />, onClick: onSeeBuilding };
    } else if (guide.place === 'resume') {
      title = g.resumeTitle; line = newestName;
      main = { label: g.resumeGo, icon: <Play size={18} />, onClick: onResume };
      more.push({ label: g.newDay, onClick: onStartDay });
      more.push({ label: g.otherPlace, onClick: onFilmPlace });
    } else if (guide.place === 'ready') {
      title = g.readyTitle; line = newestName;
      main = { label: g.readyGo, icon: <Play size={18} />, onClick: onStartDay };
      more.push({ label: g.otherPlace, onClick: onFilmPlace });
    } else {
      title = g.placeTitle; line = g.placeTips;
      main = { label: g.placeGo, icon: <Spark size={18} />, onClick: onFilmPlace };
    }
  } else if (guide.step === 'spot') {
    title = g.spotTitle; line = g.spotLine;
    main = { label: g.spotGo, icon: <Pin size={18} />, onClick: onPinSpot };
    // Photos straight away: the host places them, and makes the spot where they were taken.
    more.push({ label: g.photosNoSpot, onClick: () => onMoment?.(canPhone ? 'phone' : 'folder'), disabled: busy });
  } else if (guide.step === 'moments') {
    title = guide.due ? g.due : g.momentsTitle;
    line = guide.lastAt === null ? g.momentsFirst : fill(g.momentsLast, { time: formatHour(guide.lastAt, lang), ago });
    if (waitingPhotos > 0) {
      // A series the host closed on its own (10 min without a photo) or left by « Back »: its photos would be lost.
      title = g.momentsTitle;
      line = fill(g.waitingLine, { n: waitingPhotos });
      main = { label: g.waitingGo, icon: <Phone size={18} />, onClick: onTakeWaiting, disabled: busy };
    } else {
      main = canPhone
        ? { label: g.momentGo, icon: <Phone size={18} />, onClick: () => onMoment?.('phone'), disabled: busy }
        : { label: g.fromFolder, icon: <Folder size={18} />, onClick: () => onMoment?.('folder'), disabled: busy };
    }
    if (canPhone && waitingPhotos > 0) more.push({ label: g.momentGo, onClick: () => onMoment?.('phone'), disabled: busy });
    if (canPhone) more.push({ label: g.fromFolder, onClick: () => onMoment?.('folder'), disabled: busy });
    more.push({ label: g.endDay, onClick: () => onEnd?.(true) });
  } else {
    title = g.endTitle;
    main = { label: g.scanTattoo, icon: <Cube size={18} />, onClick: onScan };
    // Only with photos the host placed: nothing else can fill in what the morning did not see.
    if (onComplete && placedPhotos > 0) more.push({ label: fill(g.complete, { n: placedPhotos }), onClick: () => setAskingComplete(true), disabled: completing || building });
    // Greyed like the timeline's own play button: with no placed moment there is nothing to play.
    more.push({ label: g.replay, onClick: onReplay, disabled: !canReplay });
    more.push({ label: g.backToMoments, onClick: () => onEnd?.(false) });
  }

  // The open day can be deleted from any step: the list of kept days is only on the choice of the place.
  if (guide.step !== 'place' && onRemoveDay) more.push({ label: g.removeDay, onClick: () => setAskingRemove(true) });

  return (
    <section className={`day-guide ${where}${guide.due && guide.step === 'moments' ? ' due' : ''}`} aria-label={g.show}>
      <ol className="guide-steps">
        {stepStates(guide.step).map((s, i) => (
          <li key={s.step} className={s.state} aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="n" aria-hidden>{s.state === 'done' ? <Check size={12} /> : i + 1}</span>
            {g.steps[s.step]}
          </li>
        ))}
      </ol>
      <strong className="guide-title">{title}</strong>
      {line && <span className="guide-line">{line}</span>}
      {guide.step === 'moments' && !canPhone && <span className="guide-line">{w.day.phoneMissing}</span>}
      {busy && <span className="guide-line" role="status">{w.day.reading}</span>}
      {note && <span className="guide-line" role="status">{note}</span>}
      {error && <span className="error-line" role="alert">{error}</span>}
      {guide.step === 'moments' && spots.length > 1 && (
        <div className="guide-spots" role="radiogroup" aria-label={w.day.spotsTitle}>
          {spots.map((s) => (
            <button key={s.id} role="radio" aria-checked={s.id === spotId} className={s.id === spotId ? 'chosen' : undefined} onClick={() => onSpot?.(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="guide-actions">
        {main && <button className="primary guide-go" disabled={main.disabled} onClick={main.onClick}>{main.icon}{main.label}</button>}
        {more.map((m) => <button key={m.label} className="guide-more" disabled={m.disabled} onClick={m.onClick}>{m.label}</button>)}
      </div>
      {askingComplete && (
        <div className="guide-ask" role="group" aria-label={fill(g.complete, { n: placedPhotos })}>
          <span className="guide-line">{fill(g.completeLine, { n: placedPhotos })}</span>
          <button className="primary" disabled={completing || building} onClick={() => { setAskingComplete(false); onComplete?.('preview'); }}>{g.completeQuick}</button>
          <button disabled={completing || building} onClick={() => { setAskingComplete(false); onComplete?.('full'); }}>{g.completeFull}</button>
          <button onClick={() => setAskingComplete(false)}>{g.completeCancel}</button>
        </div>
      )}
      {completing && <span className="guide-line" role="status">{w.create.acting}</span>}
      {askingRemove && (
        <div className="guide-ask" role="group" aria-label={w.day.removeSure}>
          <span className="guide-line">{w.day.removeSure}</span>
          <button className="danger" onClick={() => { setAskingRemove(false); onRemoveDay?.(); }}>{w.day.removeYes}</button>
          <button onClick={() => setAskingRemove(false)}>{w.day.keep}</button>
        </div>
      )}
    </section>
  );
}
