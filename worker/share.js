// Shared projects: POST /api/compartir stores a copy (no plan image) and returns a link;
// GET /api/compartir/<id> returns it. Ids are random and unguessable (12 characters).
export const MAX_SHARE = 1_500_000;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Minimal shape check; the app validates everything again when it opens the link. */
export function shareable(p) {
  if (
    !p ||
    typeof p !== 'object' ||
    ![1, 2].includes(p.version) ||
    !Array.isArray(p.walls) ||
    p.walls.length > 2000
  )
    return null;
  const { image, ...rest } = p; // the plan image stays on the user's device
  void image;
  return rest;
}

export async function createShare(env, body) {
  const p = shareable(body?.proyecto);
  if (!p) return { error: 'Proyecto no válido.' };
  const datos = JSON.stringify(p);
  if (datos.length > MAX_SHARE) return { error: 'El proyecto es demasiado grande para compartir.' };
  const id = newId();
  await env.DB.prepare('INSERT INTO compartidos (id, creado, datos) VALUES (?, ?, ?)')
    .bind(id, new Date().toISOString(), datos)
    .run();
  return { id };
}

export async function readShare(env, id) {
  if (!/^[A-Za-z0-9]{12}$/.test(id)) return null;
  const row = await env.DB.prepare('SELECT datos FROM compartidos WHERE id = ?').bind(id).first();
  return row ? row.datos : null;
}
