// Usage statistics and admin panel (worker/analytics.js, worker/index.js), against a real
// SQLite database with the D1 migrations applied (node:sqlite, built into Node 22).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import worker from './worker/index.js';
import {
  parseEvent,
  source,
  device,
  browser,
  isBot,
  ecuadorTime,
  visitorId,
  sameToken,
  recordEvent,
  summary,
} from './worker/analytics.js';

async function sqliteD1() {
  process.removeAllListeners('warning'); // node:sqlite is experimental in Node 22
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').sort())
    db.exec(readFileSync('migrations/' + f, 'utf8'));
  return {
    db,
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => db.prepare(sql).run(...args),
        all: async () => ({
          results: db
            .prepare(sql)
            .all(...args)
            .map((r) => ({ ...r })),
        }),
      }),
    }),
  };
}

const SITE = 'https://plano-vivo.fleremiasflemin.workers.dev';
const PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const PC =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0';
const beacon = (body, { ip = '1.2.3.4', ua = PHONE, origin = SITE } = {}) => {
  const r = new Request(SITE + '/api/evento', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Origin: origin,
      'CF-Connecting-IP': ip,
      'User-Agent': ua,
    },
    body: JSON.stringify(body),
  });
  Object.defineProperty(r, 'cf', { value: { country: 'EC' } });
  return r;
};

export async function runAnalyticsTests() {
  // Pure helpers
  assert.deepEqual(ecuadorTime(Date.UTC(2026, 10, 25, 3, 30)), { day: '2026-11-24', hour: 22 });
  assert.equal(source('l.instagram.com'), 'instagram');
  assert.equal(source('www.linkedin.com'), 'linkedin');
  assert.equal(source(''), 'directo');
  assert.equal(source('fleremiasflemin20-maker.github.io'), 'directo');
  assert.equal(source('estudio-arq.ec'), 'estudio-arq.ec');
  assert.equal(device(PHONE), 'movil');
  assert.equal(device(PC), 'computadora');
  assert.equal(browser(PC), 'Edge');
  assert.ok(isBot('Googlebot/2.1') && isBot('') && !isBot(PHONE));
  assert.equal(parseEvent({ e: 'hackear' }), null);
  assert.deepEqual(
    parseEvent({
      e: 'visita',
      nuevo: true,
      ref: 'www.facebook.com',
      utm: 'Reel-01!',
      sitio: 'github',
    }),
    {
      event: 'visita',
      isNew: 1,
      site: 'github',
      source: 'facebook',
      campaign: 'reel-01',
    },
  );
  const a = await visitorId('s', '2026-11-24', '1.2.3.4', PHONE);
  assert.equal(a.length, 20);
  assert.notEqual(a, await visitorId('s', '2026-11-25', '1.2.3.4', PHONE), 'id changes every day');
  assert.ok(
    sameToken('clave-larga', 'clave-larga') &&
      !sameToken('clave', 'clave-larga') &&
      !sameToken('x', ''),
  );

  // Events through the Worker
  const DB = await sqliteD1();
  const env = {
    DB,
    ADMIN_TOKEN: 'secreto-de-prueba',
    ASSETS: { fetch: async () => new Response('sitio') },
  };
  for (const [body, opts] of [
    [{ e: 'visita', nuevo: true, ref: 'l.instagram.com', utm: 'reel' }, {}],
    [{ e: 'construir' }, {}],
    [{ e: 'recorrido' }, {}],
    [
      { e: 'visita', ref: 'www.linkedin.com' },
      { ip: '5.6.7.8', ua: PC },
    ],
    [{ e: 'exportar' }, { ip: '5.6.7.8', ua: PC }],
    [
      { e: 'visita', ref: 'fleremiasflemin20-maker.github.io' },
      { ip: '9.9.9.9', ua: PC, origin: 'https://fleremiasflemin20-maker.github.io' },
    ],
  ]) {
    const r = await worker.fetch(beacon(body, opts), env);
    assert.equal(r.status, 202, JSON.stringify(body));
  }
  assert.equal(
    (await worker.fetch(beacon({ e: 'visita' }, { ua: 'Googlebot/2.1' }), env)).status,
    202,
    'bot accepted',
  );
  assert.equal((await worker.fetch(beacon({ e: 'otro' }), env)).status, 422);
  assert.equal(
    (await worker.fetch(beacon({ e: 'visita' }, { origin: 'https://evil.example' }), env)).status,
    403,
  );
  const rows = DB.db.prepare('SELECT * FROM visitas').all();
  assert.equal(rows.length, 6, 'bot and invalid events not stored');
  assert.ok(
    rows.every((r) => !JSON.stringify(r).includes('1.2.3.4')),
    'no IP stored',
  );
  assert.equal(rows[0].pais, 'EC');

  // Admin summary
  const s = await summary(env, 7);
  const today = s.serie.at(-1);
  assert.equal(s.serie.length, 7);
  assert.deepEqual([today.visitantes, today.visitas, today.nuevos], [3, 3, 1]);
  const ev = Object.fromEntries(s.eventos.map((e) => [e.evento, e.personas]));
  assert.deepEqual([ev.visita, ev.construir, ev.recorrido, ev.exportar], [3, 1, 1, 1]);
  assert.deepEqual(s.origenes.map((o) => o.nombre).sort(), ['directo', 'instagram', 'linkedin']);
  assert.deepEqual(s.campanas, [{ nombre: 'reel', visitantes: 1 }]);
  assert.deepEqual(s.dispositivos.map((o) => o.nombre).sort(), ['computadora', 'movil']);
  assert.equal(s.sitios.find((o) => o.nombre === 'github').visitantes, 1);

  // Admin endpoint and page
  const admin = (token, e = env) =>
    worker.fetch(
      new Request(SITE + '/api/admin/resumen?dias=7', {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      }),
      e,
    );
  assert.equal((await admin('mala')).status, 401);
  assert.equal((await admin()).status, 401);
  const ok = await admin('secreto-de-prueba');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.equal((await ok.json()).serie.length, 7);
  assert.equal(
    (await admin('x', { ...env, ADMIN_TOKEN: undefined })).status,
    503,
    'not configured',
  );
  const limited = { ...env, LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await admin('mala', limited)).status, 429, 'guessing is rate limited');
  const page = await worker.fetch(new Request(SITE + '/admin'), env);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.equal(page.headers.get('X-Robots-Tag'), 'noindex');
  const html = await page.text();
  assert.ok(
    html.includes('/api/admin/resumen') && !html.includes('secreto-de-prueba'),
    'page has no secret',
  );
  // Direct recordEvent with an unknown event stores nothing
  assert.equal(await recordEvent(env, beacon({}), { e: 'nada' }), false);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runAnalyticsTests();
  console.log('Analytics checks passed.');
}
