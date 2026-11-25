// Anonymous usage statistics for the admin panel: which features people use, never what
// they draw. Sends only the event name, whether this browser came before, where the visit
// came from and the utm_source of the link. No cookies; the Worker stores no IP.
// Respects "Do Not Track" and sends nothing from the local Python engine or localhost.
import { $ } from './core.mjs';

const HOSTED = 'https://plano-vivo.fleremiasflemin.workers.dev';
const ENDPOINT = (location.origin === HOSTED ? '' : HOSTED) + '/api/evento';
const OFF =
  navigator.doNotTrack === '1' ||
  window.doNotTrack === '1' ||
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ||
  !!document.querySelector('meta[name=python-engine]');
const SITE = location.hostname.endsWith('github.io') ? 'github' : 'cloudflare';
const sent = new Set();

/** Send an event once per page view (the visit itself, then each feature once). */
export function track(e) {
  if (OFF || sent.has(e)) return;
  sent.add(e);
  let isNew = false;
  try {
    isNew = !localStorage.getItem('pv-visto');
    localStorage.setItem('pv-visto', '1');
  } catch {
    // storage blocked: count as returning
  }
  const body = { e, nuevo: e === 'visita' && isNew, sitio: SITE };
  if (e === 'visita') {
    try {
      body.ref = document.referrer ? new URL(document.referrer).hostname : '';
    } catch {
      body.ref = '';
    }
    body.utm = new URLSearchParams(location.search).get('utm_source') || undefined;
  }
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([data], { type: 'text/plain' }))) return;
  } catch {
    // fall back to fetch
  }
  fetch(ENDPOINT, {
    method: 'POST',
    body: data,
    keepalive: true,
    headers: { 'Content-Type': 'text/plain' },
  }).catch(() => {});
}

// Feature use, read from the interface without touching the other modules.
const on = (id, type, e) => $(id)?.addEventListener(type, () => track(e));
on('file', 'change', 'subir');
on('build', 'click', 'construir');
on('walk', 'click', 'recorrido');
on('tour', 'click', 'video');
for (const id of [
  'exportDXF',
  'exportSVG',
  'exportGLB',
  'exportIFC',
  'exportCSV',
  'exportPNG',
  'proCSV',
])
  on(id, 'click', 'exportar');
$('proPanel')?.addEventListener('toggle', (ev) => ev.target.open && track('pro'));
$('plan')?.addEventListener('pointerdown', () => {
  const tool = document.querySelector('.tools .active')?.dataset.tool;
  if (['wall', 'rectangle', 'door', 'window'].includes(tool)) track('dibujar');
});
// The suggestion is counted when its "thank you" panel appears.
const done = $('feedbackDone');
if (done)
  new MutationObserver(() => !done.hidden && track('sugerencia')).observe(done, {
    attributes: true,
    attributeFilter: ['hidden'],
  });

track('visita');
