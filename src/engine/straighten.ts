/**
 * straighten — the painted canvas cut out of its photo and made rectangular
 * (doc 166 §15.2): the photo drawn upright, warped from the canvas's
 * quadrilateral (`canvasCrop.findCanvasQuad`) onto a canvas element.
 *
 * @module engine/straighten
 */
import { cropSize, rectToQuad, warpRgba, type Quad } from '../features/painting/canvasCrop';
import { uprightPicture } from './uprightPicture';

/** The straightened canvas is at most this long: a texture past 4096 is refused by some cards. */
const MAX_SIDE = 3200;

/** The canvas of the painting, straightened. Rejects a picture that cannot be read or a degenerate corner set. */
export async function straightened(url: string, quad: Quad): Promise<HTMLCanvasElement> {
  const src = await uprightPicture(url, MAX_SIDE * 1.4);
  const ctx = src.getContext('2d');
  if (!ctx) throw new Error('NO_2D_CANVAS');
  const { width, height } = cropSize(quad, src.width, src.height, MAX_SIDE);
  const H = rectToQuad(width, height, quad, src.width, src.height);
  if (!H) throw new Error('CANVAS_NOT_STRAIGHTENED');
  const pixels = warpRgba(ctx.getImageData(0, 0, src.width, src.height).data, src.width, src.height, H, width, height);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('NO_2D_CANVAS');
  octx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return out;
}
