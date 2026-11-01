/**
 * worldCanvases — the pictures of the painting's world (doc 166 §15.4): the
 * retouched painting, and one picture per colour mass, the painting itself
 * kept only where that mass is (its edges softened). The masses are found by
 * `worldModel` on a small copy; each layer is cut at full size.
 *
 * Each layer is the OPAQUE painting first, then cut by its mask
 * (`destination-in`): the colour at a soft edge is the painting's own, so no
 * dark fringe shows between layers (the prototype's grey halos).
 *
 * @module engine/worldCanvases
 */
import { MASSES, colourMasses, levels, workSize } from '../features/painting/worldModel';

/** A layer picture is at most this long: past it a card may refuse the texture. */
const LAYER_MAX_SIDE = 2048;
/** The softness of a layer's edge, as a share of the picture's height (1.5 px of 960). */
const EDGE_SOFT_SHARE = 1.5 / 960;

export interface WorldPictures {
  /** One per mass, by depth rank: [0] the farthest. */
  layers: HTMLCanvasElement[];
  /** The masses that hold any pixel. */
  count: number;
  /** How long finding the masses took, in ms (said in the log; a worker is for later if it stutters). */
  ms: number;
}

function canvasOf(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('NO_2D_CANVAS');
  return { c, ctx };
}

/** The painting retouched (levels, doc 166 §15.4): a photo taken in dim light shows its colours. */
export function retouched(src: HTMLCanvasElement): HTMLCanvasElement {
  const { c, ctx } = canvasOf(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  img.data.set(levels(img.data));
  ctx.putImageData(img, 0, 0);
  return c;
}

/** The painting cut into its colour masses, one picture per mass. */
export function worldPictures(src: HTMLCanvasElement): WorldPictures {
  const t0 = performance.now();
  const ws = workSize(src.width, src.height);
  const work = canvasOf(ws.width, ws.height);
  work.ctx.drawImage(src, 0, 0, ws.width, ws.height);
  const masses = colourMasses(work.ctx.getImageData(0, 0, ws.width, ws.height).data, ws.width, ws.height);
  const ms = Math.round(performance.now() - t0);

  const k = Math.min(1, LAYER_MAX_SIDE / Math.max(src.width, src.height));
  const W = Math.max(1, Math.round(src.width * k)), H = Math.max(1, Math.round(src.height * k));
  const layers: HTMLCanvasElement[] = [];
  for (let r = 0; r < MASSES; r++) {
    const mask = canvasOf(ws.width, ws.height);
    const m = mask.ctx.createImageData(ws.width, ws.height);
    for (let i = 0; i < masses.labels.length; i++) if (masses.labels[i] === r) m.data[i * 4 + 3] = 255;
    mask.ctx.putImageData(m, 0, 0);
    const layer = canvasOf(W, H);
    layer.ctx.drawImage(src, 0, 0, W, H);
    layer.ctx.globalCompositeOperation = 'destination-in';
    layer.ctx.imageSmoothingEnabled = true;
    layer.ctx.filter = `blur(${Math.max(0.5, EDGE_SOFT_SHARE * H).toFixed(2)}px)`;
    layer.ctx.drawImage(mask.c, 0, 0, W, H);
    layers.push(layer.c);
  }
  return { layers, count: masses.count, ms };
}
