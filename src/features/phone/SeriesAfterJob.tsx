/**
 * SeriesAfterJob — once a 3D object is made from a series of phone photos,
 * the question the capture did not ask: where the photos go (doc 176 §16).
 * Shown only when the job's photos are a series still waiting in the app's
 * working folder; a job from any other folder of photos says nothing here.
 *
 * @module features/phone/SeriesAfterJob
 */
import { useEffect, useState } from 'react';
import { isPermissionRefusal } from '../../host/doors';
import { phoneDoors, type PhoneSeries, type Placed } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { HudPanel } from '../../ui/HudPanel';
import { describeError } from '../create/createModel';
import type { Gallery } from '../objects/libraryModel';
import { PlaceSeries } from './PlaceSeries';

/** One path written two ways (separators, the case of a Windows drive) is the same folder. */
const samePath = (a: string, b: string): boolean => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

export function SeriesAfterJob({ w, gallery, photosDir }: {
  w: Dict; gallery: Gallery;
  /** The folder the job read its photos from (`JobView.video` of a job from photos). */
  photosDir: string;
}) {
  const [series, setSeries] = useState<PhoneSeries | null>(null);
  const [placed, setPlaced] = useState<Placed | 'discarded' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    phoneDoors.status()
      .then((st) => { if (live) setSeries(st.series.find((x) => x.dir && samePath(x.dir, photosDir)) ?? null); })
      .catch((err: unknown) => console.warn('[lab-3d] waiting series not read after the job:', err));
    return () => { live = false; };
  }, [photosDir]);

  if (placed === 'discarded') return null;
  if (placed) {
    return <HudPanel className="phone-after" title={fill(w.phone.placed, { n: placed.photos })}><div className="phone-dir">{placed.dir}</div></HudPanel>;
  }
  if (!series) return null;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.warn('[lab-3d] placing the series after the job failed:', err);
      setError(isPermissionRefusal(err) ? w.phone.refused : describeError(err instanceof Error ? err.message : String(err), w.phone.errors));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PlaceSeries w={w} gallery={gallery} series={series} busy={busy} error={error}
      onPlace={(how) => void run(async () => { const res = await how(); if (res) setPlaced(res); })}
      onDiscard={() => void run(async () => { await phoneDoors.discard(series.id); setPlaced('discarded'); })} />
  );
}
