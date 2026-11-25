import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { findRooms, quantities, validateProject, nearest, toDXF } from './dist/geometry.mjs';
import { detectPlan, detectLargePlan } from './dist/detect.mjs';
import { runRecognitionTests } from './test-recognize.mjs';
import { runWorkerTests } from './test-worker.mjs';
import { runWalkTests } from './test-walk.mjs';
import { runProTests } from './test-pro.mjs';
import { runAnalyticsTests } from './test-analytics.mjs';
const wall = (x1, y1, x2, y2, type = 'wall') => ({
  a: { x: x1, y: y1 },
  b: { x: x2, y: y2 },
  type,
});
const rectangle = [
  wall(0.1, 0.1, 0.9, 0.1),
  wall(0.9, 0.1, 0.9, 0.9),
  wall(0.9, 0.9, 0.1, 0.9),
  wall(0.1, 0.9, 0.1, 0.1),
];
let rooms = findRooms(rectangle, 10, 10, 0.2);
assert.equal(rooms.length, 1);
assert.ok(Math.abs(rooms[0].area - 7.8 ** 2) < 1, rooms[0].area);
const divided = [
  ...rectangle,
  wall(0.5, 0.1, 0.5, 0.45),
  wall(0.5, 0.45, 0.5, 0.55, 'door'),
  wall(0.5, 0.55, 0.5, 0.9),
];
assert.equal(findRooms(divided, 10, 10, 0.2).length, 2);
const q = quantities([wall(0, 0, 0.5, 0), wall(0.5, 0, 0.6, 0, 'door')], 10, 10, 3, 0.2);
assert.ok(Math.abs(q.net - 15.9) < 1e-8);
assert.ok(Math.abs(q.volume - 3.18) < 1e-8);
assert.equal(q.doors, 1);
assert.equal(nearest({ x: 1, y: 0 }, wall(0, 0, 1, 1), 10, 10).t, 0.5);
assert.match(toDXF(rectangle, 10, 10), /\$INSUNITS\n70\n6/);
assert.doesNotThrow(() =>
  validateProject({
    version: 1,
    walls: rectangle,
    width: 10,
    ratio: 1,
    height: 3,
    thickness: 0.2,
    material: '#ffffff',
  }),
);
assert.throws(() =>
  validateProject({
    version: 2,
    walls: [wall(0, 0, 2, 0)],
    width: 10,
    ratio: 1,
    height: 3,
    thickness: 0.2,
    material: '#ffffff',
  }),
);
{
  const base = {
      version: 1,
      walls: rectangle,
      width: 10,
      ratio: 1,
      height: 3,
      thickness: 0.2,
      material: '#ffffff',
    },
    features = [
      { type: 'furniture', kind: 'bed', x: 0.1, y: 0.1, w: 0.2, h: 0.2, back: 'n' },
      { type: 'label', text: 'COCINA', x: 0.5, y: 0.5, w: 0.1, h: 0.03 },
      { type: 'label', x: 0.6, y: 0.6, w: 0.1, h: 0.03 },
    ];
  assert.doesNotThrow(() => validateProject({ ...base, features }));
  assert.throws(() => validateProject({ ...base, features: [{ ...features[0], kind: 'trono' }] }));
  const dxf = toDXF(rectangle, 10, 10, features);
  assert.equal((dxf.match(/\nMUEBLES\n/g) || []).length, 4);
  assert.match(dxf, /TEXT\n8\nTEXTOS[\s\S]*\n1\nCOCINA/);
  assert.equal((dxf.match(/TEXTOS/g) || []).length, 1, 'unread labels are not written');
}
const width = 600,
  height = 450,
  data = new Uint8ClampedArray(width * height * 4).fill(255);
function line(x1, y1, x2, y2, r = 4) {
  for (
    let y = Math.max(0, Math.floor(Math.min(y1, y2) - r));
    y < Math.min(height, Math.ceil(Math.max(y1, y2) + r));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(Math.min(x1, x2) - r));
      x < Math.min(width, Math.ceil(Math.max(x1, x2) + r));
      x++
    ) {
      const n = nearest({ x, y }, { a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
      if (n.d <= r) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 40;
      }
    }
}
line(60, 50, 540, 50);
line(540, 50, 540, 400);
line(540, 400, 60, 400);
line(60, 400, 60, 50);
line(300, 50, 300, 200);
line(300, 245, 300, 400);
const detected = detectPlan(data, width, height, 12);
console.log(
  'Detection fixture:',
  detected.stats,
  detected.walls.map((w) => [w.type, w.a, w.b]),
);
assert.ok(detected.walls.length >= 6 && detected.walls.length < 25, 'Unexpected wall count');
assert.ok(
  detected.walls.some((w) => w.type === 'door'),
  'Missing opening',
);
for (const target of [
  wall(0.1, 50 / 450, 0.9, 50 / 450),
  wall(0.9, 50 / 450, 0.9, 400 / 450),
  wall(0.1, 400 / 450, 0.9, 400 / 450),
])
  assert.ok(
    detected.walls.some(
      (w) =>
        nearest({ x: (target.a.x + target.b.x) / 2, y: (target.a.y + target.b.y) / 2 }, w, 600, 450)
          .d < 10,
    ),
    'Missing rectangle side',
  );
assert.equal(
  detectPlan(new Uint8ClampedArray(width * height * 4).fill(255), width, height, 12).walls.length,
  0,
);
const largeWidth = 1800,
  largeHeight = 1350,
  large = new Uint8ClampedArray(largeWidth * largeHeight * 4);
for (let y = 0; y < largeHeight; y++)
  for (let x = 0; x < largeWidth; x++) {
    const s = (Math.floor(y / 3) * width + Math.floor(x / 3)) * 4;
    large.set(data.subarray(s, s + 4), (y * largeWidth + x) * 4);
  }
const largeResult = detectLargePlan(large, largeWidth, largeHeight, 12);
assert.ok(largeResult.stats.tiles > 1);
assert.equal(largeResult.stats.segments, 6, 'Tile seams duplicated walls');
for (const p of [
  { x: 0.1, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.5, y: 50 / 450 },
  { x: 0.5, y: 400 / 450 },
  { x: 0.5, y: 0.3 },
  { x: 0.5, y: 0.8 },
])
  assert.ok(
    largeResult.walls.some(
      (w) => w.type === 'wall' && nearest(p, w, largeWidth, largeHeight).d < 16,
    ),
    'Large plan lost a wall',
  );
assert.ok(
  largeResult.walls.some((w) => w.type === 'door'),
  'Large plan lost doorway',
);
assert.ok(
  !largeResult.walls.some(
    (w) =>
      w.type === 'wall' && nearest({ x: 0.5, y: 222 / 450 }, w, largeWidth, largeHeight).d < 20,
  ),
  'Tile merge closed a doorway',
);
console.log('Large sheet:', largeResult.stats);

// Thick strokes: a 600 × 450 pt PDF with 10 pt walls rendered at 4× (40 px strokes,
// as PDF.js does in the browser) and at 6.8× (68 px, where tiles cut through strokes).
// Each stroke used to be detected as several parallel and shallow diagonal walls.
for (const scale of [4, 6.8]) {
  const w = Math.round(600 * scale),
    h = Math.round(450 * scale),
    half = 5 * scale,
    ink = new Uint8ClampedArray(w * h * 4).fill(255),
    strokes = [
      [60, 50, 540, 50],
      [540, 50, 540, 400],
      [540, 400, 60, 400],
      [60, 400, 60, 50],
      [300, 50, 300, 200],
      [300, 245, 300, 400],
    ];
  for (const [x1, y1, x2, y2] of strokes)
    for (
      let y = Math.max(0, Math.floor(Math.min(y1, y2) * scale - half));
      y < Math.min(h, Math.ceil(Math.max(y1, y2) * scale + half));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(x1, x2) * scale - half));
        x < Math.min(w, Math.ceil(Math.max(x1, x2) * scale + half));
        x++
      ) {
        const i = (y * w + x) * 4;
        ink[i] = ink[i + 1] = ink[i + 2] = 0;
      }
  const thick = detectLargePlan(ink, w, h, 12);
  assert.equal(thick.stats.segments, 6, `Thick ${scale}× strokes produced extra walls`);
  assert.equal(thick.stats.openings, 1, `Thick ${scale}× strokes lost or duplicated the door`);
  for (const [x1, y1, x2, y2] of strokes) {
    const mid = { x: (((x1 + x2) / 2) * scale) / w, y: (((y1 + y2) / 2) * scale) / h };
    assert.ok(
      thick.walls.some((wall) => wall.type === 'wall' && nearest(mid, wall, w, h).d < 3),
      `Thick ${scale}× wall not centred on its stroke`,
    );
  }
  console.log(`Thick strokes ${scale}×:`, thick.stats);
}
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(b) {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, buf) {
  const t = Buffer.from(type),
    out = Buffer.alloc(buf.length + 12);
  out.writeUInt32BE(buf.length);
  t.copy(out, 4);
  buf.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([t, buf])), out.length - 4);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const scan = Buffer.alloc(height * (width * 4 + 1));
for (let y = 0; y < height; y++)
  Buffer.from(data.buffer, y * width * 4, width * 4).copy(scan, y * (width * 4 + 1) + 1);
mkdirSync('fixtures', { recursive: true });
writeFileSync(
  'fixtures/plano-prueba.png',
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scan)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
runRecognitionTests();
runWalkTests();
runProTests();
await runWorkerTests();
await runAnalyticsTests();
console.log(
  'Geometry, quantities, legacy import, DXF, blank image, reconstruction, plan recognition, walkthrough, professional tools, suggestions and usage statistics checks passed.',
);
