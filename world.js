export const PLAYER = Object.freeze({ width: 0.6, height: 1.8 });
export const STEP = 0.05;
export const MAX_CELLS = 20000;

export function cellKey(i, j, k) {
  return `${i},${j},${k}`;
}

export class VoxelWorld {
  constructor() {
    this.cells = new Map();
  }

  get size() {
    return this.cells.size;
  }

  has(i, j, k) {
    return this.cells.has(cellKey(i, j, k));
  }

  set(i, j, k, color) {
    this.cells.set(cellKey(i, j, k), color);
  }

  remove(i, j, k) {
    return this.cells.delete(cellKey(i, j, k));
  }

  clear() {
    this.cells.clear();
  }

  entries() {
    const out = [];
    for (const [key, c] of this.cells) {
      const [i, j, k] = key.split(',').map(Number);
      out.push({ i, j, k, c });
    }
    return out;
  }

  collidesBox(minX, minY, minZ, maxX, maxY, maxZ) {
    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX - 1e-6);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY - 1e-6);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ - 1e-6);
    for (let i = x0; i <= x1; i++) {
      for (let j = y0; j <= y1; j++) {
        for (let k = z0; k <= z1; k++) {
          if (this.has(i, j, k)) return true;
        }
      }
    }
    return false;
  }

  toJSON() {
    return { version: 1, cells: this.entries().map((e) => [e.i, e.j, e.k, e.c]) };
  }

  static fromJSON(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.cells)) {
      throw new Error('Format dunia tidak valid');
    }
    if (data.cells.length > MAX_CELLS) {
      throw new Error('Jumlah blok terlalu banyak');
    }
    const world = new VoxelWorld();
    for (const entry of data.cells) {
      if (!Array.isArray(entry) || entry.length !== 4) {
        throw new Error('Entri blok tidak valid');
      }
      const [i, j, k, c] = entry;
      if (![i, j, k, c].every(Number.isInteger)) {
        throw new Error('Koordinat blok tidak valid');
      }
      if (j < 0 || c < 0 || c > 255) {
        throw new Error('Nilai blok di luar batas');
      }
      world.set(i, j, k, c);
    }
    return world;
  }
}

function blockedAt(world, pos) {
  const hw = PLAYER.width / 2;
  return world.collidesBox(
    pos.x - hw, pos.y, pos.z - hw,
    pos.x + hw, pos.y + PLAYER.height, pos.z + hw
  );
}

function moveAxis(world, pos, axis, amount) {
  const steps = Math.ceil(Math.abs(amount) / STEP);
  if (steps === 0) return false;
  const d = amount / steps;
  for (let s = 0; s < steps; s++) {
    pos[axis] += d;
    if (blockedAt(world, pos)) {
      pos[axis] -= d;
      return true;
    }
  }
  return false;
}

// Menggerakkan badan pemain dengan collision per sumbu. Mengembalikan true jika di tanah.
export function moveBody(world, pos, vel, dt) {
  if (moveAxis(world, pos, 'x', vel.x * dt)) vel.x = 0;
  if (moveAxis(world, pos, 'z', vel.z * dt)) vel.z = 0;

  let grounded = false;
  if (moveAxis(world, pos, 'y', vel.y * dt)) {
    if (vel.y < 0) grounded = true;
    vel.y = 0;
  }
  if (pos.y <= 0) {
    pos.y = 0;
    if (vel.y < 0) vel.y = 0;
    grounded = true;
  }
  return grounded;
}

// Menelusuri sinar dari origin. Mengembalikan sel yang kena (hit) dan sel kosong tepat sebelumnya (place).
export function targetCell(world, origin, dir, maxDist) {
  let last = null;
  for (let t = 0; t <= maxDist; t += STEP) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    if (y < 0) {
      return { hit: null, place: last };
    }
    const i = Math.floor(x);
    const j = Math.floor(y);
    const k = Math.floor(z);
    if (world.has(i, j, k)) {
      return { hit: { i, j, k }, place: last };
    }
    last = { i, j, k };
  }
  return { hit: null, place: null };
}

export function cellOverlapsBody(cell, pos) {
  const hw = PLAYER.width / 2;
  return (
    cell.i + 1 > pos.x - hw && cell.i < pos.x + hw &&
    cell.j + 1 > pos.y && cell.j < pos.y + PLAYER.height &&
    cell.k + 1 > pos.z - hw && cell.k < pos.z + hw
  );
}
