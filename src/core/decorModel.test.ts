import { describe, expect, it } from 'vitest';
import {
  EMPTY_DECOR_STATE, MAX_DECORS, MAX_FRAMINGS, MAX_PLACE_CHARS, addDecor, aspectFor, chooseDecor, coverFit, decorPrompt,
  forgetDecor, formatUsd, framingKey, keepFraming, parseDecorState, type DecorEntry,
} from './decorModel';

const entry = (path: string, extra: Partial<DecorEntry> = {}): DecorEntry => ({ path, place: 'a marble table', at: '2026-10-22T01:00:00Z', model: 'm', billedUsdMicro: 40000, ...extra });

describe('decorPrompt', () => {
  it('asks for the place, empty, its surface free in the lower middle', () => {
    const p = decorPrompt('  a marble table  ');
    expect(p).toContain('a marble table, empty');
    expect(p).toMatch(/lower middle/);
    expect(p).toMatch(/No people, no text/);
  });

  it('a place longer than the cap is cut, so the host never refuses the prompt', () => {
    const p = decorPrompt('x'.repeat(5000));
    expect(p.length).toBeLessThan(MAX_PLACE_CHARS + 600);
  });
});

describe('aspectFor', () => {
  it('the accepted shape closest to the view', () => {
    expect(aspectFor(1600, 900)).toBe('16:9');
    expect(aspectFor(1200, 900)).toBe('4:3');
    expect(aspectFor(1000, 1000)).toBe('1:1');
    expect(aspectFor(375, 812)).toBe('9:16');
    expect(aspectFor(2560, 1080)).toBe('16:9');
    // Closest by RATIO: 650 × 1000 is 3:4 (a plain difference of widths would say 9:16).
    expect(aspectFor(650, 1000)).toBe('3:4');
  });

  it('a view not measured yet gets the widest shape, not a made-up one', () => {
    expect(aspectFor(0, 900)).toBe('16:9');
    expect(aspectFor(NaN, NaN)).toBe('16:9');
  });
});

describe('coverFit', () => {
  it('a view wider than the picture shows its whole width and crops top and bottom evenly', () => {
    const f = coverFit(16 / 9, 21 / 9);
    expect(f.repeat[0]).toBe(1);
    expect(f.repeat[1]).toBeCloseTo(16 / 21, 6);
    expect(f.offset[1]).toBeCloseTo((1 - 16 / 21) / 2, 6);
  });

  it('a taller view crops the sides; the same shape crops nothing', () => {
    const f = coverFit(16 / 9, 9 / 16);
    expect(f.repeat[1]).toBe(1);
    expect(f.repeat[0]).toBeCloseTo(81 / 256, 6);
    expect(coverFit(1.5, 1.5)).toEqual({ repeat: [1, 1], offset: [0, 0] });
    expect(coverFit(0, 1)).toEqual({ repeat: [1, 1], offset: [0, 0] });
  });
});

describe('parseDecorState', () => {
  it('nothing kept yet, or not an object: empty', () => {
    expect(parseDecorState(undefined)).toEqual(EMPTY_DECOR_STATE);
    expect(parseDecorState('x')).toEqual(EMPTY_DECOR_STATE);
  });

  it('a bad line is dropped, not the whole state', () => {
    const s = parseDecorState({
      decors: [entry('a'), { path: 3 }, entry('a'), { path: 'b', billedUsdMicro: 'free' }, null],
      chosen: { vase: 'a', boots: 'nowhere', shoe: 4 },
      framing: { [framingKey('vase', 'a')]: { position: [1, 2, 3], target: [0, 0, 0] }, bad: { position: [1, 2], target: [0, 0, 0] } },
    });
    expect(s.decors.map((d) => d.path)).toEqual(['a', 'b']);
    // A debit the host did not state is unknown, never zero.
    expect(s.decors[1]!.billedUsdMicro).toBeNull();
    expect(s.chosen).toEqual({ vase: 'a' });
    expect(Object.keys(s.framing)).toEqual([framingKey('vase', 'a')]);
  });
});

describe('the list of décors', () => {
  it('a new one goes first, once', () => {
    const s = addDecor(addDecor(addDecor(EMPTY_DECOR_STATE, entry('a')), entry('b')), entry('a', { place: 'again' }));
    expect(s.decors.map((d) => d.path)).toEqual(['a', 'b']);
    expect(s.decors[0]!.place).toBe('again');
  });

  it('past the cap the oldest leaves, and no object keeps showing it', () => {
    let s = addDecor(EMPTY_DECOR_STATE, entry('old'));
    s = chooseDecor(s, 'vase', 'old');
    for (let i = 0; i < MAX_DECORS; i++) s = addDecor(s, entry(`n${i}`));
    expect(s.decors).toHaveLength(MAX_DECORS);
    expect(s.decors.some((d) => d.path === 'old')).toBe(false);
    expect(s.chosen.vase).toBeUndefined();
  });

  it('choosing: a kept décor, none, or one that is not kept (= none)', () => {
    let s = addDecor(EMPTY_DECOR_STATE, entry('a'));
    s = chooseDecor(s, 'vase', 'a');
    expect(s.chosen.vase).toBe('a');
    expect(chooseDecor(s, 'vase', null).chosen.vase).toBeUndefined();
    expect(chooseDecor(s, 'vase', 'nowhere').chosen.vase).toBeUndefined();
  });

  it('forgetting one takes its choices and placements, and only those', () => {
    let s = addDecor(addDecor(EMPTY_DECOR_STATE, entry('a')), entry('b'));
    s = chooseDecor(chooseDecor(s, 'vase', 'a'), 'boots', 'b');
    s = keepFraming(keepFraming(s, 'vase', 'a', { position: [1, 1, 1], target: [0, 0, 0] }), 'vase', 'b', { position: [2, 2, 2], target: [0, 0, 0] });
    const f = forgetDecor(s, 'a');
    expect(f.decors.map((d) => d.path)).toEqual(['b']);
    expect(f.chosen).toEqual({ boots: 'b' });
    expect(Object.keys(f.framing)).toEqual([framingKey('vase', 'b')]);
  });
});

describe('keepFraming', () => {
  it('replaces the placement of the same object in the same décor; a bad one is ignored', () => {
    let s = keepFraming(EMPTY_DECOR_STATE, 'vase', 'a', { position: [1, 1, 1], target: [0, 0, 0] });
    s = keepFraming(s, 'vase', 'a', { position: [3, 3, 3], target: [0, 0, 0] });
    expect(s.framing[framingKey('vase', 'a')]!.position).toEqual([3, 3, 3]);
    expect(keepFraming(s, 'vase', 'a', { position: [NaN, 0, 0], target: [0, 0, 0] })).toBe(s);
  });

  it('keeps the newest ones under the cap', () => {
    let s = EMPTY_DECOR_STATE;
    for (let i = 0; i < MAX_FRAMINGS + 5; i++) s = keepFraming(s, `o${i}`, 'a', { position: [i, 0, 0], target: [0, 0, 0] });
    expect(Object.keys(s.framing)).toHaveLength(MAX_FRAMINGS);
    expect(s.framing[framingKey(`o${MAX_FRAMINGS + 4}`, 'a')]).toBeDefined();
    expect(s.framing[framingKey('o0', 'a')]).toBeUndefined();
  });
});

describe('formatUsd', () => {
  it('a stated debit in dollars; an unstated one is nothing, never $0', () => {
    expect(formatUsd(40000, 'en')).toBe('$0.04');
    expect(formatUsd(42500, 'en')).toBe('$0.043');
    expect(formatUsd(1_250_000, 'en')).toBe('$1.25');
    expect(formatUsd(null, 'en')).toBeNull();
    expect(formatUsd(-1, 'en')).toBeNull();
  });
});
