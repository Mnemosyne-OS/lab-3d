/**
 * App — Lab 3D's shell (doc 166): the mark, the catalogue's tabs, where the app
 * runs, and one panel per tab. Panels stay mounted when hidden, so a scene
 * loaded in the viewer is still there after a look at another tab.
 *
 * The objects and the places are two galleries, each with its own Create
 * view (doc 166 §14.2), opened by the button of its gallery and left by its
 * back button. The engine is held here once for both: the host makes one
 * thing at a time, so one poll, one « made » signal to the libraries, and the
 * job is shown in the gallery of what it makes.
 *
 * @module app/App
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { HostBadge } from '../ui/HostBadge';
import { Blend, Cube, Grid, Landscape, Mark, Painting, Walk } from '../ui/Icon';
import { TabBar, type TabItem } from '../ui/TabBar';
import { words } from '../i18n/words';
import { inMnemosyne } from '../host/hostState';
import { ViewerTab } from '../features/viewer/ViewerTab';
import { ObjectsTab } from '../features/objects/ObjectsTab';
import { CreateTab } from '../features/create/CreateTab';
import { isLive } from '../features/create/createModel';
import { useEngine } from '../features/create/useEngine';
import { galleryOf, type Gallery } from '../features/objects/libraryModel';
import { DecorTab } from '../features/decor/DecorTab';
import { CompareTab } from '../features/compare/CompareTab';
import { PaintingTab } from '../features/painting/PaintingTab';
import { readChoice, safeLocalStorage, writeChoice } from '../lib/choiceStore';
import { TABS, TAB_IDS, TAB_STORAGE_KEY, type TabId } from './tabs';
import { useHost } from './useHost';
import { useLang } from './useLang';

const ICONS: Record<TabId, ReactNode> = { viewer: <Cube size={16} />, objects: <Grid size={16} />, places: <Walk size={16} />, decor: <Landscape size={16} />, painting: <Painting size={16} />, compare: <Blend size={16} /> };

const isGallery = (id: TabId): id is Gallery => id === 'objects' || id === 'places';

export function App() {
  const lang = useLang();
  const w = words(lang);
  const host = useHost();
  const [tab, setTab] = useState<TabId>(() => readChoice(safeLocalStorage(), TAB_STORAGE_KEY, TAB_IDS, TAB_IDS[0]));
  const pick = (id: TabId) => { setTab(id); writeChoice(safeLocalStorage(), TAB_STORAGE_KEY, id); };

  // Which gallery shows its Create view instead of its tiles.
  const [creating, setCreating] = useState<Record<Gallery, boolean>>({ objects: false, places: false });
  const showCreate = (g: Gallery, on: boolean) => setCreating((c) => (c[g] === on ? c : { ...c, [g]: on }));

  // The engine is asked once a gallery was opened, never before.
  const [engineAsked, setEngineAsked] = useState(false);
  if (!engineAsked && isGallery(tab)) setEngineAsked(true);
  const { status, refresh } = useEngine(host !== null && inMnemosyne(host) && engineAsked);
  const job = status.state === 'ready' ? status.engine.job : null;
  const liveGallery = job && isLive(job) ? galleryOf(job.scope) : null;

  // What a job tells the libraries: an object was made, and which one to look at.
  const [libraryRound, setLibraryRound] = useState(0);
  const [openObject, setOpenObject] = useState<{ gallery: Gallery; id: string } | null>(null);
  const doneId = job?.step === 'done' ? job.id : null;
  useEffect(() => { if (doneId) setLibraryRound((n) => n + 1); }, [doneId]);
  const onOpenHandled = useCallback(() => setOpenObject(null), []);

  const galleryPanel = (g: Gallery): ReactNode => (
    <>
      <div className="gallery-view" hidden={creating[g]}>
        <ObjectsTab w={w} lang={lang} host={host} gallery={g} active={tab === g && !creating[g]} refreshKey={libraryRound}
          openId={openObject?.gallery === g ? openObject.id : null} onOpenHandled={onOpenHandled}
          jobLive={liveGallery === g} onCreate={() => showCreate(g, true)} />
      </div>
      <div className="gallery-view" hidden={!creating[g]}>
        <CreateTab w={w} lang={lang} host={host} gallery={g} status={status} refresh={refresh} shown={tab === g && creating[g]}
          onBack={() => showCreate(g, false)}
          onView={(objectId) => { setOpenObject({ gallery: g, id: objectId }); showCreate(g, false); }}
          onShowJob={(other) => { showCreate(other, true); pick(other); }} />
      </div>
    </>
  );

  const panelOf = (id: TabId): ReactNode => {
    switch (id) {
      case 'viewer': return <ViewerTab w={w} lang={lang} />;
      case 'objects': case 'places': return galleryPanel(id);
      case 'decor': return <DecorTab w={w} lang={lang} host={host} active={tab === 'decor'} refreshKey={libraryRound} />;
      case 'painting': return <PaintingTab w={w} lang={lang} host={host} active={tab === 'painting'} />;
      case 'compare': return <CompareTab w={w} lang={lang} host={host} active={tab === 'compare'} refreshKey={libraryRound} />;
    }
  };
  // Until the host has answered, nothing is marked locked: a lock that flashes on and off reads as a fault.
  const hosted = host === null || inMnemosyne(host);
  const items: TabItem<TabId>[] = TABS.map((t) => ({ id: t.id, label: w.tabs[t.id], icon: ICONS[t.id], locked: t.needsHost && !hosted }));

  return (
    <div className="lab">
      <header className="lab-top">
        <div className="lab-mark"><Mark /><span className="lab-word">LAB 3D</span></div>
        <span className="spacer" />
        <HostBadge state={host} w={w} />
      </header>
      <TabBar tabs={items} current={tab} onPick={pick} label={w.tabs.label} />
      <div className="lab-body">
        {TABS.map((t) => (
          <section key={t.id} id={`lab-panel-${t.id}`} role="tabpanel" aria-labelledby={`lab-tab-${t.id}`}
            className={`lab-panel${t.bleed ? ' bleed' : ''}`} hidden={t.id !== tab}>
            {panelOf(t.id)}
          </section>
        ))}
      </div>
    </div>
  );
}
