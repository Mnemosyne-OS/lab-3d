/**
 * CompareStage — two dates of one place, in the reference's frame (doc 163
 * §6, ported from Objets 3D's CompareViewer for doc 166 lot 6). Each date has
 * its own renderer and canvas (each Spark sorts its own splats); the later one
 * is carried in by the similarity the host measured, never retrained.
 *
 * The page lays the two canvases one over the other and decides how the later
 * one shows (its opacity for the timeline, a clip for the curtain); this class
 * draws both from one camera, and for the differences renders both from a
 * viewpoint both videos filmed and hands the pixels back.
 *
 * @module engine/CompareStage
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import type { RefView, Sim3Pose } from '../core/compareModel';
import type { Rig } from '../core/stageModel';
import type { Vec3 } from '../core/groundModel';
import { fovForAspect } from './frameModel';
import { STAGE_FOV } from './SplatStage';

export type CompareMode = 'fade' | 'curtain' | 'diff';

/** Two renders of one viewpoint, RGBA, rows bottom-up as WebGL reads them. */
export interface Shot { a: Uint8Array; b: Uint8Array; w: number; h: number }

/** One date's scene file, as the host sent it. */
export interface SceneBytes { bytes: Uint8Array; fileName: string }

/** Time the two scenes keep rendering at a new viewpoint before they are read: Spark sorts its splats over a few frames. */
const SETTLE_MS = 700;
/** Height, in pixels, of the two renders a difference is measured on. */
const DIFF_HEIGHT = 512;

interface Layer { r: THREE.WebGLRenderer; scene: THREE.Scene }

export class CompareStage {
  private readonly A: Layer;
  private readonly B: Layer;
  private readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls | null = null;
  private readonly meshes: SplatMesh[] = [];
  private readonly resize: ResizeObserver;
  private rig: Rig | null = null;
  private mode: CompareMode = 'fade';
  private raf = 0;
  private disposed = false;
  private loaded = false;

  /** `elA` and `elB` hold the two canvases; `surface`, laid over them, takes the person's turns. */
  constructor(private readonly elA: HTMLElement, private readonly elB: HTMLElement, private readonly surface: HTMLElement) {
    const make = (el: HTMLElement): Layer => {
      const r = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      r.setSize(el.clientWidth, el.clientHeight);
      r.setClearColor(0x000000, 0);
      el.appendChild(r.domElement);
      const scene = new THREE.Scene();
      scene.add(new SparkRenderer({ renderer: r }));
      return { r, scene };
    };
    this.A = make(elA);
    this.B = make(elB);
    const aspect = elA.clientWidth / Math.max(1, elA.clientHeight);
    this.camera = new THREE.PerspectiveCamera(fovForAspect(STAGE_FOV, aspect), aspect, 0.01, 2000);
    this.resize = new ResizeObserver(() => {
      // A hidden tab measures 0; the difference keeps the viewpoint's own shape.
      if (elA.clientWidth === 0 || elA.clientHeight === 0 || this.mode === 'diff') return;
      this.fitView();
    });
    this.resize.observe(elA);
  }

  /**
   * Both dates on stage: the reference as it is, the later carried by `pose`.
   * The camera starts at `start` (a viewpoint both videos filmed) or the
   * reference's first filmed camera, turning around the reference's centre.
   * Rejects with Spark's reason, or STAGE_DISPOSED when the stage went first.
   */
  async load(ref: SceneBytes, moved: SceneBytes, rig: Rig | null, pose: Sim3Pose, start: Vec3 | null): Promise<void> {
    if (this.loaded) throw new Error('ALREADY_LOADED');
    this.loaded = true;
    const meshA = new SplatMesh({ fileBytes: ref.bytes, fileName: ref.fileName });
    const meshB = new SplatMesh({ fileBytes: moved.bytes, fileName: moved.fileName });
    this.meshes.push(meshA, meshB);
    meshB.quaternion.set(...pose.quaternion);
    meshB.scale.setScalar(pose.scale);
    meshB.position.set(...pose.position);
    this.A.scene.add(meshA);
    this.B.scene.add(meshB);
    await Promise.all([meshA.initialized, meshB.initialized]);
    if (this.disposed) throw new Error('STAGE_DISPOSED');
    this.rig = rig;
    this.controls = new OrbitControls(this.camera, this.surface);
    this.controls.enableDamping = true;
    if (rig) {
      this.camera.up.set(...rig.up);
      this.controls.target.set(...rig.target);
      this.camera.position.set(...(start ?? rig.cams[0]!));
    } else {
      this.camera.position.set(0, 0, 3);
    }
    this.controls.update();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (this.elA.clientWidth === 0) return;
      // In the difference view the camera stays on the filmed viewpoint: the orbit would turn it to its target.
      if (this.mode !== 'diff') this.controls?.update();
      // The curtain needs the later date opaque, or the earlier shows through its empty parts.
      this.B.r.setClearColor(0x000000, this.mode === 'curtain' ? 1 : 0);
      this.A.r.render(this.A.scene, this.camera);
      this.B.r.render(this.B.scene, this.camera);
    };
    loop();
  }

  /** How the dates are shown; leaving the differences gives the orbit back, at the window's shape. */
  setMode(mode: CompareMode): void {
    const was = this.mode;
    this.mode = mode;
    if (was === 'diff' && mode !== 'diff') this.fitView();
  }

  /** Back to the first filmed viewpoint. */
  resetView(): void {
    if (!this.controls) return;
    if (this.rig) {
      this.controls.target.set(...this.rig.target);
      this.camera.position.set(...this.rig.cams[0]!);
    }
    this.controls.update();
  }

  /**
   * Both dates rendered from one filmed viewpoint, read back. The camera
   * stays there until the mode changes. Rejects NOT_READY before the scenes are in.
   */
  async measure(v: RefView): Promise<Shot> {
    if (!this.controls) throw new Error('NOT_READY');
    const h = DIFF_HEIGHT;
    const w = Math.max(1, Math.round(h * v.aspect));
    this.camera.position.set(...v.position);
    this.camera.quaternion.set(...v.quaternion);
    this.camera.fov = v.fovY;
    this.camera.aspect = v.aspect;
    this.camera.updateProjectionMatrix();
    await new Promise((res) => setTimeout(res, SETTLE_MS));
    if (this.disposed) throw new Error('STAGE_DISPOSED');
    const read = (x: Layer): Uint8Array => {
      const rt = new THREE.WebGLRenderTarget(w, h);
      try {
        x.r.setRenderTarget(rt);
        x.r.setClearColor(0x000000, 0);
        x.r.clear();
        x.r.render(x.scene, this.camera);
        const px = new Uint8Array(w * h * 4);
        x.r.readRenderTargetPixels(rt, 0, 0, w, h, px);
        return px;
      } finally {
        x.r.setRenderTarget(null);
        rt.dispose();
      }
    };
    return { a: read(this.A), b: read(this.B), w, h };
  }

  private fitView(): void {
    const aspect = this.elA.clientWidth / Math.max(1, this.elA.clientHeight);
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(STAGE_FOV, aspect);
    this.camera.updateProjectionMatrix();
    this.A.r.setSize(this.elA.clientWidth, this.elA.clientHeight);
    this.B.r.setSize(this.elB.clientWidth, this.elB.clientHeight);
    if (this.rig) this.camera.up.set(...this.rig.up);
    this.controls?.update();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.controls?.dispose();
    for (const m of this.meshes) m.dispose();
    for (const x of [this.A, this.B]) { x.r.dispose(); x.r.domElement.remove(); }
  }
}
