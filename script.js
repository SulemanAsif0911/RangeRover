import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
   CONFIG — one entry per model, in chronological order.
   side : -1 = stage left, 1 = stage right (must mirror the
          text-left / text-right classes set in index.html)
   ============================================================ */
const MODELS = [
  { file: 'assets/models/2006-supercharged.glb', side: -1, facing:  0.35 },
  { file: 'assets/models/2011-evoque.glb',        side:  1, facing: -0.35 },
  { file: 'assets/models/velar.glb',              side: -1, facing:  0.35 },
  { file: 'assets/models/sv-coupe.glb',           side:  1, facing: -0.35 },
];

const TARGET_SIZE = 2.7;      // normalized world-space size of the largest dimension
const SIDE_OFFSET = 2.35;     // how far off-centre a resting model sits
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
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.35, 8.2);
camera.lookAt(0, -0.1, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------------- Lighting ---------------- */

scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const key = new THREE.DirectionalLight(0xfff3e0, 1.6);
key.position.set(4, 5, 6);
scene.add(key);

const rim = new THREE.DirectionalLight(0xaecbff, 1.4);
rim.position.set(-5, 3, -5);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-3, 2, 4);
scene.add(fill);

/* ---------------- Contact-shadow texture (procedural, no asset needed) ---------------- */

function makeShadowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const shadowTex = makeShadowTexture();
const shadowGeo = new THREE.PlaneGeometry(3.4, 3.4);

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

/* Each entry: { wrapper, materials:[], weight, opacity, x, rotY, scale } */
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
      obj.material.transparent = true;
      obj.material.depthWrite = true;
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
        materials.forEach((m) => (m.opacity = 0));

        const outer = new THREE.Group();
        outer.add(wrapper);
        outer.rotation.y = cfg.facing;
        outer.position.x = cfg.side * SIDE_OFFSET * 1.4;

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
          facing: cfg.facing,
          weight: 0,
          opacity: 0,
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
   Each model section's proximity to the viewport centre
   produces a 0..1 weight. Sections overlap in weight as you
   scroll, which is what gives the crossfade its "replaced by
   the next one" continuity instead of a hard cut.
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

  // camera parallax
  camX = lerp(camX, mouseX * 0.35, 0.05);
  camY = lerp(camY, 0.35 - mouseY * 0.12, 0.05);
  camera.position.x = camX;
  camera.position.y = camY;
  camera.lookAt(0, -0.1, 0);

  rigs.forEach((rig, i) => {
    if (!rig) return;
    rig.weight = lerp(rig.weight, targetWeights[i], 1 - Math.pow(0.001, delta));
    const w = rig.weight;

    // position: rest further out-of-frame, settle slightly inward when active
    const restX = rig.side * SIDE_OFFSET * 1.55;
    const activeX = rig.side * SIDE_OFFSET * 0.92;
    rig.outer.position.x = lerp(restX, activeX, w);
    rig.outer.position.y = -0.15 + Math.sin(t * 0.6 + i) * 0.02 * (0.3 + w);

    // scale: small when idle, full presence when active
    const s = lerp(0.72, 1, w);
    rig.outer.scale.setScalar(s);

    // rotation: gentle continuous turntable, amplified while active
    rig.outer.rotation.y = rig.facing + Math.sin(t * 0.18 + i * 1.7) * 0.12 + (prefersReducedMotion ? 0 : t * 0.05 * (0.15 + w * 0.5));

    // opacity crossfade
    rig.opacity = lerp(rig.opacity, w, 1 - Math.pow(0.001, delta));
    rig.materials.forEach((m) => (m.opacity = rig.opacity));
    rig.shadowMat.opacity = rig.opacity * 0.8;

    rig.outer.visible = rig.opacity > 0.004;
  });

  renderer.render(scene, camera);
}
animate();
