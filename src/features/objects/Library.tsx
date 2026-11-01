/**
 * Library — one gallery's objects already made, as glass tiles: a picture and
 * a name each, in three sizes (the small one is the overview: picture and
 * name only), a filter by what was made when the gallery holds both kinds,
 * and the gallery's own action (Create) at the end of its bar. A press on a
 * tile puts the object on stage.
 *
 * @module features/objects/Library
 */
import type { ReactNode } from 'react';
import { idDate, idName, scopeWord, type ObjectEntry, type VersionGroup } from '../../core/model';
import { fill, type Dict } from '../../i18n/words';
import { Check, Cube, GridLarge, GridMedium, GridSmall } from '../../ui/Icon';
import { filterCounts, filterGroups, filterUseful, filtersShown, type Filter, type GridSize } from './libraryModel';
import { useFileUrl } from '../../host/useHostFiles';

const SIZE_ICONS: Record<GridSize, ReactNode> = { small: <GridSmall />, medium: <GridMedium />, large: <GridLarge /> };

export function Library({ groups, w, lang, title, action, showScope = true, size, onSize, filter, onFilter, onOpen }: {
  groups: readonly VersionGroup[]; w: Dict; lang: string;
  /** The gallery's name. */
  title: string;
  /** The gallery's own action, at the end of the bar. */
  action?: ReactNode;
  /** Whether a tile says what was made: in a gallery of one kind, the word says nothing. */
  showScope?: boolean;
  size: GridSize; onSize: (s: GridSize) => void;
  filter: Filter; onFilter: (f: Filter) => void;
  onOpen: (o: ObjectEntry) => void;
}) {
  const counts = filterCounts(groups);
  const useful = filterUseful(counts);
  // A remembered filter that no longer splits anything would hide objects for no reason.
  const shown = filterGroups(groups, useful ? filter : 'all');
  const filterLabel: Record<Filter, string> = { all: w.objects.all, object: w.objects.scopeObject, scene: w.objects.scopeScene };
  const sizeLabel: Record<GridSize, string> = { small: w.objects.small, medium: w.objects.medium, large: w.objects.large };

  return (
    <section className="library" aria-label={title}>
      <header className="lib-bar">
        <span className="hud-index">02</span>
        <h2 className="lib-title">{title}</h2>
        <span className="lib-count">{counts.all}</span>
        <span className="rule" />
        {useful && (
          <div className="chips" role="radiogroup" aria-label={w.objects.filter}>
            {filtersShown(counts).map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} className={`chip${filter === f ? ' chosen' : ''}`} onClick={() => onFilter(f)}>
                {filter === f && <Check size={13} />}{filterLabel[f]} <span className="chip-count">{counts[f]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="segmented" role="radiogroup" aria-label={w.objects.sizes}>
          {(['small', 'medium', 'large'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={size === s} className={size === s ? 'chosen' : ''} title={sizeLabel[s]} aria-label={sizeLabel[s]} onClick={() => onSize(s)}>
              {SIZE_ICONS[s]}
            </button>
          ))}
        </div>
        {action}
      </header>
      <div className={`lib-grid size-${size}`}>
        {shown.map((g) => <Tile key={g.key} o={g.main} versions={g.versions.length} w={w} lang={lang} small={size === 'small'} showScope={showScope} onOpen={() => onOpen(g.main)} />)}
      </div>
    </section>
  );
}

function Tile({ o, versions, w, lang, small, showScope, onOpen }: { o: ObjectEntry; versions: number; w: Dict; lang: string; small: boolean; showScope: boolean; onOpen: () => void }) {
  const { url, failed } = useFileUrl(o.id, o.thumb);
  const date = idDate(o.id);
  const meta = [
    date ? date.toLocaleDateString(lang) : null,
    o.quality ? (o.quality === 'full' ? w.objects.full : w.objects.quick) : null,
    showScope && scopeWord(o.scope) ? w.objects[scopeWord(o.scope)!] : null,
  ].filter(Boolean).join(' · ');
  return (
    <button className="tile" onClick={onOpen} title={idName(o.id)}>
      <span className="tile-pic">
        {url ? <img src={url} alt="" draggable={false} /> : <span className={`tile-blank${failed ? ' failed' : ''}`}><Cube size={small ? 22 : 30} /></span>}
        {/* The arc around the middle of a place is no measure of it. */}
        {!small && o.coverageDeg !== null && o.scope !== 'place' && <span className="tile-badge">{o.coverageDeg}°</span>}
        {!small && versions > 1 && <span className="tile-badge versions">{fill(w.objects.versions, { n: versions })}</span>}
      </span>
      <span className="tile-name">{idName(o.id)}</span>
      {!small && meta && <span className="tile-meta">{meta}</span>}
    </button>
  );
}
