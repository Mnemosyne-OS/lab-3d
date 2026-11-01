/**
 * floor — the floor an object cut out of its video stands on (doc 163, ported
 * from Objets 3D for doc 166). Three layers at the measured base:
 *  - a cover that draws nothing and fills the depth buffer, so every splat
 *    under the base is hidden (the underside nobody filmed, the stray splats);
 *  - a soft light disc, the studio floor;
 *  - a contact shadow under the footprint, so the object rests instead of
 *    floating.
 * The splats depth-test against opaque meshes (Spark's default), which is what
 * makes the cover work.
 *
 * @module engine/floor
 */
import * as THREE from 'three';
import type { SplatMesh } from '@sparkjsdev/spark';
import { measureGround, type Ground, type Vec3 } from '../core/groundModel';

/** The splats' centres and opacities, read once from the loaded mesh, then measured. */
export function groundOfMesh(mesh: SplatMesh, rig: { target: Vec3; up: Vec3 }): Ground | null {
  const centers: number[] = [];
  const opacity: number[] = [];
  mesh.forEachSplat((_i, center, _scales, _q, o) => {
    centers.push(center.x, center.y, center.z);
    opacity.push(o);
  });
  return measureGround(centers, opacity, rig);
}

/** A built floor: its group, the décor switch, and its disposal. */
export interface Floor {
  group: THREE.Group;
  /** The studio disc is hidden while a décor's picture is the floor. */
  setDecor(on: boolean): void;
  dispose(): void;
}

/** The share of the object's height the shadow and the disc sit above the cover, so neither flickers into it. */
const LIFT = 0.002;

/** The floor's three layers at the measured base, in one group to add to the scene (and to dispose with it). */
export function buildFloor(g: Ground): Floor {
  const group = new THREE.Group();
  const height = Math.max(1e-6, g.top - g.base);
  const up = new THREE.Vector3(...g.up);
  const foot = new THREE.Vector3(...g.foot);
  // A plane is built across z; turned so its normal is the vertical.
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  const disposables: Array<{ dispose(): void }> = [];

  const layer = (size: number, material: THREE.Material, lift: number, order: number): THREE.Mesh => {
    const geo = new THREE.PlaneGeometry(size, size);
    const m = new THREE.Mesh(geo, material);
    m.quaternion.copy(turn);
    m.position.copy(foot).addScaledVector(up, lift * height);
    m.renderOrder = order;
    disposables.push(geo, material);
    group.add(m);
    return m;
  };

  // The cover: wide enough that its edge is never in view around the object.
  const cover = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });
  layer(Math.max(height, g.footRadius) * 200, cover, 0, -3);

  // Without a 2D canvas there is no gradient: the layer is left out, never drawn as a plain square.
  const soft = (stops: Array<[number, string]>, size: number, lift: number, order: number): THREE.Mesh | null => {
    const tex = radialTexture(stops);
    if (!tex) return null;
    disposables.push(tex);
    return layer(size, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }), lift, order);
  };
  // Canvas gradients for WebGL read no CSS variable: the colours are written here.
  // The studio disc is white light at 11 %, the same « glass of light » as the bar over the black view.
  const disc = soft([[0, 'rgba(255,255,255,0.11)'], [0.55, 'rgba(255,255,255,0.05)'], [1, 'rgba(255,255,255,0)']], Math.max(g.footRadius * 10, height * 3.2), LIFT, -2);
  // A warm dark, not black: on a pale table black reads blue-grey, a puddle more than a shadow.
  // Its middle is under the object; what shows is the ring just past the footprint (1.7 radii).
  soft([[0, 'rgba(28,22,16,0.6)'], [0.5, 'rgba(28,22,16,0.34)'], [0.8, 'rgba(28,22,16,0.08)'], [1, 'rgba(28,22,16,0)']], g.footRadius * 3.4, LIFT * 2, -1);

  return {
    group,
    setDecor: (on) => { if (disc) disc.visible = !on; },
    dispose: () => {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}

/** A round gradient on a small canvas; null where no 2D canvas exists. */
function radialTexture(stops: Array<[number, string]>): THREE.CanvasTexture | null {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
