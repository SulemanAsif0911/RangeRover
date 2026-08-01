import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
   CONFIG — one entry per model, in chapter/chronological order.

   side       : 1 = the car enters from / rests on the right,
                -1 = from the left. Alternates chapter to chapter
                (right, left, right, left…) and the matching
                text-left / text-right class on each <section> in
                index.html is always the OPPOSITE side, so the car
                and the copy never sit on top of each other.
   frontTurn  : the base Y rotation (radians) that points this
                model's FRONT toward the camera. Derived by parsing
                each GLB's actual node/material names and geometry
                (named wheel nodes, grille/bumper/boot meshes) rather
                than by eye — see README for the per-file evidence.
                The one exception is "midnight", whose file has no
                named parts at all, so its value is a best-effort
                match to "classic" — add Math.PI to it if it's ever
                showing its rear.
   ============================================================ */
const MODELS = [
  { file: 'assets/models/range-rover-classic.glb',      side:  1, frontTurn: 0 },              // 01 — 1970
  { file: 'assets/models/2006-supercharged.glb',        side: -1, frontTurn: Math.PI },         // 02 — 2006
  { file: 'assets/models/2011-evoque.glb',              side:  1, frontTurn: 0 },               // 03 — 2011
  { file: 'assets/models/velar.glb',                    side: -1, frontTurn: Math.PI },         // 04 — 2017
  { file: 'assets/models/range-rover-sport-2018.glb',   side:  1, frontTurn: -Math.PI / 2 },     // 05 — 2018
  { file: 'assets/models/sv-coupe.glb',                 side: -1, frontTurn: Math.PI / 2 },     // 06 — 2018
  { file: 'assets/models/range-rover-midnight-blue.glb', side: 1, frontTurn: 0 },                // 07 — today
];

const HERO_ANGLE = 0.5;    // extra turn on top of frontTurn for a 3/4 hero angle rather than a flat head-on view
const TARGET_SIZE = 4.3;   // normalized world-space size of the largest dimension — big, commanding presence
const SIDE_DIST   = 2.2;   // how far toward its side the active car sits
const REST_DIST   = 6.6;   // fully off-screen resting distance (multiplied by each model's own `side`)
const VISIBLE_THRESHOLD = 0.02; // below this weight a car is fully hidden — never more than ~2 render at once

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = THREE.MathUtils.lerp;
const smoothstep = (x) => x * x * (3 - 2 * x);
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Renderer / scene / camera ---------------- */
/* Tuned for smoothness first: no AA, a capped pixel ratio, and —
   most importantly — only ever 1-2 of these seven heavy models
   actually rendered at any moment (see the visibility toggle in
   the render loop below). */

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.35, 11);
camera.lookAt(0, -0.1, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = 0.85;

/* ---------------- Lighting — neutral chrome studio, no borrowed colour ---------------- */

scene.add(new THREE.AmbientLight(0xffffff, 0.16));

const key = new THREE.SpotLight(0xf3f5ff, 3.4, 40, Math.PI / 5, 0.55, 1.15);
key.position.set(2.2, 6.5, 5);
key.target.position.set(0, -0.6, 0);
scene.add(key, key.target);

const fill = new THREE.DirectionalLight(0xe7eaee, 0.42);
fill.position.set(-4, 1.8, 3.5);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xd7dade, 0.85);
rim.position.set(-3.5, 2.2, -5);
scene.add(rim);

const groundBounce = new THREE.DirectionalLight(0xaeb2b8, 0.16);
groundBounce.position.set(0, -3, 2);
scene.add(groundBounce);

/* ---------------- Contact-shadow texture ---------------- */

function makeShadowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.26)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const shadowTex = makeShadowTexture();
const shadowGeo = new THREE.PlaneGeometry(4.9, 4.9);

/* ---------------- Loading ---------------- */
/* Only the FIRST model blocks the preloader. The other six load
   quietly in the background right after, so there's no multi-second
   stall for ~80MB of combined assets before the page is usable. */

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');
const statusEl = document.getElementById('loader-status');
document.body.classList.add('is-loading');

function reportProgress(loadedFirst, firstFraction) {
  const pct = Math.round((loadedFirst ? 1 : firstFraction) * 100);
  fillEl.style.width = pct + '%';
  pctEl.textContent = pct + '%';
}

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
      if ('envMapIntensity' in obj.material) obj.material.envMapIntensity = 1.25;
      // lighter textures in exchange for a much smoother scroll across seven heavy models
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach((slot) => {
        const tex = obj.material[slot];
        if (tex) {
          tex.anisotropy = 1;
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
        }
      });
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
      mats.push(obj.material);
    }
  });
  return mats;
}

function loadOne(i, onProgress) {
  const cfg = MODELS[i];
  return new Promise((resolve) => {
    loader.load(
      cfg.file,
      (gltf) => {
        const wrapper = frameModel(gltf.scene);
        const materials = collectMaterials(gltf.scene);

        const outer = new THREE.Group();
        outer.add(wrapper);
        outer.rotation.y = cfg.frontTurn + HERO_ANGLE;
        outer.position.x = cfg.side * REST_DIST;

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
        resolve();
      },
      (xhr) => {
        if (onProgress && xhr.total) onProgress(xhr.loaded / xhr.total);
      },
      (err) => {
        console.error('Failed to load', cfg.file, err);
        resolve();
      }
    );
  });
}

async function loadAll() {
  await loadOne(0, (frac) => reportProgress(false, frac));
  reportProgress(true, 1);
  statusEl.textContent = 'READY';
  setTimeout(() => {
    loaderEl.classList.add('is-hidden');
    document.body.classList.remove('is-loading');
  }, 300);

  // remaining models load quietly in the background, in chapter order
  for (let i = 1; i < MODELS.length; i++) {
    await loadOne(i);
  }
}
loadAll();

/* ============================================================
   Scroll → weight mapping
   ============================================================ */

const chapters = Array.from(document.querySelectorAll('.chapter'));
const tdots = Array.from(document.querySelectorAll('.tdot'));
const scrollCue = document.getElementById('scroll-cue');

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
    chapters.forEach((el, i) => {
      targetWeights[i] = computeWeight(el);
    });

    chapters.forEach((el, i) => {
      el.classList.toggle('in-view', targetWeights[i] > 0.15);
    });

    let maxI = 0, maxW = -1;
    targetWeights.forEach((w, i) => { if (w > maxW) { maxW = w; maxI = i; } });
    tdots.forEach((d, i) => d.classList.toggle('active', i === maxI));

    scrollCue.classList.toggle('is-hidden', window.scrollY > 80);

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

tdots.forEach((dot) => {
  dot.addEventListener('click', () => {
    const id = dot.dataset.target;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});
document.getElementById('back-top').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------------- Subtle mouse parallax ---------------- */

let mouseX = 0, mouseY = 0, camX = 0, camY = 0.35;
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

  camX = lerp(camX, mouseX * 0.3, 0.05);
  camY = lerp(camY, 0.35 - mouseY * 0.1, 0.05);
  camera.position.x = camX;
  camera.position.y = camY;
  camera.lookAt(0, -0.1, 0);

  rigs.forEach((rig, i) => {
    if (!rig) return;
    rig.weight = lerp(rig.weight, targetWeights[i], 1 - Math.pow(0.001, delta));
    const w = rig.weight;

    const restX = rig.side * REST_DIST;
    const activeX = rig.side * SIDE_DIST;
    rig.outer.position.x = lerp(restX, activeX, w);
    rig.outer.position.y = -0.15 + Math.sin(t * 0.5 + i) * 0.015 * (0.3 + w);

    const s = lerp(0.84, 1, w);
    rig.outer.scale.setScalar(s);

    rig.outer.rotation.y = rig.frontTurn + HERO_ANGLE + Math.sin(t * 0.3 + i * 1.7) * 0.045;

    rig.shadowMat.opacity = lerp(rig.shadowMat.opacity, w * 0.85, 1 - Math.pow(0.001, delta));
    rig.outer.visible = w > VISIBLE_THRESHOLD;
  });

  renderer.render(scene, camera);
}
animate();
