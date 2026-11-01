/**
 * After a 3D object made from phone photos, the question the capture did not
 * ask (doc 176 §16): shown only for a series still waiting in the app, found
 * by its folder however the path is written.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fill, words } from '../../i18n/words';

const phone = vi.hoisted(() => ({ status: vi.fn(), destinations: vi.fn(), deliver: vi.fn(), discard: vi.fn() }));
vi.mock('../../host/phoneDoors', async (orig) => {
  const real = await orig<typeof import('../../host/phoneDoors')>();
  return { ...real, phoneDoors: phone };
});

import { SeriesAfterJob } from './SeriesAfterJob';

const w = words('en');
const status = (dir: string) => ({
  active: false, url: null, address: null, seriesId: null, count: 0, phoneSeen: false, startedAt: null, lastPhotoAt: null,
  addresses: [], series: [{ id: 's1', photos: 37, startedAt: null, dir }],
});

describe('SeriesAfterJob', () => {
  afterEach(() => { cleanup(); for (const f of Object.values(phone)) f.mockReset(); });

  it('asks where the photos go for the waiting series the job read, whatever the separators', async () => {
    phone.status.mockResolvedValue(status('C:\\Users\\t\\AppData\\phone-capture\\series\\s1'));
    phone.destinations.mockResolvedValue({ vaults: [{ workspaceId: 'objets', name: 'Objets', protection: 'NORMAL' }] });
    phone.deliver.mockResolvedValue({ dir: 'C:\\Vaults\\objets\\s1', photos: 37 });
    render(<SeriesAfterJob w={w} gallery="objects" photosDir="c:/users/t/appdata/phone-capture/series/s1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Objets' }));
    await waitFor(() => expect(phone.deliver).toHaveBeenCalledWith('s1', 'objets'));
    expect(await screen.findByText(fill(w.phone.placed, { n: 37 }))).toBeInTheDocument();
  });

  it('says nothing for a job from another folder of photos', async () => {
    phone.status.mockResolvedValue(status('C:\\App\\series\\s1'));
    const r = render(<SeriesAfterJob w={w} gallery="objects" photosDir="C:/Users/t/Pictures/vase" />);
    await waitFor(() => expect(phone.status).toHaveBeenCalled());
    expect(r.container).toBeEmptyDOMElement();
    expect(phone.destinations).not.toHaveBeenCalled();
  });
});
