/**
 * Library — one gallery's objects already made, as glass tiles: a picture and
 * a name each, in three sizes (the small one is the overview: picture and
 * name only), a filter by what was made when the gallery holds both kinds,
 * and the gallery's own action (Create) at the end of its bar. A press on a
 * tile puts the object on stage. With `onRemove`, each tile carries a bin
 * button that asks once before sending the object (all its versions) away.
 *
 * @module features/objects/Library
 */
import { useState, type ReactNode } from 'react';
import { idDate, idName, scopeWord, type ObjectEntry, type VersionGroup } from '../../core/model';
import { fill, type Dict } from '../../i18n/words';
import { Check, Cube, GridLarge, GridMedium, GridSmall, Trash } from '../../ui/Icon';
import { filterCounts, filterGroups, filterUseful, filtersShown, type Filter, type GridSize } from './libraryModel';
import { useFileUrl } from '../../host/useHostFiles';

const SIZE_ICONS: Record<GridSize, ReactNode> = { small: <GridSmall />, medium: <GridMedium />, large: <GridLarge /> };

export function Library({ groups, w, lang, title, action, showScope = true, size, onSize, filter, onFilter, onOpen, onRemove }: {
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
  /** Sends a whole group (every version) to the bin; throws with the host's reason. Absent: no bin button. */
  onRemove?: (g: VersionGroup) => Promise<void>;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remove = async (g: VersionGroup) => {
    if (!onRemove) return;
    setAsking(null);
    setError(null);
    setRemoving(g.key);
    try {
      await onRemove(g);
    } catch (err) {
      console.warn('[lab-3d] the object could not be deleted:', err);
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail.includes('OBJECT_BUSY') ? w.objects.removeBusy : fill(w.objects.removeFailed, { detail }));
    } finally {
      setRemoving(null);
    }
  };
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
      {error && <div className="error-line" role="alert">{error}</div>}
      <div className={`lib-grid size-${size}`}>
        {shown.map((g) => {
          const tile = <Tile key={g.key} o={g.main} versions={g.versions.length} w={w} lang={lang} small={size === 'small'} showScope={showScope} onOpen={() => onOpen(g.main)} />;
          if (!onRemove) return tile;
          return (
            <div key={g.key} className="tile-wrap">
              {tile}
              {asking === g.key ? (
                <div className="tile-ask" role="group" aria-label={w.objects.removeSure}>
                  <span>{w.objects.removeSure}</span>
                  <button className="danger" onClick={() => void remove(g)}>{w.objects.removeYes}</button>
                  <button onClick={() => setAsking(null)}>{w.objects.removeKeep}</button>
                </div>
              ) : (
                <button className="tile-remove" title={w.objects.remove} aria-label={w.objects.remove}
                  disabled={removing !== null} onClick={() => setAsking(g.key)}><Trash size={15} /></button>
              )}
            </div>
          );
        })}
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
