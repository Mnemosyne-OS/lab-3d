/**
 * NeedsMnemosyne — what a section that runs on Mnemosyne OS's engines shows
 * anywhere else: the lock, one line, and where to get it. The section still
 * opens: a tab that does nothing on a click reads as broken.
 *
 * @module ui/NeedsMnemosyne
 */
import { HudPanel } from './HudPanel';
import { Lock } from './Icon';
import type { Dict } from '../i18n/words';
import { MNEMOSYNE_SITE } from '../lib/links';

export function NeedsMnemosyne({ w }: { w: Dict }) {
  return (
    <div className="locked">
      <HudPanel>
        <div className="locked-mark" aria-hidden><Lock size={30} /></div>
        <h2 className="locked-title">{w.locked.title}</h2>
        <p>{w.locked.line}</p>
        <a className="glass-link" href={MNEMOSYNE_SITE} target="_blank" rel="noopener noreferrer">{w.locked.get}</a>
      </HudPanel>
    </div>
  );
}
