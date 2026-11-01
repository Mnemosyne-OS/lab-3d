import { describe, expect, it, vi } from 'vitest';
import { ANSWER_MS, SETTLE_MS, watchHost, type DetectDeps } from './detect';
import { fromStatus, hasCapability, inMnemosyne, type HostState } from './hostState';

/** Timers driven by hand, an answer resolved or rejected by the test. */
function harness(framed = true) {
  const timers = new Map<number, () => void>();
  let next = 1;
  let resolve!: (a: unknown) => void;
  let reject!: (e: unknown) => void;
  const ask = vi.fn((_ms: number) => new Promise<never>((res, rej) => { resolve = res as (a: unknown) => void; reject = rej; }));
  const deps: DetectDeps = {
    framed: () => framed,
    ask,
    setTimer: (fn) => { const id = next++; timers.set(id, fn); return id; },
    clearTimer: (h) => { timers.delete(h as number); },
  };
  const states: HostState[] = [];
  const fire = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { deps, states, fire, ask, resolve: (a: unknown) => resolve(a), reject: (e: unknown) => reject(e), timers };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchHost', () => {
  it('a plain tab is standalone at once, and asks nobody', () => {
    const h = harness(false);
    watchHost((s) => h.states.push(s), h.deps);
    expect(h.states).toEqual([{ kind: 'standalone' }]);
    expect(h.ask).not.toHaveBeenCalled();
  });

  it('inside Mnemosyne, the answer gives the capabilities, and no « foreign » is ever said', async () => {
    const h = harness();
    watchHost((s) => h.states.push(s), h.deps);
    expect(h.ask).toHaveBeenCalledWith(ANSWER_MS);
    h.resolve({ capabilities: ['watch.background', 'image.depth'], platform: 'win32' });
    await flush();
    h.fire();
    expect(h.states).toEqual([{ kind: 'mnemosyne', capabilities: ['watch.background', 'image.depth'], platform: 'win32' }]);
  });

  it('a frame nobody answers from is foreign after the settle delay', async () => {
    const h = harness();
    watchHost((s) => h.states.push(s), h.deps);
    expect(h.states).toEqual([]);
    h.fire();
    expect(h.states).toEqual([{ kind: 'foreign' }]);
    h.reject(new Error('TIMEOUT'));
    await flush();
    expect(h.states).toEqual([{ kind: 'foreign' }]);
  });

  it('a late answer still turns the app into its Mnemosyne state', async () => {
    const h = harness();
    watchHost((s) => h.states.push(s), h.deps);
    h.fire();
    h.resolve({ capabilities: [] });
    await flush();
    expect(h.states.map((s) => s.kind)).toEqual(['foreign', 'mnemosyne']);
  });

  it('says nothing once stopped', async () => {
    const h = harness();
    const stop = watchHost((s) => h.states.push(s), h.deps);
    stop();
    h.fire();
    h.resolve({ capabilities: [] });
    await flush();
    expect(h.states).toEqual([]);
    expect(h.timers.size).toBe(0);
  });

  it('waits SETTLE_MS, not longer, before working on its own', () => {
    const h = harness();
    const spy = vi.spyOn(h.deps, 'setTimer');
    watchHost(() => {}, h.deps);
    expect(spy.mock.calls[0]?.[1]).toBe(SETTLE_MS);
  });
});

describe('hostState', () => {
  it('keeps only the string tokens, and leaves an unreadable platform out', () => {
    expect(fromStatus({ capabilities: ['a', 3, null, 'b'], platform: 7 })).toEqual({ kind: 'mnemosyne', capabilities: ['a', 'b'], platform: null });
    expect(fromStatus(null)).toEqual({ kind: 'mnemosyne', capabilities: [], platform: null });
  });

  it('a capability counts only when Mnemosyne announced it', () => {
    const m = fromStatus({ capabilities: ['image.depth'] });
    expect(hasCapability(m, 'image.depth')).toBe(true);
    expect(hasCapability(m, 'splat.start')).toBe(false);
    expect(hasCapability({ kind: 'foreign' }, 'image.depth')).toBe(false);
    expect(inMnemosyne(m)).toBe(true);
    expect(inMnemosyne({ kind: 'standalone' })).toBe(false);
  });
});
