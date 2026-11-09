import * as THREE from 'three';
import { VoxelWorld, moveBody, targetCell, cellOverlapsBody, cellKey, MAX_CELLS } from './world.js';

const STORAGE_KEY = 'blokra.world.v1';
const PALETTE = [0xe76f51, 0xf4a261, 0xe9c46a, 0x2a9d8f, 0x264653, 0xf1faee];
const MOVE_SPEED = 5.5;
const JUMP_SPEED = 7.5;
const GRAVITY = 22;
const CAM_DIST = 5;
const EYE_HEIGHT = 1.4;
const REACH = 12;
const JOY_RADIUS = 60;
const SAVE_DELAY_MS = 300;
const MAX_FRAME_DT = 0.05;
const SEED = 42;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const state = {
  pos: { x: 0.5, y: 0, z: 6.5 },
  vel: { x: 0, y: 0, z: 0 },
  grounded: true,
  yaw: 0,
  pitch: 0.35,
  colorIndex: 0,
  jumpQueued: false,
};

const keys = new Set();
const joy = { id: -1, sx: 0, sy: 0, x: 0, y: 0 };
const look = { id: -1, lx: 0, ly: 0 };
let currentTarget = { hit: null, place: null };

const world = new VoxelWorld();
const cellMeshes = new Map();
const cellGeo = new THREE.BoxGeometry(1, 1, 1);
const cellMats = PALETTE.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad8ff);
scene.fog = new THREE.Fog(0x9ad8ff, 70, 180);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(30, 50, 20);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x6fbf5a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const cursor = new THREE.LineSegments(
  new THREE.EdgesGeometry(cellGeo),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
cursor.visible = false;
scene.add(cursor);

const playerRoot = new THREE.Group();
function addPart(geo, color, y) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
  mesh.position.y = y;
  playerRoot.add(mesh);
}
addPart(new THREE.BoxGeometry(0.5, 0.8, 0.5), 0x3d5a80, 0.4);
addPart(new THREE.BoxGeometry(0.6, 0.7, 0.35), 0xe85d75, 1.15);
addPart(new THREE.BoxGeometry(0.45, 0.45, 0.45), 0xffd2a1, 1.575);
scene.add(playerRoot);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateStarter() {
  const rand = mulberry32(SEED);
  for (let n = 0; n < 8; n++) {
    const x0 = Math.floor(rand() * 30) - 15;
    const z0 = Math.floor(rand() * 30) - 15;
    if (Math.abs(x0) < 3 && Math.abs(z0) < 3) continue;
    const h = 1 + Math.floor(rand() * 4);
    const w = 2 + Math.floor(rand() * 3);
    const c = Math.floor(rand() * PALETTE.length);
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < w; k++) {
        for (let j = 0; j < h; j++) {
          world.set(x0 + i, j, z0 + k, c);
        }
      }
    }
  }
}

function addCellMesh(i, j, k, c) {
  const key = cellKey(i, j, k);
  if (cellMeshes.has(key)) return;
  const mesh = new THREE.Mesh(cellGeo, cellMats[c]);
  mesh.position.set(i + 0.5, j + 0.5, k + 0.5);
  scene.add(mesh);
  cellMeshes.set(key, mesh);
}

function removeCellMesh(i, j, k) {
  const key = cellKey(i, j, k);
  const mesh = cellMeshes.get(key);
  if (mesh) {
    scene.remove(mesh);
    cellMeshes.delete(key);
  }
}

function rebuildMeshes() {
  for (const e of world.entries()) addCellMesh(e.i, e.j, e.k, e.c);
}

function loadWorld() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const loaded = VoxelWorld.fromJSON(JSON.parse(raw));
      for (const e of loaded.entries()) world.set(e.i, e.j, e.k, e.c);
    } else {
      generateStarter();
    }
  } catch (err) {
    console.warn('Gagal memuat dunia, memakai dunia awal:', err);
    world.clear();
    generateStarter();
  }
  rebuildMeshes();
}

let saveTimer = 0;
function saveWorld() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(world.toJSON()));
  } catch (err) {
    console.warn('Gagal menyimpan dunia:', err);
    showToast('Gagal menyimpan dunia');
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWorld, SAVE_DELAY_MS);
}

let toastTimer = 0;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

function placeBlock() {
  const t = currentTarget.place;
  if (!t) return;
  if (world.has(t.i, t.j, t.k)) return;
  if (world.size >= MAX_CELLS) {
    showToast('Batas blok tercapai');
    return;
  }
  if (cellOverlapsBody(t, state.pos)) {
    showToast('Tidak bisa pasang di posisi kamu');
    return;
  }
  world.set(t.i, t.j, t.k, state.colorIndex);
  addCellMesh(t.i, t.j, t.k, state.colorIndex);
  scheduleSave();
}

function deleteBlock() {
  const t = currentTarget.hit;
  if (!t) return;
  world.remove(t.i, t.j, t.k);
  removeCellMesh(t.i, t.j, t.k);
  scheduleSave();
}

function resetWorld() {
  if (!confirm('Hapus semua blok dan mulai ulang?')) return;
  for (const e of world.entries()) removeCellMesh(e.i, e.j, e.k);
  world.clear();
  generateStarter();
  rebuildMeshes();
  saveWorld();
  showToast('Dunia direset');
}

function updateSwatch() {
  const el = document.getElementById('btn-color');
  el.style.background = '#' + PALETTE[state.colorIndex].toString(16).padStart(6, '0');
}

function cycleColor() {
  state.colorIndex = (state.colorIndex + 1) % PALETTE.length;
  updateSwatch();
}

function readMoveInput() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  if (joy.id !== -1) {
    x += joy.x;
    y += -joy.y;
  }
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

function update(dt) {
  const input = readMoveInput();
  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);

  // Basis kamera di bidang datar. Depan = -Z saat yaw 0, kanan = +X.
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  state.vel.x = (rightX * input.x + fwdX * input.y) * MOVE_SPEED;
  state.vel.z = (rightZ * input.x + fwdZ * input.y) * MOVE_SPEED;

  if (state.jumpQueued && state.grounded) {
    state.vel.y = JUMP_SPEED;
  }
  state.jumpQueued = false;
  state.vel.y -= GRAVITY * dt;

  state.grounded = moveBody(world, state.pos, state.vel, dt);

  const horiz = Math.hypot(state.vel.x, state.vel.z);
  if (horiz > 0.1) {
    playerRoot.rotation.y = Math.atan2(state.vel.x, state.vel.z);
  }
  playerRoot.position.set(state.pos.x, state.pos.y, state.pos.z);

  const eyeX = state.pos.x;
  const eyeY = state.pos.y + EYE_HEIGHT;
  const eyeZ = state.pos.z;
  const cp = Math.cos(state.pitch);
  const sp = Math.sin(state.pitch);
  camera.position.set(
    eyeX + sinY * cp * CAM_DIST,
    eyeY + sp * CAM_DIST,
    eyeZ + cosY * cp * CAM_DIST
  );
  camera.lookAt(eyeX, eyeY, eyeZ);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  currentTarget = targetCell(
    world,
    camera.position,
    { x: dir.x, y: dir.y, z: dir.z },
    REACH
  );

  const p = currentTarget.place;
  if (p) {
    cursor.visible = true;
    cursor.position.set(p.i + 0.5, p.j + 0.5, p.k + 0.5);
  } else {
    cursor.visible = false;
  }
}

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) state.jumpQueued = true;
  }
  if (!e.repeat) {
    if (e.code === 'KeyE') placeBlock();
    if (e.code === 'KeyQ') deleteBlock();
    if (e.code === 'KeyR') cycleColor();
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

const canvasEl = renderer.domElement;
canvasEl.style.touchAction = 'none';

canvasEl.addEventListener('pointerdown', (e) => {
  canvasEl.setPointerCapture(e.pointerId);
  const onLeft = e.clientX < window.innerWidth * 0.45;
  if (e.pointerType === 'touch' && onLeft && joy.id === -1) {
    joy.id = e.pointerId;
    joy.sx = e.clientX;
    joy.sy = e.clientY;
    joy.x = 0;
    joy.y = 0;
  } else if (look.id === -1) {
    look.id = e.pointerId;
    look.lx = e.clientX;
    look.ly = e.clientY;
  }
});

canvasEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    joy.x = clamp((e.clientX - joy.sx) / JOY_RADIUS, -1, 1);
    joy.y = clamp((e.clientY - joy.sy) / JOY_RADIUS, -1, 1);
  } else if (e.pointerId === look.id) {
    const dx = e.clientX - look.lx;
    const dy = e.clientY - look.ly;
    look.lx = e.clientX;
    look.ly = e.clientY;
    state.yaw -= dx * 0.006;
    state.pitch = clamp(state.pitch - dy * 0.004, 0.1, 1.25);
  }
});

function endPointer(e) {
  if (e.pointerId === joy.id) {
    joy.id = -1;
    joy.x = 0;
    joy.y = 0;
  }
  if (e.pointerId === look.id) look.id = -1;
}
canvasEl.addEventListener('pointerup', endPointer);
canvasEl.addEventListener('pointercancel', endPointer);

function bindButton(id, handler) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  });
}
bindButton('btn-place', placeBlock);
bindButton('btn-delete', deleteBlock);
bindButton('btn-color', cycleColor);
bindButton('btn-jump', () => { state.jumpQueued = true; });
bindButton('btn-reset', resetWorld);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadWorld();
updateSwatch();

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(MAX_FRAME_DT, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
