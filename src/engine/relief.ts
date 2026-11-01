/**
 * relief — the décor in relief, in three.js (doc 163, ported from Objets 3D
 * for doc 166): the depth picture read into a grid, and the décor's picture
 * laid on the surface `core/reliefModel` builds from it. The surface is drawn
 * in the décor's pass (with a blurred copy of the picture behind it) and the
 * object in the second pass over a cleared depth, so the table in the
 * picture never cuts the object.
 *
 * @module engine/relief
 */
import * as THREE from 'three';
import type { Vec3 } from '../core/groundModel';
import { RELIEF_COLS, buildRelief, rowsFor, sampleGrid } from '../core/reliefModel';

/** The depth picture is read at most this wide: the grid has RELIEF_COLS cells, more pixels only cost time. */
const DEPTH_READ_WIDTH = 640;
/** How long the depth picture may take to decode; past it the décor stays flat and says why. */
const DECODE_TIMEOUT_MS = 15_000;

/** A depth picture read into memory: one grey byte per pixel, row after row. */
export interface DepthPicture { grey: Uint8Array; width: number; height: number }

/** The depth picture (a data URL) as one grey byte per pixel. Rejects what the browser cannot decode, or not in time. */
export async function readDepthPicture(url: string): Promise<DepthPicture> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DEPTH_DECODE_TIMEOUT')), DECODE_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const scale = Math.min(1, DEPTH_READ_WIDTH / Math.max(1, img.naturalWidth));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_2D_CANVAS');
  ctx.drawImage(img, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const grey = new Uint8Array(width * height);
  for (let i = 0; i < grey.length; i++) grey[i] = rgba[4 * i]!;
  return { grey, width, height };
}

/**
 * The surface with the décor's picture on it, in coordinates relative to the
 * centre of turn the anchor looked at; null when it cannot be built. `fovDeg`
 * is the vertical field the WHOLE picture spans from the anchor (wider than
 * the camera's when the view is wider than the picture: the flat décor behind
 * is cropped to cover the view, and the surface must lie exactly on it).
 */
export function buildReliefMesh(depth: DepthPicture, picture: THREE.Texture, anchor: { offset: Vec3; up: Vec3 }, fovDeg: number, aspect: number): THREE.Mesh | null {
  const rows = rowsFor(RELIEF_COLS, aspect);
  const grid = sampleGrid(depth.grey, depth.width, depth.height, RELIEF_COLS, rows);
  const relief = buildRelief(grid, RELIEF_COLS, rows, anchor, fovDeg, aspect);
  if (!relief) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(relief.positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(relief.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(relief.index, 1));
  // The picture as it was drawn: no repeat or offset (the flat décor's crop is its own copy).
  const map = picture.clone();
  map.repeat.set(1, 1);
  map.offset.set(0, 0);
  map.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** Frees a surface built by buildReliefMesh (its geometry, material and texture copy). */
export function disposeReliefMesh(mesh: THREE.Mesh): void {
  mesh.removeFromParent();
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
}

/** How much the flat picture behind a relief is blurred, in pixels of a copy BLUR_WIDTH wide. */
const BLUR_PX = 14;
const BLUR_WIDTH = 640;

/**
 * A blurred, slightly darker copy of the décor's picture, for behind its
 * relief; null where no 2D canvas exists (the sharp picture then stays).
 */
export function blurredCopy(img: CanvasImageSource & { width: number; height: number }): THREE.CanvasTexture | null {
  const c = document.createElement('canvas');
  c.width = BLUR_WIDTH;
  c.height = Math.max(1, Math.round((BLUR_WIDTH * img.height) / Math.max(1, img.width)));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.filter = `blur(${BLUR_PX}px) brightness(0.92)`;
  // Drawn larger than the canvas so the blur does not darken the edges.
  const m = BLUR_PX * 2;
  ctx.drawImage(img, -m, -m, c.width + 2 * m, c.height + 2 * m);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
