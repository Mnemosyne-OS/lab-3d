/**
 * SplatStage — one splat scene on a canvas, outside React (doc 166): a
 * renderer, a camera that orbits, Spark drawing the points, and the frame loop.
 * A component owns one stage and disposes it; the stage owns everything it
 * created, and `dispose` frees all of it.
 *
 * Two ways a scene is framed:
 *  - with the cameras COLMAP placed (an object made in Mnemosyne OS): the
 *    first image is a viewpoint the person filmed, the orbit turns around the
 *    scene's real vertical, and an object cut out of its video can stand on
 *    a floor at its measured base, the camera never going under it;
 *  - without (a file from another tool): framed from where its points are
 *    (frameModel), and it can be turned upside down, because COLMAP-trained
 *    scenes (Brush, Inria's PLYs) have y pointing down.
 *
 * An object standing on its floor can be put in front of a décor (doc 163):
 * a picture drawn behind it in a first pass, the object in a second pass over
 * a cleared depth, so the room in the picture never cuts it. Like a piece on
 * a turntable in front of a backdrop: turning turns the piece, the backdrop
 * stays, and the camera keeps to where a product photo is taken from.
 * When the décor's depth is known it can be laid in relief: the picture on a
 * surface shaped by its depth, built from the camera as it stands (its
 * anchor), so turning shows the room move behind the object, within
 * RELIEF_TURN_DEG of that view (past it the surface shows its seams).
 *
 * A scene with its cameras can also be walked through (doc 166 §14): the
 * orbit is put down, a drag looks around, the keys or the on-screen pad
 * walk at eye height, and the eye stays where the person filmed (walkModel).
 *
 * @module engine/SplatStage
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { DECOR_MAX_POLAR, DECOR_MIN_POLAR, decorFraming, maxPolarAboveFloor, type Ground } from '../core/groundModel';
import { coverFit, type Framing } from '../core/decorModel';
import { RELIEF_TURN_DEG, orbitAzimuth, pictureFov, wrapAngle } from '../core/reliefModel';
import { blurredCopy, buildReliefMesh, disposeReliefMesh, type DepthPicture } from './relief';
import {
  KEY_TURN_RAD_S, NO_HOLD, bestStart, clampToZone, easeStep, heldOf, lookDir, lookOf, pushOf, startPose, stepOf, turnBy, walkKey, walkZone,
  type Held, type Look, type WalkKey, type WalkZone,
} from '../core/walkModel';
import type { Rig } from '../core/stageModel';
import { buildFloor, groundOfMesh, type Floor } from './floor';
import { fovForAspect, frameDistance, robustBounds, sampleStride, type Bounds } from './frameModel';

export const STAGE_FOV = 50;
/** OrbitControls' unit, frame-based: 2.0 is one turn in 30 s at 60 fps, so 1.2 is one in 50 s. */
const AUTO_ROTATE_SPEED = 1.2;
/** The air kept between the camera and the floor, in object heights. */
const FLOOR_MARGIN = 0.02;
/** A relief is rebuilt this long after the view stops changing shape (a window drag fires every frame). */
const RESHAPE_MS = 150;
/**
 * A frame longer than this (a tab that came back) counts as this long: the
 * walk never leaps. Under 4 frames a second the walk slows down instead
 * (measured: about one frame a second in a software-rendered browser).
 */
const MAX_FRAME_S = 0.25;
/** One wheel notch walks this many seconds' worth toward what the view faces. */
const WHEEL_SECONDS = 0.18;
/** A pinch walks this many seconds' worth per screen fraction the fingers moved apart. */
const PINCH_SECONDS = 3;

/** How the camera moves: around the scene, or inside it. */
export type StageMode = 'orbit' | 'walk';

/** The visit, while walking inside: where the eye may go, where it faces, what is held. */
interface Walk {
  zone: WalkZone;
  /** The filmed view the visit starts from, and comes back to. */
  startAt: number;
  look: Look;
  keys: Set<WalkKey>;
  pad: Held;
  run: boolean;
  velocity: [number, number, number];
  last: number;
  pointers: Map<number, { x: number; y: number }>;
  pinch: number | null;
  detach: () => void;
}

export interface LoadOptions {
  /** The cameras COLMAP placed (cameras.json); a rig without cameras counts as none. */
  rig?: Rig | null;
  /** Stand the object on its measured base: an object cut out of its video. Needs a rig. */
  floor?: boolean;
  /** Called once the points are decoded, before the scene is framed. */
  onDecoded?: () => void;
  /**
   * Keep the camera where it is when a scene is already shown with the same
   * rig: the next cloud of a training replaces the last one under the eye
   * that watches it.
   */
  keepView?: boolean;
  /** Open inside the scene, on its first filmed camera, instead of around it. Needs a rig. */
  walk?: boolean;
}

export interface StageInfo {
  /** Points in the scene, as Spark counted them; null when it did not say. */
  splats: number | null;
  /** Whether a floor was measured and drawn. */
  grounded: boolean;
  /** How many filmed viewpoints can be stepped through; 0 without a rig. */
  viewpoints: number;
  /** Whether the scene can be walked through (its cameras are known). */
  walkable: boolean;
  /** How the camera moves once staged. */
  mode: StageMode;
  /** The filmed view on screen once staged (a visit starts on the best-covered one). */
  viewAt: number;
}

export class SplatStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private readonly resize: ResizeObserver;
  private mesh: SplatMesh | null = null;
  private bounds: Bounds | null = null;
  private rig: Rig | null = null;
  private ground: Ground | null = null;
  private floor: Floor | null = null;
  private viewAt = 0;
  private flipped = true;
  private autoRotate = false;
  private raf = 0;
  private disposed = false;
  /** Each load takes a number: a scene decoded after a newer one was asked is dropped. */
  private loads = 0;
  /** The décor's pass, drawn before the object's. */
  private readonly backScene = new THREE.Scene();
  private backdrop: THREE.Texture | null = null;
  /** Each décor asked takes a number: a picture decoded after a newer ask is dropped. */
  private backdropCalls = 0;
  /** Told where the person left the camera in a décor, at the end of each gesture. */
  private viewListener: ((f: Framing) => void) | null = null;
  /** The décor's relief: its surface, the depth and the camera offset it was built from, the blurred picture behind it. */
  private readonly reliefGroup = new THREE.Group();
  private relief: { mesh: THREE.Mesh; depth: DepthPicture; offset: [number, number, number]; dist: number; azimuth: number; behind: THREE.Texture | null } | null = null;
  private reshapeTimer: number | null = null;
  private walk: Walk | null = null;

  constructor(private readonly el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.setClearColor(0x000000, 0);
    // Two passes when a décor is shown: the frame is cleared once, by hand.
    this.renderer.autoClear = false;
    el.appendChild(this.renderer.domElement);
    this.backScene.add(this.reliefGroup);
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    this.camera = new THREE.PerspectiveCamera(fovForAspect(STAGE_FOV, aspect), aspect, 0.01, 5000);
    this.scene.add(new SparkRenderer({ renderer: this.renderer }));
    this.controls = this.makeControls();
    this.resize = new ResizeObserver(() => {
      // A hidden tab measures 0: its last real size is kept.
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      this.camera.aspect = el.clientWidth / el.clientHeight;
      this.camera.fov = fovForAspect(STAGE_FOV, this.camera.aspect);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(el.clientWidth, el.clientHeight);
      this.fitBackdrop();
      this.reshapeRelief();
    });
    this.resize.observe(el);
    const toTarget = new THREE.Vector3();
    const foot = new THREE.Vector3();
    const up = new THREE.Vector3();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      // A hidden tab keeps its stage but draws nothing: the graphics card is shared.
      if (this.el.clientWidth === 0) return;
      if (this.walk) {
        this.stepWalk();
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        return;
      }
      const c = this.controls;
      const g = this.ground;
      if (g) {
        foot.set(...g.foot);
        up.set(...g.up);
        // The floor's height under the orbit's centre, wherever the person moved it.
        let h = toTarget.copy(c.target).sub(foot).dot(up);
        // Moving the object by right-drag never takes the centre under the floor.
        if (h < 0) {
          c.target.addScaledVector(up, -h);
          this.camera.position.addScaledVector(up, -h);
          h = 0;
        }
        const aboveFloor = maxPolarAboveFloor(this.camera.position.distanceTo(c.target), h, (g.top - g.base) * FLOOR_MARGIN);
        // In a décor the camera stays where a product photo is taken: never overhead, never at the floor.
        c.maxPolarAngle = this.backdrop ? Math.min(DECOR_MAX_POLAR, aboveFloor) : aboveFloor;
        c.minPolarAngle = this.backdrop ? Math.min(DECOR_MIN_POLAR, c.maxPolarAngle) : 0;
      }
      // A relief is believable near the view it was built from: the turn is bounded around it.
      const r = this.relief;
      const turn = (RELIEF_TURN_DEG * Math.PI) / 180;
      c.minAzimuthAngle = r ? wrapAngle(r.azimuth - turn) : -Infinity;
      c.maxAzimuthAngle = r ? wrapAngle(r.azimuth + turn) : Infinity;
      c.update();
      if (r) {
        // The relief follows the orbit's centre (placing the object moves it over the room)
        // and the distance (the wheel sizes the object, not the room): only turning shows depth.
        this.reliefGroup.position.copy(c.target);
        this.reliefGroup.scale.setScalar(this.camera.position.distanceTo(c.target) / r.dist);
      }
      this.renderer.clear();
      if (this.backdrop) {
        this.renderer.render(this.backScene, this.camera);
        this.renderer.clearDepth();
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** OrbitControls reads `camera.up` once, when made: a scene with another vertical needs new controls. */
  private makeControls(): OrbitControls {
    const c = new OrbitControls(this.camera, this.renderer.domElement);
    c.enableDamping = true;
    c.autoRotateSpeed = AUTO_ROTATE_SPEED;
    c.autoRotate = this.autoRotate;
    // Set here, on every new controls: one added once would die with the first controls replaced.
    c.addEventListener('end', () => { if (this.backdrop) this.viewListener?.(this.framing()); });
    return c;
  }

  /** Whether the scene on stage can be walked through: its cameras are known, and no décor is behind it. */
  canWalk(): boolean {
    return this.rig !== null && this.backdrop === null && walkZone(this.rig) !== null;
  }

  /** The filmed view last stepped to (0 with no rig). */
  get viewIndex(): number {
    return this.viewAt;
  }

  /** How the camera moves now. */
  get mode(): StageMode {
    return this.walk ? 'walk' : 'orbit';
  }

  /**
   * Inside the scene or around it; answers the mode applied (walking needs
   * canWalk). Going in keeps the view: the eye stays where it is (brought
   * into the filmed zone) and faces where it faced. Going out orbits around
   * the point the view faced, at the scene's distance, so nothing jumps.
   */
  setMode(mode: StageMode): StageMode {
    if (mode === 'walk' && !this.walk && this.canWalk()) {
      const zone = walkZone(this.rig!)!;
      const t = this.controls.target;
      const p = this.camera.position;
      this.enterWalk(zone, clampToZone(zone, [p.x, p.y, p.z]), lookOf(zone.basis, [t.x - p.x, t.y - p.y, t.z - p.z]), bestStart(this.rig!, zone.scale));
    } else if (mode === 'orbit' && this.walk) {
      const w = this.walk;
      const d = lookDir(w.zone.basis, w.look);
      const p = this.camera.position;
      this.leaveWalk();
      this.controls.target.set(p.x + d[0] * w.zone.scale, p.y + d[1] * w.zone.scale, p.z + d[2] * w.zone.scale);
      this.controls.update();
    }
    return this.mode;
  }

  /** What the on-screen pad holds (a press-and-hold on its arrows), added to the keys held. */
  setPad(held: Held): void {
    if (this.walk) this.walk.pad = held;
  }

  private enterWalk(zone: WalkZone, position: [number, number, number], look: Look, startAt: number): void {
    this.controls.enabled = false;
    const el = this.renderer.domElement;
    const keys = new Set<WalkKey>();
    const pointers = new Map<number, { x: number; y: number }>();
    const w: Walk = { zone, startAt, look, keys, pad: NO_HOLD, run: false, velocity: [0, 0, 0], last: performance.now(), pointers, pinch: null, detach: () => {} };
    // Two fingers' distance, as a share of the view's smaller side; null with fewer than two.
    const spread = (): number | null => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, Math.min(this.el.clientWidth, this.el.clientHeight)) : null;
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      w.pinch = spread();
    };
    const move = (e: PointerEvent) => {
      const was = pointers.get(e.pointerId);
      if (!was) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        w.look = turnBy(w.look, e.clientX - was.x, e.clientY - was.y);
        return;
      }
      const now = spread();
      if (now !== null && w.pinch !== null) this.pushWalk(pushOf(zone, w.look, (now - w.pinch) * PINCH_SECONDS));
      w.pinch = now;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      w.pinch = spread();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY !== 0) this.pushWalk(pushOf(zone, w.look, (e.deltaY < 0 ? 1 : -1) * WHEEL_SECONDS));
    };
    const menu = (e: Event) => e.preventDefault();
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const keydown = (e: KeyboardEvent) => {
      w.run = e.shiftKey;
      const k = walkKey(e.code);
      if (!k || typing(e.target) || this.el.clientWidth === 0 || e.ctrlKey || e.metaKey || e.altKey) return;
      // Arrows and Page keys would scroll the page under the scene.
      e.preventDefault();
      keys.add(k);
    };
    const keyup = (e: KeyboardEvent) => {
      w.run = e.shiftKey;
      const k = walkKey(e.code);
      if (k) keys.delete(k);
    };
    // A key held while the window loses the focus never gets its keyup: everything held is let go.
    const blur = () => { keys.clear(); pointers.clear(); w.pad = NO_HOLD; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    w.detach = () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
    this.walk = w;
    this.camera.position.set(...position);
    this.setDepthRange(zone.scale);
    this.aimWalk();
  }

  private leaveWalk(): void {
    this.walk?.detach();
    this.walk = null;
    this.controls.enabled = true;
  }

  /** One frame of the visit: what is held turns and walks, eased, kept inside the filmed zone. */
  private stepWalk(): void {
    const w = this.walk!;
    const now = performance.now();
    const dt = Math.min(MAX_FRAME_S, Math.max(0, (now - w.last) / 1000));
    w.last = now;
    const keys = heldOf(w.keys);
    const held: Held = {
      forward: Math.sign(keys.forward + w.pad.forward), side: Math.sign(keys.side + w.pad.side),
      rise: Math.sign(keys.rise + w.pad.rise), turn: Math.sign(keys.turn + w.pad.turn),
    };
    if (held.turn !== 0) w.look = { ...w.look, yaw: w.look.yaw + held.turn * KEY_TURN_RAD_S * dt };
    // The speed asked, eased toward: a velocity per second, moved by dt.
    w.velocity = easeStep(w.velocity, stepOf(w.zone, w.look, held, 1, w.run), dt);
    const v = w.velocity;
    if (v[0] !== 0 || v[1] !== 0 || v[2] !== 0) {
      const p = this.camera.position;
      this.camera.position.set(...clampToZone(w.zone, [p.x + v[0] * dt, p.y + v[1] * dt, p.z + v[2] * dt]));
    }
    this.aimWalk();
  }

  /** A step at once (a wheel notch, a pinch), kept inside the filmed zone. */
  private pushWalk(step: [number, number, number]): void {
    if (!this.walk) return;
    const p = this.camera.position;
    this.camera.position.set(...clampToZone(this.walk.zone, [p.x + step[0], p.y + step[1], p.z + step[2]]));
  }

  private aimWalk(): void {
    const w = this.walk!;
    const d = lookDir(w.zone.basis, w.look);
    const p = this.camera.position;
    this.camera.lookAt(p.x + d[0], p.y + d[1], p.z + d[2]);
  }

  /** The eye on a filmed camera, facing what was filmed, still walking. */
  private walkTo(at: number): void {
    const w = this.walk!;
    const s = startPose(this.rig!, w.zone.basis, at);
    this.viewAt = at;
    w.velocity = [0, 0, 0];
    w.look = s.look;
    this.camera.position.set(...s.position);
    this.aimWalk();
  }

  /** Where the camera stands now. */
  framing(): Framing {
    return { position: this.camera.position.toArray() as Framing['position'], target: this.controls.target.toArray() as Framing['target'] };
  }

  /** Who is told where the person left the camera in a décor (null: nobody). */
  setViewListener(cb: ((f: Framing) => void) | null): void {
    this.viewListener = cb;
  }

  /**
   * The décor's picture (a URL) behind the object, or none. Only behind an
   * object standing on its measured floor; resolves whether it was applied (a
   * newer call wins). The camera goes to `framing` when given (where the
   * person left it last time), else to a product photo's viewpoint.
   */
  async setBackdrop(url: string | null, framing: Framing | null): Promise<boolean> {
    const call = ++this.backdropCalls;
    if (!url) {
      this.dropBackdrop();
      return true;
    }
    const g = this.ground;
    const rig = this.rig;
    if (!g || !rig) return false;
    const tex = await new THREE.TextureLoader().loadAsync(url);
    if (this.disposed || call !== this.backdropCalls || this.ground !== g) { tex.dispose(); return false; }
    tex.colorSpace = THREE.SRGBColorSpace;
    // A décor is looked at from where a product photo is taken: no walking inside it.
    if (this.walk) this.leaveWalk();
    // A relief belongs to one picture: a new décor starts flat until its own depth is read.
    this.dropRelief();
    this.backdrop?.dispose();
    this.backdrop = tex;
    this.backScene.background = tex;
    this.fitBackdrop();
    // The décor's picture is the floor now: the studio disc goes.
    this.floor?.setDecor(true);
    this.placeInDecor(framing ?? decorFraming(g, rig.cams[0]!, this.camera.fov));
    return true;
  }

  private placeInDecor(f: Framing): void {
    this.controls.target.set(...f.target);
    this.camera.position.set(...f.position);
    this.setDepthRange(this.camera.position.distanceTo(this.controls.target));
  }

  /**
   * The décor shown laid on its depth, or flat again (null). Only over a décor
   * behind an object on its floor; false when it cannot be built. The anchor
   * is the camera as it stands now: built from here, the surface lands exactly
   * on the flat picture, so nothing jumps when it appears.
   */
  setRelief(depth: DepthPicture | null): boolean {
    this.dropRelief();
    if (!depth) return true;
    const g = this.ground;
    const tex = this.backdrop;
    const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!g || !tex || !img?.width || !img.height) return false;
    const t = this.controls.target;
    const offset: [number, number, number] = [this.camera.position.x - t.x, this.camera.position.y - t.y, this.camera.position.z - t.z];
    const mesh = this.reliefMeshFor(depth, offset);
    if (!mesh) return false;
    this.reliefGroup.add(mesh);
    // Behind a relief the flat picture is blurred: turning uncovers it at the sides, and sharp it read as a second room.
    const behind = blurredCopy(img);
    this.relief = { mesh, depth, offset, dist: Math.hypot(...offset), azimuth: orbitAzimuth(offset, g.up), behind };
    if (behind) {
      this.backScene.background = behind;
      this.fitBackdrop();
    }
    return true;
  }

  /** The surface for the view's shape now: the flat décor is cropped to cover the view, so the picture spreads over another field. */
  private reliefMeshFor(depth: DepthPicture, offset: [number, number, number]): THREE.Mesh | null {
    const tex = this.backdrop;
    const img = tex?.image as { width?: number; height?: number } | undefined;
    if (!tex || !img?.width || !img.height || !this.ground) return null;
    const aspect = img.width / img.height;
    const fov = pictureFov(this.camera.fov, this.el.clientWidth / Math.max(1, this.el.clientHeight), aspect);
    return buildReliefMesh(depth, tex, { offset, up: this.ground.up }, fov, aspect);
  }

  /** Rebuilt from the same anchor once the view stops changing shape. */
  private reshapeRelief(): void {
    if (!this.relief) return;
    if (this.reshapeTimer !== null) window.clearTimeout(this.reshapeTimer);
    this.reshapeTimer = window.setTimeout(() => {
      this.reshapeTimer = null;
      const r = this.relief;
      if (!r || this.disposed) return;
      const mesh = this.reliefMeshFor(r.depth, r.offset);
      if (!mesh) return;
      disposeReliefMesh(r.mesh);
      this.reliefGroup.add(mesh);
      r.mesh = mesh;
    }, RESHAPE_MS);
  }

  private dropRelief(): void {
    if (this.reshapeTimer !== null) window.clearTimeout(this.reshapeTimer);
    this.reshapeTimer = null;
    const r = this.relief;
    if (!r) return;
    disposeReliefMesh(r.mesh);
    r.behind?.dispose();
    this.relief = null;
    this.backScene.background = this.backdrop;
    this.fitBackdrop();
  }

  private dropBackdrop(): void {
    this.dropRelief();
    this.backdrop?.dispose();
    this.backdrop = null;
    this.backScene.background = null;
    this.floor?.setDecor(false);
  }

  /** The pictures behind (the décor, and its blurred copy under a relief) cover the view without being stretched: centred crop. */
  private fitBackdrop(): void {
    for (const tex of [this.backdrop, this.relief?.behind ?? null]) {
      const img = tex?.image as { width?: number; height?: number } | undefined;
      if (!tex || !img?.width || !img.height) continue;
      const fit = coverFit(img.width / img.height, this.el.clientWidth / Math.max(1, this.el.clientHeight));
      tex.repeat.set(...fit.repeat);
      tex.offset.set(...fit.offset);
    }
  }

  /**
   * Shows the scene in `bytes` (Spark reads .spz, .ply, .splat, .ksplat by the
   * name's extension). The scene on stage stays until the new one is decoded,
   * so a replacement never flashes black. Rejects with Spark's reason,
   * EMPTY_SCENE, SUPERSEDED when a newer load was asked meanwhile, or
   * STAGE_DISPOSED when the stage went away while decoding.
   */
  async load(bytes: Uint8Array, fileName: string, opts: LoadOptions = {}): Promise<StageInfo> {
    const n = ++this.loads;
    const mesh = new SplatMesh({ fileBytes: bytes, fileName });
    await mesh.initialized;
    if (this.disposed) { mesh.dispose(); throw new Error('STAGE_DISPOSED'); }
    if (n !== this.loads) { mesh.dispose(); throw new Error('SUPERSEDED'); }
    const count = mesh.packedSplats?.numSplats ?? null;
    if (count === 0) { mesh.dispose(); throw new Error('EMPTY_SCENE'); }
    opts.onDecoded?.();
    const rig = opts.rig && opts.rig.cams.length > 0 ? opts.rig : null;
    // The view is kept only in the same frame: a rig that arrives (or changes) reframes.
    const keep = opts.keepView === true && this.mesh !== null && this.rig === rig;
    this.unload();
    this.mesh = mesh;
    this.scene.add(mesh);
    this.rig = rig;
    if (!keep) {
      if (this.walk) this.leaveWalk();
      this.camera.up.set(...(rig?.up ?? [0, 1, 0]));
      this.controls.dispose();
      this.controls = this.makeControls();
    }
    if (rig) {
      // COLMAP's frame as it is: the up the cameras had.
      mesh.quaternion.identity();
      if (opts.floor) {
        this.ground = groundOfMesh(mesh, rig);
        if (this.ground) {
          this.floor = buildFloor(this.ground);
          this.scene.add(this.floor.group);
        } else {
          console.warn('[lab-3d] the base could not be measured: no floor drawn');
        }
      }
    } else {
      this.bounds = this.measure(mesh, count);
      this.applyFlip();
    }
    if (!keep) {
      this.resetView();
      const zone = opts.walk && rig ? walkZone(rig) : null;
      if (zone && rig) {
        const at = bestStart(rig, zone.scale);
        const s = startPose(rig, zone.basis, at);
        this.viewAt = at;
        this.enterWalk(zone, s.position, s.look, at);
      }
    }
    // The promise ends on a painted frame, so « staged » is something on screen.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return { splats: count, grounded: this.ground !== null, viewpoints: rig?.cams.length ?? 0, walkable: this.canWalk(), mode: this.mode, viewAt: this.viewAt };
  }

  /** The points' box, read on a sample of them. */
  private measure(mesh: SplatMesh, count: number | null): Bounds | null {
    const stride = sampleStride(count ?? 0);
    const xyz: number[] = [];
    mesh.forEachSplat((index, center) => {
      if (index % stride === 0) xyz.push(center.x, center.y, center.z);
    });
    return robustBounds(xyz);
  }

  /** COLMAP's y points down: upside down is the 180° turn about x. A rigged scene is never turned. */
  private applyFlip(): void {
    if (!this.mesh || this.rig) return;
    if (this.flipped) this.mesh.quaternion.set(1, 0, 0, 0);
    else this.mesh.quaternion.identity();
  }

  setFlipped(on: boolean): void {
    this.flipped = on;
    if (this.rig) return;
    this.applyFlip();
    this.resetView();
  }

  setAutoRotate(on: boolean): void {
    this.autoRotate = on;
    this.controls.autoRotate = on;
  }

  /** The camera on a viewpoint: a product photo's in a décor, the first filmed one with a rig, else in front of the points. */
  resetView(): void {
    if (this.walk && this.rig) {
      this.walkTo(this.walk.startAt);
      return;
    }
    if (this.backdrop && this.ground && this.rig) {
      this.placeInDecor(decorFraming(this.ground, this.rig.cams[0]!, this.camera.fov));
      return;
    }
    if (this.rig) {
      this.viewAt = 0;
      this.placeAt(this.rig.cams[0]!);
      return;
    }
    const b = this.bounds;
    const [cx, cy, cz] = b?.center ?? [0, 0, 0];
    // The flip turns (x, y, z) into (x, −y, −z).
    const center = new THREE.Vector3(cx, this.flipped ? -cy : cy, this.flipped ? -cz : cz);
    const d = frameDistance(b?.radius ?? 1, this.camera.fov, this.camera.aspect);
    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + d * 0.25, center.z + d);
    this.setDepthRange(d);
  }

  /** The next (`delta` = 1) or previous filmed viewpoint; its index, or null without a rig. */
  stepViewpoint(delta: number): number | null {
    const rig = this.rig;
    // In a décor the filmed viewpoints would leave the photo's range: not offered.
    if (!rig || this.backdrop) return null;
    const n = rig.cams.length;
    this.viewAt = (((this.viewAt + delta) % n) + n) % n;
    if (this.walk) this.walkTo(this.viewAt);
    else this.placeAt(rig.cams[this.viewAt]!);
    return this.viewAt;
  }

  private placeAt(cam: readonly [number, number, number]): void {
    const rig = this.rig!;
    this.controls.target.set(...rig.target);
    this.camera.position.set(...cam);
    this.setDepthRange(this.camera.position.distanceTo(this.controls.target));
  }

  private setDepthRange(distance: number): void {
    const d = Math.max(1e-3, distance);
    this.camera.near = Math.max(0.001, d / 1000);
    this.camera.far = d * 100;
    this.camera.updateProjectionMatrix();
    // The orbit's update aims the camera at its centre: never while walking.
    if (!this.walk) this.controls.update();
  }

  /** Takes the scene off the stage, keeping the stage. A load still decoding is dropped too. */
  close(): void {
    this.loads++;
    this.unload();
  }

  private unload(): void {
    // A visit belongs to the scene it walks through.
    if (this.walk) this.leaveWalk();
    // A décor belongs to the object it was put behind.
    this.backdropCalls++;
    this.dropBackdrop();
    this.floor?.dispose();
    this.floor = null;
    this.ground = null;
    this.rig = null;
    this.bounds = null;
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.unload();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
