/**
 * UnplacedPhotos — when a job from photos stops at placing (COLMAP placed
 * too few), the person's own photos it could not place, so they see which
 * side of the object is missing instead of guessing (doc 176 §15). The job's
 * folder is gone by then: the pictures are read from the person's folder.
 *
 * @module features/create/UnplacedPhotos
 */
import { useEffect, useState } from 'react';
import { doors } from '../../host/doors';
import { fill, type Dict } from '../../i18n/words';
import { HudPanel } from '../../ui/HudPanel';
import { Phone } from '../../ui/Icon';

/** One photo of the person's folder, read through the host; a refused read says so on the tile. */
export function PhotoTile({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    doors.readPicture(path)
      .then((u) => { if (live) setUrl(u); })
      .catch((err: unknown) => {
        console.warn('[lab-3d] unplaced photo not read:', err);
        if (live) setFailed(true);
      });
    return () => { live = false; };
  }, [path]);
  const name = path.split(/[\\/]/).pop() ?? path;
  return (
    <div className={`frame${url ? ' in' : ''}${failed ? ' failed' : ''}`} title={name}>
      {url && <img src={url} alt={name} draggable={false} />}
    </div>
  );
}

export function UnplacedPhotos({ w, paths, onAddPhotos }: {
  w: Dict;
  /** The photos COLMAP left out, as the host named them; may be empty (only the button then). */
  paths: readonly string[];
  /** Take more photos into the same folder; absent when the host cannot. */
  onAddPhotos?: () => void;
}) {
  return (
    <HudPanel className="unplaced" title={paths.length ? fill(w.create.unplacedTitle, { n: paths.length }) : undefined}>
      {paths.length > 0 && (
        <>
          <p className="unplaced-hint">{w.create.unplacedHint}</p>
          <div className="frame-grid">{paths.map((p) => <PhotoTile key={p} path={p} />)}</div>
        </>
      )}
      {onAddPhotos && (
        <div className="phone-actions">
          <button className="primary" onClick={onAddPhotos}><Phone size={16} />{w.phone.addMore}</button>
        </div>
      )}
    </HudPanel>
  );
}
