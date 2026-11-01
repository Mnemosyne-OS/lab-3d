import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { words } from '../../i18n/words';
import type { DecorEntry, DecorState } from '../../core/decorModel';

const host = vi.hoisted(() => ({ refreshPermission: vi.fn(), readPicture: vi.fn() }));
vi.mock('../../host/doors', async (orig) => {
  const real = await orig<typeof import('../../host/doors')>();
  return { ...real, doors: { ...real.doors, ...host } };
});

import { DecorPanel } from './DecorPanel';

const w = words('en');
const EMPTY: DecorState = { decors: [], chosen: {}, framing: {} };
const drawn: DecorEntry = { path: 'C:/u/oak.png', place: 'oak', preset: 'wood', at: '', model: 'flash', billedUsdMicro: 39000 };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderPanel(over: Partial<Parameters<typeof DecorPanel>[0]> = {}) {
  const props = {
    w, lang: 'en', state: EMPTY, list: 'ready' as const, chosen: null,
    onRetry: vi.fn(), onChoose: vi.fn(), onForget: vi.fn(), onPick: vi.fn().mockResolvedValue(undefined), onDraw: vi.fn(), ...over,
  };
  render(<DecorPanel {...props} />);
  return props;
}

describe('DecorPanel', () => {
  afterEach(() => { cleanup(); for (const f of Object.values(host)) f.mockReset(); vi.restoreAllMocks(); });

  it('two presses in the same instant draw ONE picture: one charge, not two', async () => {
    const d = deferred<DecorEntry>();
    const p = renderPanel({ onDraw: vi.fn().mockReturnValue(d.promise) });
    const button = screen.getByRole('button', { name: w.decor.draw });
    const field = screen.getByRole('textbox', { name: w.decor.place });
    act(() => { button.click(); button.click(); fireEvent.keyDown(field, { key: 'Enter' }); });
    expect(p.onDraw).toHaveBeenCalledTimes(1);
    expect(p.onDraw).toHaveBeenCalledWith(expect.stringContaining('oak'), 'wood', 'fast');
    await act(async () => { d.resolve(drawn); });
    expect(screen.getByText('Billed $0.039')).toBeInTheDocument();
  });

  it('a refused permission is asked again once and the answer said; it never draws on its own after a yes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.refreshPermission.mockResolvedValue(true);
    const p = renderPanel({ onDraw: vi.fn().mockRejectedValue(new Error('Unauthorized: no image:generate')) });
    await act(async () => { screen.getByRole('button', { name: w.decor.draw }).click(); });
    expect(await screen.findByRole('alert')).toHaveTextContent(w.decor.allowed);
    expect(host.refreshPermission).toHaveBeenCalledTimes(1);
    expect(host.refreshPermission).toHaveBeenCalledWith('image:generate');
    expect(p.onDraw).toHaveBeenCalledTimes(1);
  });

  it('another refusal is said in words, without asking for a permission', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderPanel({ onDraw: vi.fn().mockRejectedValue(new Error('CREDITS_EXHAUSTED')) });
    await act(async () => { screen.getByRole('button', { name: w.decor.draw }).click(); });
    expect(await screen.findByRole('alert')).toHaveTextContent(w.decor.errors.CREDITS_EXHAUSTED!);
    expect(host.refreshPermission).not.toHaveBeenCalled();
  });

  it('until the kept décors are read, nothing can be drawn or chosen', () => {
    const p = renderPanel({ list: 'loading' });
    expect(screen.getByRole('button', { name: w.decor.draw })).toBeDisabled();
    expect(screen.queryByRole('button', { name: w.decor.choosePicture })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox', { name: w.decor.place }), { key: 'Enter' });
    expect(p.onDraw).not.toHaveBeenCalled();
  });

  it('a typed place is drawn as written, with no preset', async () => {
    const p = renderPanel({ onDraw: vi.fn().mockResolvedValue({ ...drawn, preset: undefined }) });
    fireEvent.change(screen.getByRole('textbox', { name: w.decor.place }), { target: { value: 'a stone cellar' } });
    await act(async () => { screen.getByRole('button', { name: w.decor.draw }).click(); });
    expect(p.onDraw).toHaveBeenCalledWith('a stone cellar', null, 'fast');
  });

  it('choosing a picture on disk asks once at a time', async () => {
    const d = deferred<void>();
    const p = renderPanel({ onPick: vi.fn().mockReturnValue(d.promise) });
    const pick = screen.getByRole('button', { name: new RegExp(w.decor.choosePicture) });
    act(() => { pick.click(); pick.click(); });
    expect(p.onPick).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(); });
  });
});
