import { describe, expect, it } from 'vitest';
import { formatBytes, formatCount, formatMs, percent } from './format';

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

  it('a share needs a total', () => {
    expect(percent(5, 10)).toBe('50 %');
    expect(percent(5, 0)).toBe('');
    expect(percent(12, 10)).toBe('100 %');
  });
});
