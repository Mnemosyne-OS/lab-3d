import { describe, expect, it } from 'vitest';
import { fill, words } from './words';

/** Every leaf path of a dictionary, in order. */
function paths(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? paths(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe('words', () => {
  it('has the same keys in English, French and Spanish', () => {
    const en = paths(words('en'));
    expect(paths(words('fr'))).toEqual(en);
    expect(paths(words('es'))).toEqual(en);
  });

  it('no text is empty, and the placeholders match English', () => {
    const en = words('en');
    for (const lang of ['fr', 'es']) {
      const d = words(lang);
      for (const p of paths(en)) {
        const get = (o: object) => p.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], o) as string;
        expect(get(d).trim(), `${lang}:${p}`).not.toBe('');
        expect(get(d).match(/\{\w+\}/g) ?? [], `${lang}:${p}`).toEqual(get(en).match(/\{\w+\}/g) ?? []);
      }
    }
  });

  it('reads a region tag, and any other language reads English', () => {
    expect(words('fr-FR').viewer.pick).toBe('Choisir un fichier');
    expect(words('de').viewer.pick).toBe('Choose a file');
    expect(words(undefined).viewer.pick).toBe('Choose a file');
  });

  it('fills the values it has and leaves the others written', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});
