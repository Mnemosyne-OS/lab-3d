/**
 * TabBar — the catalogue's tabs: an icon and a word each, the live one lit in
 * cyan, a lock beside a tab that needs Mnemosyne OS when the app runs without
 * it (the tab still opens and says why). Arrow keys move between tabs.
 *
 * @module ui/TabBar
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Lock } from './Icon';

export interface TabItem<T extends string> { id: T; label: string; icon: ReactNode; locked: boolean }

export function TabBar<T extends string>({ tabs, current, onPick, label }: {
  tabs: readonly TabItem<T>[]; current: T; onPick: (id: T) => void; label: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === current);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    onPick(next.id);
    refs.current.get(next.id)?.focus();
  };
  return (
    <nav className="tabbar" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => { if (el) refs.current.set(t.id, el); else refs.current.delete(t.id); }}
          role="tab"
          id={`lab-tab-${t.id}`}
          aria-selected={t.id === current}
          aria-controls={`lab-panel-${t.id}`}
          tabIndex={t.id === current ? 0 : -1}
          onClick={() => onPick(t.id)}
          onKeyDown={onKey}
        >
          {t.icon}
          {t.label}
          {t.locked && <span className="lock" aria-hidden><Lock size={12} /></span>}
        </button>
      ))}
    </nav>
  );
}
