import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
   CONFIG — one entry per model, in chapter order.

   side       : 1 = the car enters from / docks on the right,
                -1 = from the left. Alternates chapter to chapter,
                and the matching text-left/text-right class on each
                <section> in index.html is always the OPPOSITE side.
   frontTurn  : the base Y rotation (radians) that points this
                model's FRONT toward the camera, derived by parsing
                each GLB's actual node/material names and geometry
                (named wheel nodes, grille/bumper/boot meshes) rather
                than by eye — see README for the per-file evidence.
                "midnight" has no named parts at all, so it's a
                best-effort match to "classic" — add Math.PI to it
                if it's ever showing its rear.
   ============================================================ */
const MODELS = [
  { file: 'assets/models/range-rover-classic.glb',       side:  1, frontTurn: 0 },              // 01 — Classic, 1970
  { file: 'assets/models/2006-supercharged.glb',         side: -1, frontTurn: Math.PI },        // 02 — Supercharged, 2006
  { file: 'assets/models/2011-evoque.glb',                side:  1, frontTurn: 0 },              // 03 — Evoque, 2011
  { file: 'assets/models/range-rover-midnight-blue.glb', side: -1, frontTurn: 0 },               // 04 — Midnight
  { file: 'assets/models/range-rover-sport-2018.glb',    side:  1, frontTurn: -Math.PI / 2 },    // 05 — Sport, 2018
  { file: 'assets/models/velar.glb',                      side: -1, frontTurn: Math.PI },        // 06 — Velar, 2017
];

const TURN_TOWARD_TEXT = 0.5; // how far each car turns off dead-on-front — always rotating toward its own chapter's text panel
const TARGET_SIZE = 3.1;   // normalized world-space size of the largest dimension — natural, photo-like proportion
const SIDE_DIST   = 1.55;  // how far toward its side the active car sits
const REST_DIST   = 5.4;   // fully off-screen resting distance (multiplied by each model's own `side`)
const VISIBLE_THRESHOLD = 0.02; // below this weight a car is fully hidden — never more than ~2 rendered at once

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = THREE.MathUtils.lerp;
const smoothstep = (x) => x * x * (3 - 2 * x);
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Renderer / scene / camera ---------------- */

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.32, 9);
camera.lookAt(0, -0.1, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = 0.85;

/* ---------------- Lighting — neutral chrome studio, no borrowed colour ---------------- */

scene.add(new THREE.AmbientLight(0xffffff, 0.28));

const key = new THREE.SpotLight(0xf3f5ff, 2.3, 40, Math.PI / 3.6, 0.85, 1.4);
key.position.set(2.5, 6, 5.5);
key.target.position.set(0, -0.6, 0);
scene.add(key, key.target);

const fill = new THREE.DirectionalLight(0xe7eaee, 0.62);
fill.position.set(-4, 1.8, 3.5);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xd7dade, 0.6);
rim.position.set(-3.5, 2.2, -5);
scene.add(rim);

const groundBounce = new THREE.DirectionalLight(0xaeb2b8, 0.2);
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
const shadowGeo = new THREE.PlaneGeometry(5.3, 5.3);

/* ---------------- Loading ---------------- */
/* Only the FIRST model blocks the preloader. The rest load quietly
   in the background right after, so there's no multi-second stall
   before the page is usable. */

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');
const statusEl = document.getElementById('loader-status');
document.body.classList.add('is-loading');

function reportProgress(done, frac) {
  const pct = Math.round((done ? 1 : frac) * 100);
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
      // NOTE: transparent/opacity are intentionally left exactly as
      // authored — forcing every material opaque previously broke
      // glass (windows rendered as solid colour blocks). Cars never
      // fade in this design anyway (only slide), so there's no need
      // to touch either property.
      if ('envMapIntensity' in obj.material) obj.material.envMapIntensity = 1.2;
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
        outer.position.x = cfg.side * REST_DIST;

        const shadow = new THREE.Mesh(
          shadowGeo,
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -1.06;
        outer.add(shadow);

        scene.add(outer);

        // side 1 = car docks right, text left → turn left toward it.
        // side -1 = car docks left, text right → turn right toward it.
        const baseRotation = cfg.frontTurn - cfg.side * TURN_TOWARD_TEXT;

        rigs[i] = {
          outer,
          materials,
          shadowMat: shadow.material,
          side: cfg.side,
          baseRotation,
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

    rig.outer.rotation.y = rig.baseRotation + Math.sin(t * 0.3 + i * 1.7) * 0.04;

    rig.shadowMat.opacity = lerp(rig.shadowMat.opacity, w * 0.85, 1 - Math.pow(0.001, delta));
    rig.outer.visible = w > VISIBLE_THRESHOLD;
  });

  renderer.render(scene, camera);
}
animate();
