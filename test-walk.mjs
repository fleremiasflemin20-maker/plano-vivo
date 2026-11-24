// Walkthrough movement: doors can be walked through, walls cannot.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { blocked, move, roomSpot } from './dist/walk.mjs';
import { findRooms } from './dist/geometry.mjs';

const seg = (x1, y1, x2, y2, type = 'wall', thickness) => ({
  a: { x: x1, y: y1 },
  b: { x: x2, y: y2 },
  type,
  thickness,
});

/**
 * 8 × 6 m box split by a thick (0.3 m) wall at x = 0 with a 0.8 m door in the middle,
 * i.e. the door spans z = −0.4…0.4 m. The walker is a point 0.12 m wide either side.
 */
function twoRooms() {
  const W = 8,
    D = 6,
    z = (m) => m / D + 0.5,
    walls = [
      seg(0, 0, 1, 0),
      seg(1, 0, 1, 1),
      seg(1, 1, 0, 1),
      seg(0, 1, 0, 0),
      seg(0.5, 0, 0.5, z(-0.4), 'wall', 0.3),
      seg(0.5, z(-0.4), 0.5, z(0.4), 'door', 0.3),
      seg(0.5, z(0.4), 0.5, 1, 'wall', 0.3),
    ];
  return { W, D, T: 0.15, walls, rooms: findRooms(walls, W, D, 0.15) };
}

/** Walk 0.04 m steps in direction (dx, dz) for `metres`; return the final position. */
function walkFrom(model, x, z, dx, dz, metres = 4, ghost = false) {
  const p = { x, z },
    n = Math.hypot(dx, dz);
  for (let i = 0; i < metres / 0.04; i++) move(model, p, (dx / n) * 0.04, (dz / n) * 0.04, ghost);
  return p;
}

export function runWalkTests() {
  const m = twoRooms();
  // The doorway is free across most of its width; the wall beside it is not.
  assert.ok(!blocked(m, 0, 0), 'door centre blocked');
  assert.ok(!blocked(m, 0, 0.25), 'door blocked 0.15 m from its jamb');
  assert.ok(blocked(m, 0, 0.6), 'wall beside the door not blocked');

  // Straight at the door, but aimed 0.35 m off its centre (beside the jamb): the walk
  // slides into the doorway and comes out in the other room.
  for (const off of [0, 0.3, -0.35]) {
    const p = walkFrom(m, -2, off, 1, 0);
    assert.ok(p.x > 1, `door not crossed when aimed ${off} m off centre (x = ${p.x.toFixed(2)})`);
  }
  // At an angle (about 30°) from further away.
  const p = walkFrom(m, -2.5, 1.2, 1, -0.55, 5);
  assert.ok(p.x > 0.5, `door not crossed at an angle (x = ${p.x.toFixed(2)})`);

  // Far from the door, the wall stops the walker; walking through walls lets it pass.
  const stopped = walkFrom(m, -2, 2, 1, 0);
  assert.ok(stopped.x < 0, 'walked through a solid wall');
  const ghost = walkFrom(m, -2, 2, 1, 0, 4, true);
  assert.ok(ghost.x > 1, 'walking through walls did not pass');
  // Turning collisions back on inside a wall still lets the walker get out.
  const out = { x: 0, z: 2 };
  for (let i = 0; i < 20; i++) move(m, out, 0.04, 0);
  assert.ok(!blocked(m, out.x, out.z), 'stuck inside a wall');

  // Every room has a free spot to jump to.
  assert.equal(m.rooms.length, 2);
  for (const room of m.rooms) {
    const s = roomSpot(m, room);
    assert.ok(s && !blocked(m, (s.x - 0.5) * m.W, (s.y - 0.5) * m.D), 'no free spot in a room');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWalkTests();
  console.log('Walk checks passed.');
}
