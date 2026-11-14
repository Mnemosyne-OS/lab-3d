/**
 * ShootTips — how to photograph a place, over the screen (13/11: an icon on
 * « Create a place » that says what to do). The same five tips as
 * the phone's own page. A click anywhere closes it.
 *
 * @module features/phone/ShootTips
 */
import { useState } from 'react';
import type { Dict } from '../../i18n/words';
import { Help } from '../../ui/Icon';

/** The icon, and the five tips over the screen once it is pressed. */
export function ShootTips({ w }: { w: Dict }) {
  const p = w.phone;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="tips-btn" onClick={() => setOpen(true)} aria-label={p.tipsTitle} title={p.tipsTitle}><Help size={18} /></button>
      {open && (
        <div className="tips-overlay" role="dialog" aria-label={p.tipsTitle} onClick={() => setOpen(false)}>
          <div className="tips-card">
            <strong>{p.tipsTitle}</strong>
            <ol>{p.tips.map((t) => <li key={t}>{t}</li>)}</ol>
          </div>
        </div>
      )}
    </>
  );
}
