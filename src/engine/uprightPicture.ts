/**
 * uprightPicture — a picture (data URL) drawn upright on a canvas (doc 166
 * §15.2). The browser turns a photo by its EXIF orientation when it DRAWS it,
 * so a canvas holds the photo as it is seen; a WebGL upload of the image
 * itself is not promised to. Large photos are drawn at most `maxSide` long.
 *
 * @module engine/uprightPicture
 */

/** How long a picture may take to decode. */
const DECODE_TIMEOUT_MS = 15_000;

/** The picture, upright, on a canvas. Rejects what the browser cannot decode, or not in time. */
export async function uprightPicture(url: string, maxSide = 4096): Promise<HTMLCanvasElement> {
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
  const k = Math.min(1, maxSide / Math.max(1, img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('NO_2D_CANVAS');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
