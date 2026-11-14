import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const host = vi.hoisted(() => ({ readPicture: vi.fn() }));
vi.mock('../../host/doors', () => ({ doors: host }));

import { KEEP_PHOTOS, photoUrl, usePhoto } from './photoCache';

describe('photoCache', () => {
  beforeEach(() => {
    host.readPicture.mockReset();
    host.readPicture.mockImplementation(async (p: string) => `data:image/jpeg;base64,${p}`);
  });

  it('reads a photo once, and keeps it', async () => {
    await photoUrl('C:/a/once.jpg');
    await photoUrl('C:/a/once.jpg');
    expect(host.readPicture.mock.calls.filter((c) => c[0] === 'C:/a/once.jpg')).toHaveLength(1);
  });

  it('a read that failed is not kept: the next ask reads again', async () => {
    host.readPicture.mockRejectedValueOnce(new Error('Access denied'));
    await expect(photoUrl('C:/a/denied.jpg')).rejects.toThrow('Access denied');
    await expect(photoUrl('C:/a/denied.jpg')).resolves.toContain('denied');
    expect(host.readPicture.mock.calls.filter((c) => c[0] === 'C:/a/denied.jpg')).toHaveLength(2);
  });

  it(`keeps ${KEEP_PHOTOS} photos at most: the one shown longest ago is read again`, async () => {
    for (let i = 0; i <= KEEP_PHOTOS; i++) await photoUrl(`C:/b/${i}.jpg`);
    await photoUrl(`C:/b/${KEEP_PHOTOS}.jpg`);
    await photoUrl('C:/b/0.jpg');
    expect(host.readPicture.mock.calls.filter((c) => c[0] === 'C:/b/0.jpg')).toHaveLength(2);
    expect(host.readPicture.mock.calls.filter((c) => c[0] === `C:/b/${KEEP_PHOTOS}.jpg`)).toHaveLength(1);
  });

  it('a photo the host refuses is said as failed, never a blank', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.readPicture.mockRejectedValue(new Error('NOT_AN_IMAGE'));
    const { result } = renderHook(() => usePhoto('C:/c/bad.heic'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.url).toBeNull();
  });
});
