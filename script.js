import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
   CONFIG — one entry per model, in chronological order.

   side       : -1 = stage left, 1 = stage right (must mirror the
                text-left / text-right classes set in index.html)
   frontTurn  : the base Y rotation (radians) that points this
                model's FRONT fascia at the camera. Every source
                GLB was modelled/exported with its own forward
                axis, so this is tuned per file from visual
                inspection. If a model ever shows its rear instead
                of its front, add Math.PI to flip it end‑for‑end,
                or flip the sign to mirror which way it turns.
   ============================================================ */
const MODELS = [
  { file: 'assets/models/2006-supercharged.glb', side: -1, frontTurn:  Math.PI / 2 },
  { file: 'assets/models/2011-evoque.glb',        side:  1, frontTurn: -Math.PI / 2 },
  { file: 'assets/models/velar.glb',              side: -1, frontTurn:  Math.PI / 2 },
  { file: 'assets/models/sv-coupe.glb',           side:  1, frontTurn: -Math.PI / 2 },
];

const TARGET_SIZE      = 3.55;   // normalized world-space size of the largest dimension — bigger, more commanding presence
const SIDE_OFFSET       = 2.65;  // base lateral unit used to derive rest/active positions below
const REST_MULTIPLIER   = 2.2;   // idle position multiplier — pushes the model fully off‑screen to the side
const ACTIVE_MULTIPLIER = 0.92;  // active position multiplier — still "toward the side", out of the text's way

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = THREE.MathUtils.lerp;
const smoothstep = (x) => x * x * (3 - 2 * x);
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Renderer / scene / camera ---------------- */

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96; // slightly crushed — a closed garage, not a showroom

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.4, 9.4);
camera.lookAt(0, -0.15, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.045).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = 0.55;

/* ---------------- Lighting — a single warm lamp in a dark garage ---------------- */
/* Concept: near-black ambient, one warm overhead spotlight doing almost
   all the work (like a workshop lamp), a whisper of cool fill/rim just
   enough to keep the chrome legible against the dark. */

scene.add(new THREE.AmbientLight(0xffcf9e, 0.10));

const garageLamp = new THREE.SpotLight(0xffb066, 3.6, 40, Math.PI / 5.2, 0.55, 1.3);
garageLamp.position.set(0, 7.4, 2.2);
garageLamp.target.position.set(0, -1, 0);
scene.add(garageLamp, garageLamp.target);

const warmFill = new THREE.DirectionalLight(0xffdcb0, 0.32);
warmFill.position.set(-3, 1.6, 4);
scene.add(warmFill);

const coolRim = new THREE.DirectionalLight(0x8fa0b3, 0.30);
coolRim.position.set(-5, 3, -5);
scene.add(coolRim);

/* ---------------- Contact-shadow texture (procedural, no asset needed) ---------------- */

function makeShadowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const shadowTex = makeShadowTexture();
const shadowGeo = new THREE.PlaneGeometry(4.6, 4.6);

/* ---------------- Loading ---------------- */

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');
const statusEl = document.getElementById('loader-status');
document.body.classList.add('is-loading');

const progressByFile = new Array(MODELS.length).fill(0);
function reportProgress() {
  const avg = progressByFile.reduce((a, b) => a + b, 0) / MODELS.length;
  const pct = Math.round(avg * 100);
  fillEl.style.width = pct + '%';
  pctEl.textContent = pct + '%';
}

/* Each entry: { outer, materials:[], shadowMat, side, frontTurn, weight } */
const rigs = new Array(MODELS.length).fill(null);

function frameModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  root.position.sub(center);

  const wrapper = new THREE.Group();
  wrapper.add(root);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = TARGET_SIZE / maxDim;
  wrapper.scale.setScalar(scale);

  // lift so the model's lowest point rests on y = -1.05 (our "ground")
  const lowestY = (box.min.y - center.y) * scale;
  wrapper.position.y = -1.05 - lowestY;

  return wrapper;
}

function collectMaterials(root) {
  const mats = [];
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = obj.material.clone();
      obj.material.transparent = false;
      obj.material.opacity = 1;
      if ('envMapIntensity' in obj.material) obj.material.envMapIntensity = 1.15;
      obj.frustumCulled = false;
      mats.push(obj.material);
    }
  });
  return mats;
}

function loadOne(i) {
  const cfg = MODELS[i];
  return new Promise((resolve) => {
    loader.load(
      cfg.file,
      (gltf) => {
        const wrapper = frameModel(gltf.scene);
        const materials = collectMaterials(gltf.scene);

        const outer = new THREE.Group();
        outer.add(wrapper);
        outer.rotation.y = cfg.frontTurn;
        outer.position.x = cfg.side * SIDE_OFFSET * REST_MULTIPLIER;

        const shadow = new THREE.Mesh(
          shadowGeo,
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -1.06;
        outer.add(shadow);

        scene.add(outer);

        rigs[i] = {
          outer,
          materials,
          shadowMat: shadow.material,
          side: cfg.side,
          frontTurn: cfg.frontTurn,
          weight: 0,
        };

        progressByFile[i] = 1;
        reportProgress();
        resolve();
      },
      (xhr) => {
        if (xhr.total) {
          progressByFile[i] = xhr.loaded / xhr.total;
          reportProgress();
        }
      },
      (err) => {
        console.error('Failed to load', cfg.file, err);
        progressByFile[i] = 1;
        reportProgress();
        resolve();
      }
    );
  });
}

Promise.all(MODELS.map((_, i) => loadOne(i))).then(() => {
  statusEl.textContent = 'READY';
  setTimeout(() => {
    loaderEl.classList.add('is-hidden');
    document.body.classList.remove('is-loading');
  }, 350);
});

/* ============================================================
   Scroll → weight mapping
   Each model section's proximity to the viewport centre produces
   a 0..1 weight. That weight drives ONLY position and scale — the
   cars stay fully opaque throughout. The outgoing model slides
   away toward its resting position off‑screen while the next one
   slides in from its own resting position, so the "replacement"
   reads as a clean slide, never a fade.
   ============================================================ */

const sections = Array.from(document.querySelectorAll('.model-section'));
const dots = Array.from(document.querySelectorAll('.dot'));

function computeWeight(el) {
  const rect = el.getBoundingClientRect();
  const center = rect.top + rect.height / 2;
  const viewportCenter = window.innerHeight / 2;
  const dist = Math.abs(center - viewportCenter);
  const norm = clamp(1 - dist / (window.innerHeight * 0.82), 0, 1);
  return smoothstep(norm);
}

let targetWeights = new Array(MODELS.length).fill(0);
let ticking = false;

function onScrollOrResize() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    sections.forEach((el, i) => {
      targetWeights[i] = computeWeight(el);
    });

    // in-view class for the text panel reveal
    sections.forEach((el, i) => {
      el.classList.toggle('in-view', targetWeights[i] > 0.15);
    });

    // active dot = highest weight amongst model sections (index offset by 1 for "hero" dot)
    let maxI = -1, maxW = 0.12;
    targetWeights.forEach((w, i) => { if (w > maxW) { maxW = w; maxI = i; } });
    dots.forEach((d, i) => d.classList.toggle('active', i === (maxI + 1)));
    if (maxI === -1) {
      const heroRect = document.getElementById('hero').getBoundingClientRect();
      const heroVisible = heroRect.bottom > window.innerHeight * 0.3;
      dots[0].classList.toggle('active', heroVisible);
    }

    ticking = false;
  });
}

window.addEventListener('scroll', onScrollOrResize, { passive: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  onScrollOrResize();
});

/* click-to-scroll nav */
dots.forEach((dot) => {
  dot.addEventListener('click', () => {
    const id = dot.dataset.target;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});
document.getElementById('back-top').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------------- Subtle mouse parallax on the camera ---------------- */

let mouseX = 0, mouseY = 0, camX = 0, camY = 0.4;
if (!prefersReducedMotion) {
  window.addEventListener('pointermove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });
}

/* ---------------- Render loop ---------------- */

const clock = new THREE.Clock();
renderer.setSize(window.innerWidth, window.innerHeight);
onScrollOrResize();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  // camera parallax
  camX = lerp(camX, mouseX * 0.32, 0.05);
  camY = lerp(camY, 0.4 - mouseY * 0.1, 0.05);
  camera.position.x = camX;
  camera.position.y = camY;
  camera.lookAt(0, -0.15, 0);

  rigs.forEach((rig, i) => {
    if (!rig) return;
    rig.weight = lerp(rig.weight, targetWeights[i], 1 - Math.pow(0.001, delta));
    const w = rig.weight;

    // position: rest fully off-screen to the side, slide in "toward the side" (not centre) when active
    const restX = rig.side * SIDE_OFFSET * REST_MULTIPLIER;
    const activeX = rig.side * SIDE_OFFSET * ACTIVE_MULTIPLIER;
    rig.outer.position.x = lerp(restX, activeX, w);
    rig.outer.position.y = -0.15 + Math.sin(t * 0.5 + i) * 0.015 * (0.3 + w);

    // scale: a touch smaller while off-stage, full presence when active
    const s = lerp(0.82, 1, w);
    rig.outer.scale.setScalar(s);

    // rotation: fixed front-facing turn plus only a small, bounded sway —
    // the front of the car is always what's on screen, it never spins to a profile/rear view
    rig.outer.rotation.y = rig.frontTurn + Math.sin(t * 0.3 + i * 1.7) * 0.05;

    // fully opaque always — the transition is a slide, never a fade
    rig.shadowMat.opacity = lerp(rig.shadowMat.opacity, w * 0.85, 1 - Math.pow(0.001, delta));
  });

  renderer.render(scene, camera);
}
animate();
