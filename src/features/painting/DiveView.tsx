/**
 * DiveView — the dive into a painting (doc 166 §15.5): the painting on a 2D
 * canvas, its levels drawn at their places and melted in as they grow on the
 * frame; the wheel zooms where the pointer is, a drag moves. « Dive further »
 * cuts the window around the frame's centre out of the deepest level and
 * hands it up; the tab asks the model and keeps the level. When a new level
 * arrives, the view glides into it.
 *
 * Drawn on demand (one frame per change, cancelled on unmount, rule 13).
 *
 * @module features/painting/DiveView
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { feathered, pictureCanvas, windowDataUrl } from '../../engine/diveCanvas';
import { fill, type Dict } from '../../i18n/words';
import { decorPicture } from '../decor/decorStore';
import { Close } from '../../ui/Icon';
import { DIVE_PRICE_USD, DIVE_SEND_WIDTH, diveWindow, fitView, levelFade, levelRects, maxScale, onFrame, zoomAt, type DiveLevel, type View } from './diveModel';

/** One wheel notch (deltaY 100) zooms by this much. */
const WHEEL_ZOOM = 1.18;
/** How long the view takes to glide into a new level. */
const GLIDE_MS = 1600;

export function DiveView({ w, lang, source, levels, busy, seconds, error, note, onDive, onForget, onClose }: {
  w: Dict; lang: string;
  /** The painting as shown (cut out, retouched): level 0. */
  source: HTMLCanvasElement;
  levels: readonly DiveLevel[];
  busy: boolean;
  /** Seconds the model has been painting, while busy. */
  seconds: number;
  error: string | null;
  note: string | null;
  /** The window of the new level (shares of the deepest one) and its picture to repaint. */
  onDive: (win: { x: number; y: number; w: number; h: number }, dataUrl: string) => void;
  onForget: () => void;
  /** Back to the living painting. */
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frame, setFrame] = useState({ width: 1, height: 1 });
  const [view, setView] = useState<View | null>(null);
  // Each level's picture as answered (cut from for the next level) and softened at its edges (drawn);
  // null while it loads, a string when it failed.
  const [pictures, setPictures] = useState<Array<{ raw: HTMLCanvasElement; soft: HTMLCanvasElement } | string | null>>([]);
  const rects = useMemo(() => levelRects(source, levels), [source, levels]);
  const glide = useRef<number | null>(null);

  // The frame follows the panel's size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrame({ width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) }));
    ro.observe(el);
    setFrame({ width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  // A new painting starts fitted.
  useEffect(() => { setView(null); }, [source]);
  useEffect(() => { if (!view && frame.width > 1) setView(fitView(source, frame)); }, [view, frame, source]);

  // The levels' pictures, read once each.
  useEffect(() => {
    let live = true;
    setPictures((old) => levels.map((_, i) => old[i] ?? null));
    levels.forEach((l, i) => {
      decorPicture(l.path).then(pictureCanvas).then(
        (c) => { if (live) setPictures((p) => { const n = [...p]; n[i] = { raw: c, soft: feathered(c) }; return n; }); },
        (err: unknown) => {
          console.warn('[lab-3d] dive level unreadable:', l.path, err);
          if (live) setPictures((p) => { const n = [...p]; n[i] = err instanceof Error ? err.message : String(err); return n; });
        },
      );
    });
    return () => { live = false; };
  }, [levels]);

  // A level just added: glide into it.
  const count = useRef(levels.length);
  useEffect(() => {
    const before = count.current;
    count.current = levels.length;
    if (levels.length <= before || !view) return;
    const r = rects[rects.length - 1]!;
    const target: View = { cx: r.x + r.w / 2, cy: r.y + r.h / 2, scale: 0.94 * Math.min(frame.width / r.w, frame.height / r.h) };
    const from = view;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / GLIDE_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      // The scale glides geometrically: a constant speed into the picture.
      setView({ cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, scale: from.scale * (target.scale / from.scale) ** e });
      glide.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    if (glide.current !== null) cancelAnimationFrame(glide.current);
    glide.current = requestAnimationFrame(step);
    // Only a new level starts a glide: the view and the rectangles are read as they are then.
  }, [levels.length]);

  useEffect(() => () => { if (glide.current !== null) cancelAnimationFrame(glide.current); }, []);

  const deepest = rects[rects.length - 1]!;
  const last = pictures[levels.length - 1];
  const deepestPicture = levels.length === 0 ? source : last && typeof last === 'object' ? last.raw : (last ?? null);
  const limits = useMemo(() => {
    const min = fitView(source, frame).scale;
    const pic = levels.length === 0 ? source.width : (typeof deepestPicture === 'object' && deepestPicture ? deepestPicture.width : source.width);
    return { min, max: Math.max(min, maxScale(deepest, pic)) };
  }, [source, frame, levels.length, deepest, deepestPicture]);

  // Drawn once per change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !view) return;
    const id = requestAnimationFrame(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(frame.width * dpr);
      c.height = Math.round(frame.height * dpr);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, frame.width, frame.height);
      ctx.imageSmoothingQuality = 'high';
      rects.forEach((r, i) => {
        const p = i === 0 ? null : pictures[i - 1];
        const img = i === 0 ? source : p && typeof p === 'object' ? p.soft : null;
        if (!img) return;
        const f = onFrame(r, view, frame);
        if (f.x > frame.width || f.y > frame.height || f.x + f.w < 0 || f.y + f.h < 0) return;
        ctx.globalAlpha = levelFade(i, f.w, frame.width);
        if (ctx.globalAlpha > 0) ctx.drawImage(img, f.x, f.y, f.w, f.h);
      });
      ctx.globalAlpha = 1;
    });
    return () => cancelAnimationFrame(id);
  }, [view, frame, rects, pictures, source]);

  // The wheel: a listener of our own, passive false, so the panel does not scroll instead.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (glide.current !== null) { cancelAnimationFrame(glide.current); glide.current = null; }
      const r = el.getBoundingClientRect();
      setView((v) => (v ? zoomAt(v, WHEEL_ZOOM ** (-e.deltaY / 100), e.clientX - r.left, e.clientY - r.top, frame, limits.min, limits.max) : v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [frame, limits]);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => (v ? { ...v, cx: v.cx - (e.clientX - d.x) / v.scale, cy: v.cy - (e.clientY - d.y) / v.scale } : v));
  };
  const onPointerUp = () => { drag.current = null; };

  const dive = useCallback(() => {
    if (!view || !deepestPicture || typeof deepestPicture === 'string') return;
    const win = diveWindow(deepest, view.cx, view.cy);
    onDive(win, windowDataUrl(deepestPicture, win, DIVE_SEND_WIDTH));
  }, [view, deepest, deepestPicture, onDive]);

  const price = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 3 }).format(DIVE_PRICE_USD);
  const unreadable = pictures.find((p) => typeof p === 'string');
  return (
    <div className="dive">
      <div ref={wrapRef} className="dive-frame" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <canvas ref={canvasRef} className="dive-canvas" aria-label={w.painting.dive} />
      </div>
      <div className="dive-bar">
        <button className="primary" disabled={busy || !deepestPicture || typeof deepestPicture === 'string'} onClick={dive}>
          {busy ? fill(w.painting.diving, { s: seconds }) : fill(w.painting.diveFurther, { usd: price })}
        </button>
        <button disabled={busy} onClick={() => setView(fitView(source, frame))}>{w.painting.diveBack}</button>
        {levels.length > 0 && <button disabled={busy} onClick={onForget}>{w.painting.diveForget}</button>}
        <span className="dive-levels">{fill(w.painting.diveLevels, { n: levels.length })}</span>
        <button className="icon dive-close" title={w.painting.diveClose} aria-label={w.painting.diveClose} onClick={onClose}><Close size={16} /></button>
      </div>
      <p className="dive-hint">{w.painting.diveHint}</p>
      {note && <p className="decor-note billed">{note}</p>}
      {error && <p className="error-line" role="alert">{error}</p>}
      {unreadable && <p className="error-line" role="alert">{fill(w.painting.readError, { error: unreadable })}</p>}
    </div>
  );
}
