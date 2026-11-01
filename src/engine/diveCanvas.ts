/**
 * diveCanvas — the pictures of a dive into a painting (doc 166 §15.5): a level
 * with its edges softened so it melts into the one below, the window sent to
 * the image model, and a level's picture read into a canvas.
 *
 * @module engine/diveCanvas
 */
import { EDGE_SOFT } from '../features/painting/diveModel';

function canvasOf(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('NO_2D_CANVAS');
  return { c, ctx };
}

/** The picture with its edges fading to nothing over EDGE_SOFT of its width and height. */
export function feathered(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const { c, ctx } = canvasOf(img.width, img.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  for (const horizontal of [true, false]) {
    const len = horizontal ? c.width : c.height;
    const g = horizontal ? ctx.createLinearGradient(0, 0, len, 0) : ctx.createLinearGradient(0, 0, 0, len);
    // The mask's colour does not matter, only its alpha: black, opaque in the middle.
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(EDGE_SOFT, 'rgba(0,0,0,1)');
    g.addColorStop(1 - EDGE_SOFT, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

/** The window (shares of the picture) cut out at `width` pixels wide, as a JPEG data URL for the image model. */
export function windowDataUrl(img: CanvasImageSource & { width: number; height: number }, win: { x: number; y: number; w: number; h: number }, width: number): string {
  const sw = win.w * img.width, sh = win.h * img.height;
  const { c, ctx } = canvasOf(width, (width * sh) / sw);
  ctx.drawImage(img, win.x * img.width, win.y * img.height, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

/** How long a level's picture may take to decode. */
const DECODE_TIMEOUT_MS = 15_000;

/** A picture (data URL) decoded into a canvas. Rejects what cannot be decoded, or not in time. */
export async function pictureCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PICTURE_DECODE_TIMEOUT')), DECODE_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const { c, ctx } = canvasOf(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  return c;
}
