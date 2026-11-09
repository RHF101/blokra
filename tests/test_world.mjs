import assert from 'node:assert/strict';
import { VoxelWorld, moveBody, targetCell, cellOverlapsBody, PLAYER } from '../world.js';

// 1. Berhenti di dinding dari samping
{
  const w = new VoxelWorld();
  w.set(0, 0, 0, 0);
  const pos = { x: -1, y: 0, z: 0.5 };
  const vel = { x: 5, y: 0, z: 0 };
  moveBody(w, pos, vel, 0.5);
  const hw = PLAYER.width / 2;
  assert.ok(pos.x + hw <= 1e-9, 'pemain tidak boleh masuk dinding');
  assert.ok(pos.x + hw > -0.06, 'pemain harus menempel dinding');
  assert.equal(vel.x, 0);
}

// 2. Mendarat di atas blok (top blok di y=2)
{
  const w = new VoxelWorld();
  w.set(0, 1, 0, 0);
  const pos = { x: 0.5, y: 3, z: 0.5 };
  const vel = { x: 0, y: 0, z: 0 };
  let grounded = false;
  for (let f = 0; f < 300 && !grounded; f++) {
    vel.y -= 22 / 60;
    grounded = moveBody(w, pos, vel, 1 / 60);
  }
  assert.ok(grounded, 'harus mendarat');
  assert.ok(Math.abs(pos.y - 2) <= 0.05 + 1e-9, `posisi y ${pos.y}`);
}

// 3. Jatuh ke lantai y=0
{
  const w = new VoxelWorld();
  const pos = { x: 0, y: 5, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  let g = false;
  for (let f = 0; f < 600 && !g; f++) {
    vel.y -= 22 / 60;
    g = moveBody(w, pos, vel, 1 / 60);
  }
  assert.ok(g, 'harus mendarat di lantai');
  assert.equal(pos.y, 0);
}

// 4. Raycast: hit dan sel kosong sebelumnya
{
  const w = new VoxelWorld();
  w.set(2, 0, 0, 0);
  const r = targetCell(w, { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 10);
  assert.deepEqual(r.hit, { i: 2, j: 0, k: 0 });
  assert.deepEqual(r.place, { i: 1, j: 0, k: 0 });
}

// 5. Overlap dengan badan pemain
{
  const pos = { x: 0.5, y: 0, z: 0.5 };
  assert.equal(cellOverlapsBody({ i: 0, j: 0, k: 0 }, pos), true);
  assert.equal(cellOverlapsBody({ i: 5, j: 0, k: 5 }, pos), false);
}

// 6. Serialisasi dan validasi data
{
  const w = new VoxelWorld();
  w.set(1, 2, 3, 4);
  const r = VoxelWorld.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
  assert.deepEqual(r.entries(), [{ i: 1, j: 2, k: 3, c: 4 }]);
  assert.throws(() => VoxelWorld.fromJSON({ version: 2, cells: [] }));
  assert.throws(() => VoxelWorld.fromJSON({ version: 1, cells: [[0, -1, 0, 0]] }));
}

console.log('ALL TESTS PASSED');
