/**
 * PaintingStage — a painting laid on its depth, in three.js (doc 166 §15).
 * The picture is shown flat at once; when its depth arrives the same picture
 * is laid on the relief surface (`core/reliefModel`, the décor's), built from
 * an anchor camera at distance 1. The camera then drifts around that anchor
 * (`driftPosition`) and follows the pointer, always looking at the centre of
 * turn. Behind the picture: a dark, blurred copy of it, so its edges sit in
 * its own colours rather than in a void.
 *
 * One render loop per stage, cancelled by dispose (rule 13).
 *
 * @module engine/PaintingStage
 */
import * as THREE from 'three';
import { PICTURE_FOV_DEG, cameraFovToContain, driftPosition, flatSize, type Pointer } from '../features/painting/paintingModel';
import { buildReliefMesh, disposeReliefMesh, type DepthPicture } from './relief';
import { uprightPicture } from './uprightPicture';
import { WORLD_BACK, bobOffset, layerDistance, planeHeight } from '../features/painting/worldModel';

/** The canvas behind the world's layers is a little darker, so the masses stand out (the prototype's 0.8). */
const WORLD_BACK_SHADE = 0xcccccc;

/** How fast the camera catches up with the pointer, per second (an easing, not a jump). */
const POINTER_EASE = 3;
/** The copy behind the picture: this wide, this blurred, this dark. */
const AMBIENT_WIDTH = 480;
const AMBIENT_FILTER = 'blur(28px) brightness(0.32) saturate(1.1)';

export class PaintingStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(PICTURE_FOV_DEG, 1, 0.01, 50);
  private readonly resize: ResizeObserver;
  private picture: THREE.Texture | null = null;
  private ambient: THREE.Texture | null = null;
  private flat: THREE.Mesh | null = null;
  private relief: THREE.Mesh | null = null;
  /** The world (doc 166 §15.4): the canvas far behind, then one plane per colour mass, far to near. */
  private world: Array<{ mesh: THREE.Mesh; rank: number; distance: number; texture: THREE.Texture | null }> = [];
  private aspect = 1;
  private moving = true;
  private target: Pointer | null = null;
  private eased: Pointer = { x: 0, y: 0 };
  private frame = 0;
  private last = 0;
  private clock = 0;
  private disposed = false;
  /** Bumped by every show(): a picture that finishes decoding after a newer one was asked is dropped. */
  private round = 0;

  constructor(private readonly el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(el);
    el.addEventListener('pointermove', this.onPointer);
    el.addEventListener('pointerleave', this.onLeave);
    this.fit();
    this.frame = requestAnimationFrame(this.tick);
  }

  /**
   * The painting, flat: a picture (data URL, drawn upright) or a canvas
   * already made (the straightened canvas). False when this stage was given
   * another meanwhile or disposed. Rejects a picture the browser cannot decode.
   */
  async show(source: string | HTMLCanvasElement): Promise<boolean> {
    const round = ++this.round;
    const img = typeof source === 'string' ? await uprightPicture(source) : source;
    if (this.disposed || round !== this.round) return false;
    this.clear();
    const tex = new THREE.CanvasTexture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    this.picture = tex;
    this.aspect = img.width / Math.max(1, img.height);
    const size = flatSize(PICTURE_FOV_DEG, this.aspect);
    this.flat = new THREE.Mesh(new THREE.PlaneGeometry(size.width, size.height), new THREE.MeshBasicMaterial({ map: tex }));
    this.scene.add(this.flat);
    this.ambient = ambientCopy(img);
    this.scene.background = this.ambient;
    this.fit();
    return true;
  }

  /** The painting laid on its depth (null: flat again); false when it cannot be built. */
  setDepth(depth: DepthPicture | null): boolean {
    this.dropRelief();
    if (this.flat) this.flat.visible = true;
    if (!depth) return true;
    if (!this.picture) return false;
    const mesh = buildReliefMesh(depth, this.picture, { offset: [0, 0, 1], up: [0, 1, 0] }, PICTURE_FOV_DEG, this.aspect);
    if (!mesh) return false;
    this.relief = mesh;
    this.scene.add(mesh);
    if (this.flat) this.flat.visible = false;
    return true;
  }

  /**
   * The painting as a world (null: flat again): its colour mass pictures, by
   * depth rank ([0] the farthest), each on a plane at its distance and sized
   * to cover exactly its own pixels from the anchor; the whole canvas behind
   * them. False when there is no painting shown.
   */
  setWorld(layers: HTMLCanvasElement[] | null): boolean {
    this.dropWorld();
    this.dropRelief();
    if (this.flat) this.flat.visible = true;
    if (!layers) return true;
    if (!this.picture) return false;
    const plane = (d: number, z: number, material: THREE.MeshBasicMaterial, rank: number, texture: THREE.Texture | null) => {
      const h = planeHeight(d);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * this.aspect, h), material);
      mesh.position.set(0, 0, 1 - d);
      mesh.renderOrder = z;
      this.scene.add(mesh);
      this.world.push({ mesh, rank, distance: d, texture });
    };
    plane(WORLD_BACK, 0, new THREE.MeshBasicMaterial({ map: this.picture, color: WORLD_BACK_SHADE }), -1, null);
    layers.forEach((canvas, rank) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // Premultiplied on both sides: a soft edge keeps the painting's colour, no dark fringe.
      tex.premultiplyAlpha = true;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, premultipliedAlpha: true });
      plane(layerDistance(rank, layers.length), rank + 1, mat, rank, tex);
    });
    if (this.flat) this.flat.visible = false;
    return true;
  }

  /** The slow drift on or off; the pointer is followed either way. */
  setMoving(on: boolean): void {
    this.moving = on;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.el.removeEventListener('pointermove', this.onPointer);
    this.el.removeEventListener('pointerleave', this.onLeave);
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private clear(): void {
    this.dropWorld();
    this.dropRelief();
    if (this.flat) {
      this.flat.removeFromParent();
      this.flat.geometry.dispose();
      (this.flat.material as THREE.Material).dispose();
      this.flat = null;
    }
    this.picture?.dispose();
    this.picture = null;
    this.ambient?.dispose();
    this.ambient = null;
    this.scene.background = null;
  }

  private dropWorld(): void {
    for (const w of this.world) {
      w.mesh.removeFromParent();
      w.mesh.geometry.dispose();
      (w.mesh.material as THREE.Material).dispose();
      w.texture?.dispose();
    }
    this.world = [];
  }

  private dropRelief(): void {
    if (!this.relief) return;
    disposeReliefMesh(this.relief);
    this.relief = null;
  }

  private fit(): void {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.fov = cameraFovToContain(PICTURE_FOV_DEG, w / h, this.aspect);
    this.camera.updateProjectionMatrix();
  }

  private readonly onPointer = (e: PointerEvent): void => {
    const r = this.el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    // The camera goes toward the pointer: looking from the left shows more of the right.
    this.target = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: 1 - ((e.clientY - r.top) / r.height) * 2 };
  };

  private readonly onLeave = (): void => {
    this.target = null;
  };

  private readonly tick = (now: number): void => {
    if (this.disposed) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.moving) this.clock += dt;
    const goal = this.target ?? { x: 0, y: 0 };
    const k = 1 - Math.exp(-POINTER_EASE * dt);
    this.eased = { x: this.eased.x + (goal.x - this.eased.x) * k, y: this.eased.y + (goal.y - this.eased.y) * k };
    const [x, y, z] = driftPosition(this.clock, this.eased, this.moving);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
    // Each mass bobs on its own beat; the canvas behind stays.
    for (const w of this.world) if (w.rank >= 0) w.mesh.position.y = bobOffset(this.clock, w.rank, w.distance, this.moving, this.world.length - 1);
    if (this.picture) this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
}

/** A dark, blurred copy of the painting for behind it; null where no 2D canvas exists (the background stays empty). */
function ambientCopy(img: HTMLCanvasElement): THREE.CanvasTexture | null {
  const c = document.createElement('canvas');
  c.width = AMBIENT_WIDTH;
  c.height = Math.max(1, Math.round((AMBIENT_WIDTH * img.height) / Math.max(1, img.width)));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.filter = AMBIENT_FILTER;
  const m = 56;
  ctx.drawImage(img, -m, -m, c.width + 2 * m, c.height + 2 * m);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
