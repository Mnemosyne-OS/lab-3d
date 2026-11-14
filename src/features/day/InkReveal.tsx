/**
 * InkReveal — a photo of the day appearing through an ink stain (inkModel):
 * a few blobs spread from the middle, their edges torn by a noise that calms
 * down as they cover the picture. The photo before it stays underneath until
 * the stain has covered it. Once covered, the photo is a plain picture: the
 * noise filter costs the graphics card only while it moves (Spark shares it).
 *
 * `prefers-reduced-motion`: the photo is there at once.
 *
 * @module features/day/InkReveal
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { INK_MS, inkBlobs, inkTear, photoSeed } from './inkModel';

/** The picture's units: its width is always this, its height follows its shape. */
const UNITS = 1000;

function reducedMotion(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; }
  catch (err) { console.warn('[lab-3d] reduced motion unreadable:', err); return false; }
}

export function InkReveal({ src, below, alt }: {
  /** The photo to reveal (a URL). */
  src: string;
  /** The photo shown before it, covered by the stain; none: the stain spreads over the dark. */
  below: string | null;
  alt: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  // A photo arrives as a data URL of up to ~12 MB: hashing it whole cost ~16 ms, twice a frame.
  // Its length and its last characters tell one photo from another just as well, once.
  const seed = useMemo(() => photoSeed(src), [src]);
  const [shape, setShape] = useState<{ src: string; h: number } | null>(null);
  const [u, setU] = useState(0);

  // The picture's shape, read before the stain is drawn over it.
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => { if (live) setShape({ src, h: Math.max(1, Math.round((UNITS * img.naturalHeight) / Math.max(1, img.naturalWidth))) }); };
    img.onerror = () => {
      console.warn('[lab-3d] day photo could not be decoded for the ink');
      if (live) setShape({ src, h: Math.round(UNITS * 0.75) });
    };
    img.src = src;
    return () => { live = false; };
  }, [src]);

  const ready = shape?.src === src;
  useEffect(() => {
    if (!ready) return;
    if (reducedMotion()) { setU(1); return; }
    setU(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const x = Math.min(1, (now - t0) / INK_MS);
      setU(x);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, src]);

  const covered = ready && u >= 1;
  return (
    <div className="ink-photo">
      {below && !covered && <img className="ink-below" src={below} alt="" draggable={false} />}
      {covered && <img src={src} alt={alt} draggable={false} />}
      {ready && !covered && (
        <svg viewBox={`0 0 ${UNITS} ${shape.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={alt}>
          <defs>
            <filter id={`ink-${id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves={3} seed={seed % 997} />
              <feDisplacementMap in="SourceGraphic" scale={inkTear(UNITS, u)} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <mask id={`mask-${id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={UNITS} height={shape.h}>
              <rect width={UNITS} height={shape.h} fill="black" />
              <g filter={`url(#ink-${id})`}>
                {inkBlobs(UNITS, shape.h, u, seed).map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="white" />)}
              </g>
            </mask>
          </defs>
          <image href={src} width={UNITS} height={shape.h} mask={`url(#mask-${id})`} preserveAspectRatio="xMidYMid meet" />
        </svg>
      )}
    </div>
  );
}
