// Professional tools: typed lengths, grid and columns, take-off, review and geometry fixes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { findRooms, length, toDXF } from './dist/geometry.mjs';
import {
  parseLength,
  pointAt,
  parseSpans,
  axisPositions,
  axisName,
  columnsAtGrid,
  takeoff,
  review,
  closeJoints,
  straighten,
  roomName,
  areaTable,
  validatePro,
} from './dist/pro.mjs';

const seg = (x1, y1, x2, y2, type = 'wall', extra = {}) => ({
  id: Math.random().toString(36).slice(2),
  a: { x: x1, y: y1 },
  b: { x: x2, y: y2 },
  type,
  ...extra,
});

/** 10 × 10 m sheet: a 6 × 4 m box (x 0.2–0.8, y 0.3–0.7) split in two, one door, one window. */
function house() {
  const W = 10,
    D = 10;
  const walls = [
    seg(0.2, 0.3, 0.8, 0.3),
    seg(0.8, 0.3, 0.8, 0.7),
    seg(0.8, 0.7, 0.2, 0.7),
    seg(0.2, 0.7, 0.2, 0.3),
    seg(0.5, 0.3, 0.5, 0.45),
    seg(0.5, 0.45, 0.5, 0.54, 'door'),
    seg(0.5, 0.54, 0.5, 0.7),
  ];
  // window in the top wall of the left room
  walls.splice(
    0,
    1,
    seg(0.2, 0.3, 0.3, 0.3),
    seg(0.3, 0.3, 0.42, 0.3, 'window'),
    seg(0.42, 0.3, 0.8, 0.3),
  );
  return { W, D, H: 2.8, T: 0.15, walls, rooms: findRooms(walls, W, D, 0.15) };
}

export function runProTests() {
  // Typed lengths
  assert.deepEqual(parseLength('4.25'), { length: 4.25, angle: null });
  assert.deepEqual(parseLength('4,25'), { length: 4.25, angle: null });
  assert.deepEqual(parseLength('425cm'), { length: 4.25, angle: null });
  assert.deepEqual(parseLength('3m<90'), { length: 3, angle: 90 });
  assert.deepEqual(parseLength('2.5@-45'), { length: 2.5, angle: -45 });
  for (const bad of ['', 'abc', '0', '-2', '400', '3<']) assert.equal(parseLength(bad), null, bad);
  const p = pointAt({ x: 0.5, y: 0.5 }, { length: 2, angle: 90 }, null, 10, 8);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - (0.5 - 2 / 8)) < 1e-9, 'angle 90 goes up');
  const q = pointAt({ x: 0.1, y: 0.1 }, { length: 3, angle: null }, { x: 0.9, y: 0.1 }, 10, 8);
  assert.ok(
    Math.abs(length({ a: { x: 0.1, y: 0.1 }, b: q }, 10, 8) - 3) < 1e-9,
    'length along the pointer',
  );

  // Grid and columns
  assert.deepEqual(parseSpans('4, 3.5 4'), [4, 3.5, 4]);
  assert.deepEqual(parseSpans(''), []);
  assert.equal(parseSpans('4, x'), null);
  assert.deepEqual(axisPositions(1, [4, 3.5]), [1, 5, 8.5]);
  assert.deepEqual(
    [0, 1, 25, 26, 27].map((i) => axisName('y', i)),
    ['A', 'B', 'Z', 'AA', 'AB'],
  );
  assert.equal(axisName('x', 2), '3');
  const cols = columnsAtGrid({ xs: [2, 5, 8], ys: [3, 7, 9.9] }, 0.3, 0.3, 10, 10);
  assert.equal(cols.length, 6, 'columns outside the sheet are skipped');

  // Take-off
  const h = house();
  assert.equal(h.rooms.length, 2);
  const rows = takeoff({ ...h, columns: cols, slab: { thickness: 0.2, show: true } });
  const get = (item) => rows.find((r) => r.item.startsWith(item)).qty;
  const net = get('Área neta');
  const L = h.walls.reduce((n, w) => n + length(w, 10, 10), 0);
  const holes = 0.9 * 2.1 + 1.2 * 1.2;
  assert.ok(Math.abs(get('Longitud de muros') - L) < 1e-9);
  assert.ok(Math.abs(net - (L * 2.8 - holes)) < 1e-6, 'net masonry area');
  assert.equal(get('Bloques'), Math.ceil(net * 12.5));
  assert.equal(get('Puertas'), 1);
  assert.equal(get('Ventanas'), 1);
  assert.ok(Math.abs(get('Hormigón en columnas') - 6 * 0.09 * 2.8) < 1e-9);
  assert.ok(get('Hormigón en losa') > 0);
  assert.ok(Math.abs(get('Piso interior') - h.rooms.reduce((n, r) => n + r.area, 0)) < 1e-9);

  // Room names and area table
  const tags = [
    { x: 0.35, y: 0.5, name: 'Dormitorio' },
    { x: 0.65, y: 0.5, name: 'Sala' },
  ];
  const names = h.rooms.map((r) => roomName(r, tags)).sort();
  assert.deepEqual(names, ['Dormitorio', 'Sala']);
  assert.equal(areaTable(h.rooms, tags).length, 2);

  // Review: the right room ("Sala") has no window -> warning; the left one has door and window.
  let f = review({ ...h, tags });
  const texts = f.map((x) => x.text).join('\n');
  assert.ok(/Sala\): sin ventana/.test(texts), 'room without window');
  assert.ok(!/Dormitorio\): sin ventana/.test(texts), 'room with window is fine');
  assert.ok(!/no tiene puerta/.test(texts), 'both rooms have the door');
  assert.ok(!/Unión abierta/.test(texts), 'closed drawing has no open joints');
  // A narrow door and a stair outside Blondel's rule are flagged.
  const narrow = {
    ...h,
    walls: h.walls.map((w) => (w.type === 'door' ? { ...w, b: { x: 0.5, y: 0.51 } } : w)),
  };
  assert.ok(review(narrow).some((x) => x.topic === 'Puertas'));
  const stair = { type: 'stair', x: 0.6, y: 0.35, w: 0.1, h: 0.1, steps: 5, axis: 'x' };
  assert.ok(
    review({ ...h, features: [stair] }).some((x) => x.topic === 'Escaleras'),
    'steep stair flagged',
  );
  const good = { type: 'stair', x: 0.3, y: 0.35, w: 0.42, h: 0.1, steps: 15, axis: 'x' }; // huella 28 cm, contrahuella 17,5 cm
  assert.ok(
    !review({ ...h, features: [good] }).some((x) => x.topic === 'Escaleras'),
    'good stair passes',
  );

  // Geometry fixes: open a 6 cm gap and tilt a wall 1°, then repair.
  const broken = structuredClone(h.walls);
  broken[3].a = { x: 0.806, y: 0.3 }; // right wall starts 6 cm off the corner
  f = review({ ...h, walls: broken, rooms: findRooms(broken, 10, 10, 0.15) });
  assert.ok(
    f.some((x) => x.topic === 'Uniones'),
    'open joint found',
  );
  const fixedJ = closeJoints(broken, 10, 10);
  assert.ok(fixedJ.fixed >= 1);
  assert.ok(
    !review({ ...h, walls: fixedJ.walls, rooms: findRooms(fixedJ.walls, 10, 10, 0.15) }).some(
      (x) => x.topic === 'Uniones',
    ),
    'joint closed',
  );
  const tilted = structuredClone(h.walls);
  const top = tilted.findIndex((w) => w.a.y === 0.7 && w.b.y === 0.7);
  const old = { ...tilted[top].a };
  tilted[top].a = { x: old.x, y: 0.7 + (Math.tan(Math.PI / 180) * 6) / 10 };
  // keep the joint: the right wall ends where the tilted wall starts
  for (const w of tilted)
    for (const k of ['a', 'b'])
      if (w !== tilted[top] && w[k].x === old.x && w[k].y === old.y) w[k] = { ...tilted[top].a };
  const s = straighten(tilted, 10, 10);
  assert.equal(s.fixed, 1);
  const st = s.walls[top];
  assert.ok(Math.abs(st.a.y - st.b.y) < 1e-12, 'wall straightened');
  assert.ok(
    s.walls.some(
      (w, i) => i !== top && ['a', 'b'].some((k) => w[k].x === st.a.x && w[k].y === st.a.y),
    ),
    'joint kept',
  );

  // DXF professional layers
  const dxf = toDXF(h.walls, 10, 10, [], {
    grid: { xs: [2, 6], ys: [3] },
    columns: cols,
    rooms: h.rooms,
    names: ['Dormitorio', null],
  });
  for (const layer of ['EJES', 'COLUMNAS', 'AMBIENTES'])
    assert.ok(dxf.includes('\n8\n' + layer + '\n'), 'DXF layer ' + layer);
  assert.ok(dxf.includes('Dormitorio ') && dxf.includes('\nA\n') && dxf.endsWith('EOF'));
  assert.equal(toDXF(h.walls, 10, 10), toDXF(h.walls, 10, 10, [], {}), 'old calls unchanged');

  // Saved data validation
  validatePro({
    roomTags: tags,
    grid: { xs: [1, 5], ys: [2] },
    columns: cols,
    slab: { thickness: 0.2, show: false },
  });
  assert.throws(() => validatePro({ roomTags: [{ x: 2, y: 0, name: 'x' }] }));
  assert.throws(() => validatePro({ columns: [{ x: 0.5, y: 0.5, b: 0, h: 0.3 }] }));
  assert.throws(() => validatePro({ slab: { thickness: 2, show: true } }));
  validatePro({}); // old projects have none of these
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProTests();
  console.log('Pro checks passed.');
}
