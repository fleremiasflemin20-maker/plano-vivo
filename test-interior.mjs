// Interior design: layouts, furnishing, styles, validation; AI endpoints with a fake model;
// shared links against SQLite with the D1 migrations.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { findRooms } from './dist/geometry.mjs';
import { review, roomName, inRoom } from './dist/pro.mjs';
import { CATALOG } from './dist/furniture3d.mjs';
import {
  layoutProgram,
  furnishAll,
  furnishRoom,
  fits,
  styleFinishes,
  restyle,
  placeExtra,
  validateInterior,
  itemList,
  STYLES,
  TALL,
  obstaclesFrom,
  withoutRecognizedFurniture,
} from './dist/interior.mjs';
import { cleanScene, cleanChange, ROUTES, KINDS } from './worker/ai.js';
import worker from './worker/index.js';

const SITE = 'https://plano-vivo.fleremiasflemin.workers.dev';

export async function runInteriorTests() {
  // Every AI furniture id exists in the 3D catalogue and the other way round.
  assert.deepEqual([...KINDS].sort(), Object.keys(CATALOG).sort());

  // Common sense, like an architect: nothing on top of anything else, nothing in a door's
  // swing or on the stairs, nothing tall in front of a window, every room with its basics.
  const box = (it, W, D) => {
    const r = Math.abs(Math.sin((it.rot * Math.PI) / 180)) > 0.5,
      w = r ? it.d : it.w,
      d = r ? it.w : it.d;
    return {
      x0: it.x * W - w / 2,
      x1: it.x * W + w / 2,
      y0: it.y * D - d / 2,
      y1: it.y * D + d / 2,
    };
  };
  const hit = (p, q, m = 0.02) =>
    p.x0 < q.x1 - m && q.x0 < p.x1 - m && p.y0 < q.y1 - m && q.y0 < p.y1 - m;
  const seat = (k) => /chair/.test(k),
    under = (k) => /table|round|desk/.test(k);
  const programs = [
    [
      { tipo: 'Sala-comedor', area: 22 },
      { tipo: 'Cocina', area: 10 },
      { tipo: 'Dormitorio principal', area: 14 },
      { tipo: 'Dormitorio', area: 10 },
      { tipo: 'Baño', area: 5 },
    ],
    [
      { tipo: 'Sala-comedor', area: 28 },
      { tipo: 'Cocina', area: 9 },
      { tipo: 'Dormitorio principal', area: 13 },
      { tipo: 'Dormitorio', area: 10 },
      { tipo: 'Baño', area: 4.5 },
      { tipo: 'Baño', area: 3.5 },
    ],
    [
      { tipo: 'Sala', area: 16 },
      { tipo: 'Comedor', area: 10 },
      { tipo: 'Cocina', area: 8 },
      { tipo: 'Dormitorio principal', area: 12 },
      { tipo: 'Dormitorio', area: 9 },
      { tipo: 'Estudio', area: 8 },
    ],
  ];
  for (const prog of programs) {
    const L = layoutProgram(prog),
      rooms = findRooms(L.walls, L.W, L.D, 0.15);
    // A stair block in the living room and a recognised furniture block in every room.
    const big = rooms.find((r) => /^Sala/.test(roomName(r, L.tags))).runs[0];
    const stair = { type: 'stair', x: big.x, y: big.y, w: 0.9 / L.W, h: 2.4 / L.D };
    const blocks = rooms.map((r) => {
      const q = r.runs[Math.floor(r.runs.length / 2)];
      return { type: 'furniture', x: q.x + q.w / 4, y: q.y + q.h / 4, w: q.w / 2, h: q.h / 2 };
    });
    const features = withoutRecognizedFurniture([stair, ...blocks], rooms);
    assert.deepEqual(features, [stair], 'recognised furniture is replaced, stairs stay');
    const obstacles = obstaclesFrom(features, [], L.W, L.D);
    const items = furnishAll(rooms, L.tags, L.walls, L.W, L.D, 'calido', obstacles);
    const solid = items.filter((it) => it.kind !== 'rug');
    for (let i = 0; i < solid.length; i++)
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i],
          b = solid[j];
        if ((seat(a.kind) && under(b.kind)) || (seat(b.kind) && under(a.kind))) continue;
        if (/coffee/.test(a.kind) || /coffee/.test(b.kind)) continue;
        assert.ok(!hit(box(a, L.W, L.D), box(b, L.W, L.D)), `${a.kind} on top of ${b.kind}`);
      }
    const st = obstacles[0];
    for (const it of solid) {
      const p = box(it, L.W, L.D);
      assert.ok(
        !hit(p, { x0: st.x0 * L.W, x1: st.x1 * L.W, y0: st.y0 * L.D, y1: st.y1 * L.D }, 0.01),
        `${it.kind} on the stairs`,
      );
      if (TALL.has(it.kind))
        for (const w of L.walls.filter((w) => w.type === 'window')) {
          const m = { x: ((w.a.x + w.b.x) / 2) * L.W, y: ((w.a.y + w.b.y) / 2) * L.D };
          assert.ok(
            !(m.x > p.x0 - 0.2 && m.x < p.x1 + 0.2 && m.y > p.y0 - 0.2 && m.y < p.y1 + 0.2),
            `${it.kind} in front of a window`,
          );
        }
      for (const w of L.walls.filter((w) => w.type === 'door')) {
        const m = { x: ((w.a.x + w.b.x) / 2) * L.W, y: ((w.a.y + w.b.y) / 2) * L.D };
        assert.ok(
          !(m.x > p.x0 - 0.3 && m.x < p.x1 + 0.3 && m.y > p.y0 - 0.3 && m.y < p.y1 + 0.3),
          `${it.kind} blocks a door`,
        );
      }
    }
    // The basics a designer never leaves out.
    const has = (name, kinds) => {
      const r = rooms.find((r) => roomName(r, L.tags) === name);
      if (!r) return;
      const inside = items.filter((it) => inRoom(it, r)).map((it) => it.kind);
      assert.ok(
        kinds.some((k) => inside.includes(k)),
        `${name} without ${kinds.join(' / ')}: ${inside.join(', ')}`,
      );
    };
    has('Dormitorio principal', ['bed_double']);
    has('Dormitorio', ['bed_single', 'bed_double']);
    has('Dormitorio', ['wardrobe']);
    has('Cocina', ['kitchen_counter']);
    has('Baño', ['toilet']);
    has('Comedor', ['dining_table', 'dining_round']);
    has('Sala-comedor', ['dining_table', 'dining_round']);
    has('Sala-comedor', ['sofa', 'sofa_l']);
    has('Sala', ['sofa', 'sofa_l']);
  }

  // Plan from a room program: rooms found, all named, doors/windows, clean review.
  const L = layoutProgram([
    { tipo: 'Sala-comedor', area: 22 },
    { tipo: 'Cocina', area: 10 },
    { tipo: 'Dormitorio principal', area: 14 },
    { tipo: 'Dormitorio', area: 10 },
    { tipo: 'Baño', area: 5 },
  ]);
  const rooms = findRooms(L.walls, L.W, L.D, 0.15);
  assert.equal(rooms.length, 5, 'five rooms');
  assert.ok(
    rooms.every((r) => roomName(r, L.tags)),
    'every room named',
  );
  assert.equal(L.walls.filter((w) => w.type === 'door').length, 5);
  const issues = review({
    walls: L.walls,
    rooms,
    tags: L.tags,
    features: [],
    W: L.W,
    D: L.D,
    H: 2.6,
    T: 0.15,
  }).filter((f) => f.level !== 'info');
  assert.deepEqual(issues, [], 'generated plan passes the technical review');

  // Furnishing: pieces of the right kind, inside their room, not on top of each other.
  const items = furnishAll(rooms, L.tags, L.walls, L.W, L.D, 'calido');
  const byRoom = (name) =>
    items.filter((it) =>
      inRoom(
        it,
        rooms.find((r) => roomName(r, L.tags) === name),
      ),
    );
  assert.ok(byRoom('Dormitorio principal').some((i) => i.kind === 'bed_double'));
  assert.ok(byRoom('Baño').some((i) => i.kind === 'toilet'));
  assert.ok(byRoom('Sala-comedor').some((i) => i.kind === 'sofa' || i.kind === 'sofa_l'));
  assert.ok(
    byRoom('Sala-comedor').filter((i) => i.kind === 'chair').length >= 2,
    'dining chairs kept',
  );
  for (const it of items)
    assert.ok(
      fits(
        it,
        rooms.find((r) => inRoom(it, r)),
        L.W,
        L.D,
      ),
      it.kind + ' inside its room',
    );
  validateInterior({ items, finishes: styleFinishes(rooms, 'nordico') });
  assert.throws(() =>
    validateInterior({ items: [{ kind: 'nave', x: 0.5, y: 0.5, rot: 0, w: 1, d: 1, h: 1 }] }),
  );
  assert.throws(() =>
    validateInterior({ finishes: [{ x: 0.5, y: 0.5, floor: 'rojo', wall: '#ffffff' }] }),
  );
  validateInterior({}); // older projects

  // Rearranging gives another layout; extras land on free space; styles recolour.
  const room = rooms.find((r) => roomName(r, L.tags) === 'Dormitorio principal');
  const a = furnishRoom(room, 'Dormitorio principal', L.walls, L.W, L.D, 'calido', null, 0);
  const b = furnishRoom(room, 'Dormitorio principal', L.walls, L.W, L.D, 'calido', null, 1);
  assert.notDeepEqual(
    a.map((i) => [i.kind, i.rot]),
    b.map((i) => [i.kind, i.rot]),
  );
  const plant = placeExtra('plant', room, a, L.W, L.D);
  assert.ok(plant && fits(plant, room, L.W, L.D));
  const green = restyle(items, 'verde');
  assert.equal(green.find((i) => i.kind === 'plant')?.color, STYLES.verde.plant);
  assert.ok(itemList(items, rooms, L.tags).every((r) => r.name && r.size.includes('×')));

  // AI answers are cleaned against the catalogue, and the Spanish text double-checks flags.
  const scene = cleanScene({
    estilo: 'raro',
    ambientes: [
      {
        tipo: 'Sala',
        area: 18,
        piso: 'madera clara',
        pared: '#AABBCC',
        muebles: [{ tipo: 'sofa', color: '#C8742C' }, { tipo: 'nave' }],
      },
      { tipo: 'Garage espacial', muebles: [] },
    ],
  });
  assert.equal(scene.estilo, 'calido');
  assert.equal(scene.ambientes.length, 1);
  assert.deepEqual(scene.ambientes[0].muebles, [{ tipo: 'sofa', color: '#c8742c' }]);
  assert.equal(scene.ambientes[0].pared, '#aabbcc');
  const ch = cleanChange(
    {
      vaciar: true,
      reacomodar: true,
      recolorear: [{ tipo: 'sofa', color: '#c8742c' }],
      respuesta: 'ok',
    },
    'sofá naranja y agrega una planta',
    ['sofa'],
  );
  assert.equal(ch.vaciar, false, 'no emptying unless asked');
  assert.equal(ch.reacomodar, false, 'no rearranging unless asked');
  assert.deepEqual(ch.agregar, [{ tipo: 'plant' }]);
  assert.equal(cleanChange({ vaciar: true, respuesta: 'x' }, 'vacía el cuarto').vaciar, true);

  // Routes with a fake Workers AI.
  const calls = [];
  const AI = {
    run: async (model, input) => {
      calls.push(model);
      if (input.multipart) return { image: 'aGVsbG8=' };
      const sys = input.messages[0].content;
      if (/programa/.test(sys))
        return {
          response: {
            estilo: 'nordico',
            ambientes: [
              { tipo: 'Sala', area: 20 },
              { tipo: 'Baño', area: 4 },
            ],
          },
        };
      if (/edita/.test(sys))
        return { response: JSON.stringify({ pared: '#4f6b55', respuesta: 'Paredes verdes.' }) };
      return {
        response: {
          estilo: 'verde',
          ambientes: [{ tipo: 'Dormitorio', muebles: [{ tipo: 'bed_double' }] }],
        },
      };
    },
  };
  const env = { AI, ASSETS: { fetch: async () => new Response('sitio') } };
  const post = (path, body) =>
    worker.fetch(
      new Request(SITE + path, {
        method: 'POST',
        headers: { Origin: SITE, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
    );
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(100);
  let r = await post('/api/ia/fotos', { imagenes: [img] });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ambientes[0].muebles[0].tipo, 'bed_double');
  assert.equal((await post('/api/ia/fotos', { imagenes: [] })).status, 422);
  assert.equal(
    (await post('/api/ia/fotos', { imagenes: Array(9).fill(img) })).status,
    422,
    'too many photos',
  );
  r = await post('/api/ia/describir', { texto: 'casa de 60 m2' });
  assert.equal((await r.json()).ambientes.length, 2);
  r = await post('/api/ia/cambiar', {
    texto: 'paredes verdes',
    ambiente: { tipo: 'Sala', muebles: ['sofa'] },
  });
  assert.equal((await r.json()).pared, '#4f6b55');
  r = await post('/api/ia/foto', { imagen: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal((await r.json()).imagen, 'data:image/jpeg;base64,aGVsbG8=');
  assert.equal((await post('/api/ia/otra', {})).status, 200, 'unknown AI route falls to the site');
  assert.equal(
    (
      await worker.fetch(
        new Request(SITE + '/api/ia/fotos', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
          body: '{}',
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(SITE + '/api/ia/fotos', {
          method: 'POST',
          headers: { Origin: SITE },
          body: '{}',
        }),
        { ...env, AI: undefined },
      )
    ).status,
    503,
  );
  const limited = { ...env, AI_LIMIT: { limit: async () => ({ success: false }) } };
  assert.equal(
    (
      await worker.fetch(
        new Request(SITE + '/api/ia/cambiar', {
          method: 'POST',
          headers: { Origin: SITE },
          body: '{}',
        }),
        limited,
      )
    ).status,
    429,
  );
  const broken = {
    ...env,
    AI: {
      run: async () => {
        throw Error('4006: daily free allocation of 10,000 neurons');
      },
    },
  };
  const q = await worker.fetch(
    new Request(SITE + '/api/ia/cambiar', {
      method: 'POST',
      headers: { Origin: SITE },
      body: JSON.stringify({ texto: 'hola mundo' }),
    }),
    broken,
  );
  assert.equal(q.status, 503);
  assert.match((await q.json()).error, /agotó/);

  // Shared links with SQLite (node:sqlite) and the migrations.
  process.removeAllListeners('warning');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').sort())
    db.exec(readFileSync('migrations/' + f, 'utf8'));
  const DB = {
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => db.prepare(sql).run(...args),
        first: async () => db.prepare(sql).get(...args) ?? null,
        all: async () => ({ results: db.prepare(sql).all(...args) }),
      }),
    }),
  };
  const senv = { DB, ASSETS: env.ASSETS };
  const project = { version: 2, walls: L.walls, image: 'data:image/png;base64,AAAA', items };
  r = await worker.fetch(
    new Request(SITE + '/api/compartir', {
      method: 'POST',
      headers: { Origin: SITE },
      body: JSON.stringify({ proyecto: project }),
    }),
    senv,
  );
  assert.equal(r.status, 201);
  const { id } = await r.json();
  assert.match(id, /^[A-Za-z0-9]{12}$/);
  r = await worker.fetch(new Request(SITE + '/api/compartir/' + id), senv);
  assert.equal(r.status, 200, 'public read without Origin');
  const back = await r.json();
  assert.equal(back.walls.length, L.walls.length);
  assert.equal(back.image, undefined, 'plan image not shared');
  assert.equal(
    (await worker.fetch(new Request(SITE + '/api/compartir/AAAAAAAAAAAA'), senv)).status,
    404,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(SITE + '/api/compartir', {
          method: 'POST',
          headers: { Origin: SITE },
          body: JSON.stringify({ proyecto: { walls: 'x' } }),
        }),
        senv,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(SITE + '/api/compartir', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
          body: '{}',
        }),
        senv,
      )
    ).status,
    403,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runInteriorTests();
  console.log('Interior checks passed.');
}
