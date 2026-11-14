import { describe, expect, it } from 'vitest';
import { formatBytes, formatCount, formatHour, formatMs, percent, pluralOf } from './format';

describe('format', () => {
  it('says a size nobody measured as a dash, never 0', () => {
    expect(formatBytes(null, 'en')).toBe('—');
    expect(formatBytes(-1, 'en')).toBe('—');
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(4.2 * 1024 * 1024, 'en')).toBe('4.2 MB');
    expect(formatBytes(4.2 * 1024 * 1024, 'fr')).toBe('4,2 MB');
  });

  it('counts and times in the given language', () => {
    expect(formatCount(null, 'en')).toBe('—');
    expect(formatCount(1234567, 'en')).toBe('1,234,567');
    expect(formatMs(340, 'en')).toBe('340 ms');
    expect(formatMs(1840, 'fr')).toBe('1,8 s');
  });

  it('the singular follows the language: zero is singular in French, plural in English', () => {
    expect(pluralOf(0, 'fr', 'one', 'other')).toBe('one');
    expect(pluralOf(0, 'en', 'one', 'other')).toBe('other');
    expect(pluralOf(1, 'es', 'one', 'other')).toBe('one');
    expect(pluralOf(4, 'fr', 'one', 'other')).toBe('other');
  });

  it('an hour in the given language', () => {
    const t = new Date(2026, 10, 14, 14, 5).getTime();
    expect(formatHour(t, 'fr')).toBe('14:05');
  });

  it('a share needs a total', () => {
    expect(percent(5, 10)).toBe('50 %');
    expect(percent(5, 0)).toBe('');
    expect(percent(12, 10)).toBe('100 %');
  });
});
