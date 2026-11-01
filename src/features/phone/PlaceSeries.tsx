/**
 * PlaceSeries — where a series of phone photos goes once it is no longer
 * needed in the app's working folder (doc 176 §16): a vault that takes
 * photos, a new vault (it watches its own folder: nothing to choose), a
 * folder outside memory, or its deletion, asked twice. Shown when the person
 * puts a series away without 3D, and after the 3D object made from it.
 *
 * @module features/phone/PlaceSeries
 */
import { useEffect, useState, type ReactNode } from 'react';
import { phoneDoors, type PhoneDestination, type PhoneSeries, type Placed } from '../../host/phoneDoors';
import { fill, type Dict } from '../../i18n/words';
import { HudPanel } from '../../ui/HudPanel';
import type { Gallery } from '../objects/libraryModel';
import { defaultVaultName } from './phoneModel';

export function PlaceSeries({ w, gallery, vaultBase, series, busy, error, onPlace, onDiscard }: {
  w: Dict; gallery: Gallery; series: PhoneSeries; busy: boolean; error: string | null;
  /** The first word of a new vault's name; the gallery's name when absent. */
  vaultBase?: string;
  /** Run one way of placing; null from it means the person closed a dialog and the series still waits. */
  onPlace: (how: () => Promise<Placed | null>) => void;
  onDiscard: () => void;
}) {
  const p = w.phone;
  const [vaults, setVaults] = useState<PhoneDestination[] | null>(null);
  const [vaultsError, setVaultsError] = useState<string | null>(null);
  const [name, setName] = useState(() => defaultVaultName(vaultBase ?? w.tabs[gallery], series.startedAt));
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    let live = true;
    phoneDoors.destinations()
      .then((res) => { if (live) setVaults(res.vaults); })
      .catch((err: unknown) => {
        console.warn('[lab-3d] vaults for the photos unreadable:', err);
        if (live) setVaultsError(err instanceof Error ? err.message : String(err));
      });
    return () => { live = false; };
    // Asked again after an error: « created but not listed yet » says to pick it in this list (verifier T11).
  }, [series.id, error]);

  // An armed delete disarms itself: a second click much later is not a confirmation.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);

  let list: ReactNode;
  if (vaultsError) list = <div className="error-line" role="alert">{vaultsError}</div>;
  else if (vaults === null) list = <div className="phone-none" role="status">{p.vaults}…</div>;
  else if (vaults.length === 0) list = <div className="phone-none">{p.noVault}</div>;
  else {
    list = (
      <div className="choices">
        {vaults.map((v) => (
          <button key={v.workspaceId} className="choice" disabled={busy} onClick={() => onPlace(() => phoneDoors.deliver(series.id, v.workspaceId))}>
            <strong>{v.name}</strong>
            {v.protection === 'MAXIMUM' && <span>{p.protectedVault}</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="pane phone">
      <HudPanel title={fill(p.whereTitle, { n: series.photos })}>
        <div className="opt-group">
          <span className="opt-label">{p.vaults}</span>
          {list}
        </div>
        <div className="opt-group">
          <span className="opt-label">{p.newVault}</span>
          <div className="phone-new">
            <label className="choice choice-input">
              <strong>{p.newVaultName}</strong>
              <input value={name} maxLength={80} aria-label={p.newVaultName} onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="primary" disabled={busy || !name.trim()} title={p.newVaultSub}
              onClick={() => onPlace(() => phoneDoors.deliverToNewVault(series.id, name.trim()))}>{p.newVaultGo}</button>
          </div>
        </div>
        <div className="phone-actions">
          <button disabled={busy} title={p.folderSub} onClick={() => onPlace(() => phoneDoors.deliverToFolder(series.id))}>
            {p.folder} · {p.folderSub}
          </button>
          <button className={armed ? 'danger armed' : 'danger'} disabled={busy}
            onClick={() => { if (armed) { setArmed(false); onDiscard(); } else setArmed(true); }}>
            {armed ? fill(p.discardConfirm, { n: series.photos }) : p.discard}
          </button>
        </div>
        {error && <div className="error-line" role="alert">{error}</div>}
      </HudPanel>
    </div>
  );
}
