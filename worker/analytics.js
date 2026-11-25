// Anonymous usage statistics: events sent by the app (POST /api/evento) and the summary
// for the admin panel (GET /api/admin/resumen). Nothing personal is stored: the visitor
// id is a SHA-256 of (secret salt, day, IP, browser) that changes every day.

export const EVENTS = [
  'visita',
  'subir',
  'construir',
  'dibujar',
  'recorrido',
  'pro',
  'exportar',
  'sugerencia',
  'video',
  'guia',
  'guia_saltada',
];
const BOTS =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch/i;

/** Day (YYYY-MM-DD) and hour in Ecuador (UTC-5, no daylight saving). */
export function ecuadorTime(now = Date.now()) {
  const d = new Date(now - 5 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function isBot(ua) {
  return !ua || BOTS.test(ua);
}

export function device(ua = '') {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tableta';
  if (/mobi|iphone|android/i.test(ua)) return 'movil';
  return 'computadora';
}

export function browser(ua = '') {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Otro';
}

/** Referrer host without "www.", or "directo"; our own sites count as "directo". */
export function source(ref) {
  const host = String(ref || '')
    .toLowerCase()
    .replace(/^www\./, '')
    .slice(0, 60);
  if (
    !host ||
    /plano-vivo\.fleremiasflemin\.workers\.dev|fleremiasflemin20-maker\.github\.io/.test(host)
  )
    return 'directo';
  if (!/^[a-z0-9.-]+$/.test(host)) return 'otro';
  // Group the big networks' many hosts (l.instagram.com, lm.facebook.com, t.co…).
  for (const [name, re] of [
    ['instagram', /instagram/],
    ['facebook', /facebook|fb\.com/],
    ['linkedin', /linkedin|lnkd\.in/],
    ['whatsapp', /whatsapp|wa\.me/],
    ['google', /google\./],
    ['tiktok', /tiktok/],
    ['x / twitter', /^t\.co$|twitter|x\.com/],
    ['youtube', /youtube|youtu\.be/],
  ])
    if (re.test(host)) return name;
  return host;
}

/** Validated event body, or null. */
export function parseEvent(body) {
  if (!body || typeof body !== 'object' || !EVENTS.includes(body.e)) return null;
  const clean = (v, n) =>
    typeof v === 'string'
      ? v
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9 ._-]/g, '')
          .slice(0, n) || null
      : null;
  return {
    event: body.e,
    isNew: body.nuevo === true ? 1 : 0,
    site: body.sitio === 'github' ? 'github' : 'cloudflare',
    source: body.e === 'visita' ? source(body.ref) : null,
    campaign: clean(body.utm, 40),
  };
}

export async function visitorId(salt, day, ip, ua) {
  const data = new TextEncoder().encode([salt, day, ip, ua].join('|'));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash.slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of the admin token. */
export function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function recordEvent(env, request, body, now = Date.now()) {
  const ev = parseEvent(body);
  if (!ev) return false;
  const ua = request.headers.get('User-Agent') || '';
  if (isBot(ua)) return true; // accepted, not stored
  const { day, hour } = ecuadorTime(now);
  const salt = env.HASH_SALT || env.ADMIN_TOKEN || 'plano-vivo';
  const visitor = await visitorId(salt, day, request.headers.get('CF-Connecting-IP') || '', ua);
  // The site comes from the request's origin (GitHub Pages posts cross-origin).
  const site = /github\.io$/.test(request.headers.get('Origin') || '') ? 'github' : ev.site;
  await env.DB.prepare(
    'INSERT INTO visitas (dia, hora, visitante, evento, nuevo, sitio, origen, campana, pais, dispositivo, navegador) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      day,
      hour,
      visitor,
      ev.event,
      ev.isNew,
      site,
      ev.source,
      ev.campaign,
      request.cf?.country || null,
      device(ua),
      browser(ua),
    )
    .run();
  return true;
}

/** Everything the admin panel shows, for the last `days` days (Ecuador time). */
export async function summary(env, days, now = Date.now()) {
  const n = Math.max(1, Math.min(365, Math.round(days) || 30));
  const today = ecuadorTime(now).day,
    from = ecuadorTime(now - (n - 1) * 86400000).day;
  const all = async (sql, ...args) =>
    (
      await env.DB.prepare(sql)
        .bind(...args)
        .all()
    ).results || [];
  const top = (column) =>
    all(
      `SELECT COALESCE(${column}, 'desconocido') AS nombre, COUNT(DISTINCT visitante) AS visitantes FROM visitas WHERE dia >= ? AND evento = 'visita' GROUP BY nombre ORDER BY visitantes DESC LIMIT 12`,
      from,
    );
  const [
    daily,
    events,
    sources,
    countries,
    devices,
    browsers,
    sites,
    campaigns,
    hours,
    suggestions,
  ] = await Promise.all([
    all(
      `SELECT dia, COUNT(DISTINCT visitante) AS visitantes, SUM(evento = 'visita') AS visitas, COUNT(DISTINCT CASE WHEN evento = 'visita' AND nuevo = 1 THEN visitante END) AS nuevos FROM visitas WHERE dia >= ? GROUP BY dia ORDER BY dia`,
      from,
    ),
    all(
      `SELECT evento, COUNT(*) AS veces, COUNT(DISTINCT dia || visitante) AS personas FROM visitas WHERE dia >= ? GROUP BY evento`,
      from,
    ),
    top('origen'),
    top('pais'),
    top('dispositivo'),
    top('navegador'),
    top('sitio'),
    all(
      `SELECT campana AS nombre, COUNT(DISTINCT visitante) AS visitantes FROM visitas WHERE dia >= ? AND evento = 'visita' AND campana IS NOT NULL GROUP BY campana ORDER BY visitantes DESC LIMIT 12`,
      from,
    ),
    all(
      `SELECT hora, COUNT(DISTINCT dia || visitante) AS visitantes FROM visitas WHERE dia >= ? AND evento = 'visita' GROUP BY hora ORDER BY hora`,
      from,
    ),
    all(
      `SELECT creada, tipo, valoracion, mensaje, contacto FROM sugerencias WHERE creada >= ? ORDER BY id DESC LIMIT 50`,
      from,
    ),
  ]);
  // Fill missing days with zeros so the chart shows quiet days too.
  const byDay = new Map(daily.map((d) => [d.dia, d]));
  const series = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = ecuadorTime(now - i * 86400000).day;
    const d = byDay.get(day);
    series.push({
      dia: day,
      visitantes: d?.visitantes || 0,
      visitas: d?.visitas || 0,
      nuevos: d?.nuevos || 0,
    });
  }
  return {
    desde: from,
    hasta: today,
    dias: n,
    serie: series,
    eventos: events,
    origenes: sources,
    paises: countries,
    dispositivos: devices,
    navegadores: browsers,
    sitios: sites,
    campanas: campaigns,
    horas: hours,
    sugerencias: suggestions,
  };
}
