// Cloudflare Worker: serves the static site (dist/) and receives suggestions from the
// in-app form (POST /api/sugerencias), stored in D1. No accounts, no cookies, no IP
// addresses stored; the client IP is only used, unstored, by the rate limiter.

const SITES = [
  'https://plano-vivo.fleremiasflemin.workers.dev',
  'https://fleremiasflemin20-maker.github.io',
];
// The local Python engine serves the same page from the user's own computer.
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
export const KINDS = ['idea', 'error', 'opinion'];
const MAX_BODY = 8000;

const json = (data, status, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

/** Validated suggestion, or a Spanish error message. */
export function parseSuggestion(body) {
  if (!body || typeof body !== 'object') return { error: 'Formulario no válido.' };
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const kind = text(body.tipo),
    message = text(body.mensaje),
    contact = text(body.contacto),
    version = text(body.version).slice(0, 40),
    rating = body.valoracion == null || body.valoracion === '' ? null : Number(body.valoracion);
  if (!KINDS.includes(kind)) return { error: 'Elige el tipo de mensaje.' };
  if (message.length < 10 || message.length > 2000)
    return { error: 'Escribe entre 10 y 2000 caracteres.' };
  if (contact.length > 120) return { error: 'El contacto es demasiado largo.' };
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5))
    return { error: 'La valoración va de 1 a 5.' };
  return { kind, message, contact: contact || null, rating, version: version || null };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/sugerencias') return env.ASSETS.fetch(request);

    const origin = request.headers.get('Origin') || '',
      allowed = origin === url.origin || SITES.includes(origin) || LOCAL.test(origin),
      cors = allowed
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            Vary: 'Origin',
          }
        : {};
    if (request.method === 'OPTIONS')
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, cors);
    if (!allowed) return json({ error: 'Origen no permitido.' }, 403, cors);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY)
      return json({ error: 'Mensaje demasiado largo.' }, 413, cors);

    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({
        key: request.headers.get('CF-Connecting-IP') || 'anon',
      });
      if (!success)
        return json({ error: 'Demasiados envíos seguidos. Prueba en un minuto.' }, 429, cors);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return json({ error: 'Mensaje demasiado largo.' }, 413, cors);
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Formulario no válido.' }, 400, cors);
    }
    // Bots fill the hidden field; answer as if accepted and store nothing.
    if (body && body.website) return json({ ok: true }, 201, cors);
    const s = parseSuggestion(body);
    if (s.error) return json({ error: s.error }, 422, cors);
    await env.DB.prepare(
      'INSERT INTO sugerencias (creada, tipo, valoracion, mensaje, contacto, version) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(new Date().toISOString(), s.kind, s.rating, s.message, s.contact, s.version)
      .run();
    return json({ ok: true }, 201, cors);
  },
};
