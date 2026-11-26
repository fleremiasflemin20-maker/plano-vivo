// Suggestions endpoint (worker/index.js) with an in-memory D1 and rate limiter.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import worker, { parseSuggestion } from './worker/index.js';

function fakeEnv({ allow = true } = {}) {
  const rows = [];
  return {
    rows,
    ASSETS: { fetch: async () => new Response('sitio') },
    LIMITER: { limit: async () => ({ success: allow }) },
    DB: {
      prepare: (sql) => ({
        bind: (...values) => ({
          run: async () => {
            assert.match(sql, /^INSERT INTO sugerencias/);
            rows.push(values);
          },
        }),
      }),
    },
  };
}

const SITE = 'https://plantea-3d.fleremiasflemin.workers.dev';
const post = (body, origin = SITE, url = SITE + '/api/sugerencias') =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { tipo: 'idea', mensaje: 'Que reconozca planos de dos pisos.', valoracion: '5' };

export async function runWorkerTests() {
  let env = fakeEnv();
  // Static site passes through.
  assert.equal(await (await worker.fetch(new Request(SITE + '/'), env)).text(), 'sitio');

  // Accepted from the site, GitHub Pages and the local engine; CORS echoes the origin.
  for (const origin of [
    SITE,
    'https://fleremiasflemin20-maker.github.io',
    'http://127.0.0.1:8877',
  ]) {
    const r = await worker.fetch(post(good, origin), env);
    assert.equal(r.status, 201, origin);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin);
  }
  assert.equal(env.rows.length, 3);
  const [, kind, rating, message, contact] = env.rows[0];
  assert.deepEqual([kind, rating, message, contact], ['idea', 5, good.mensaje, null]);

  // Other origins, other methods, malformed and invalid bodies are refused.
  assert.equal((await worker.fetch(post(good, 'https://evil.example'), env)).status, 403);
  assert.equal(
    (await worker.fetch(new Request(SITE + '/api/sugerencias', { headers: { Origin: SITE } }), env))
      .status,
    405,
  );
  assert.equal((await worker.fetch(post('{no json'), env)).status, 400);
  assert.equal((await worker.fetch(post({ ...good, mensaje: 'corto' }), env)).status, 422);
  assert.equal((await worker.fetch(post({ ...good, tipo: 'spam' }), env)).status, 422);
  assert.equal((await worker.fetch(post({ ...good, valoracion: 9 }), env)).status, 422);
  assert.equal((await worker.fetch(post({ ...good, mensaje: 'x'.repeat(9000) }), env)).status, 413);
  // Honeypot: looks accepted, nothing stored.
  assert.equal((await worker.fetch(post({ ...good, website: 'http://spam' }), env)).status, 201);
  assert.equal(env.rows.length, 3);
  // Rate limited.
  env = fakeEnv({ allow: false });
  assert.equal((await worker.fetch(post(good), env)).status, 429);
  assert.equal(env.rows.length, 0);
  // Preflight.
  const pre = await worker.fetch(
    new Request(SITE + '/api/sugerencias', {
      method: 'OPTIONS',
      headers: { Origin: 'https://fleremiasflemin20-maker.github.io' },
    }),
    env,
  );
  assert.equal(pre.status, 204);

  assert.deepEqual(
    parseSuggestion({ tipo: 'opinion', mensaje: '  Me gustó mucho.  ', contacto: '' }),
    {
      kind: 'opinion',
      message: 'Me gustó mucho.',
      contact: null,
      rating: null,
      version: null,
    },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runWorkerTests();
