// Quick guide: points at each part of the interface, one step at a time. Opens by itself
// on the first visit (remembered in localStorage) and from the "Guía rápida" button.
import { $ } from './core.mjs';
import { setView } from './model.mjs';
import { track } from './stats.mjs';

const SEEN = 'pv-guia';
const STEPS = [
  {
    title: 'Bienvenido a Plano Vivo',
    text: 'Te mostramos en un minuto cómo pasar de un plano a un modelo 3D. Lo que ves es una vivienda de ejemplo: puedes tocar todo sin miedo, siempre se puede deshacer.',
  },
  {
    el: '.upload',
    title: '1 · Sube tu plano',
    text: 'Sube una foto, una captura o un PDF de tu plano (hasta 20 MB). Se procesa en tu equipo: no se envía a ningún servidor.',
  },
  {
    el: '#build',
    title: '2 · Construir en 3D',
    text: 'Reconoce muros con su grosor, puertas, ventanas, escaleras, muebles y la escala del plano. Luego revisa lo que propone.',
  },
  {
    el: '.editorbar .tools',
    view: 'split',
    title: '3 · Dibuja y corrige',
    text: 'Muros, rectángulos, puertas, ventanas, medidas y nombres de ambientes. Al dibujar un muro puedes escribir su longitud exacta (4.25) y pulsar Intro.',
  },
  {
    el: '#modelpane',
    view: 'split',
    title: '4 · Modelo 3D',
    text: 'Arrastra para girar y usa la rueda para acercarte. Con «+ Puerta» o «+ Ventana» añades aberturas con un clic sobre el muro.',
  },
  {
    el: '#walk',
    title: '5 · Recorrido',
    text: 'Camina por dentro a la altura de los ojos, con WASD o las flechas. Pulsa P o V para abrir una puerta o una ventana donde miras.',
  },
  {
    el: '#proPanel',
    open: true,
    title: '6 · Herramientas profesionales',
    text: 'Ejes estructurales, columnas, losa, cómputos métricos, cuadro de áreas y una revisión técnica del dibujo.',
  },
  {
    el: '.export-buttons',
    openParent: true,
    title: '7 · Exporta',
    text: 'DXF para tu programa de CAD, SVG, GLB para 3D, cantidades en CSV e imagen. Guarda el proyecto con «Guardar proyecto».',
  },
  {
    el: '#feedback',
    title: '8 · Cuéntanos qué falta',
    text: 'Estamos en beta. Con «Sugerencias» nos dices qué mejorar, sin crear cuenta. ¡Listo, a diseñar!',
  },
];

let i = 0,
  root = null;

function build() {
  root = document.createElement('div');
  root.id = 'guideLayer';
  root.innerHTML = `<div class="guide-ring" hidden></div>
    <div class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guideTitle">
      <div class="guide-count"></div>
      <h3 id="guideTitle"></h3>
      <p class="guide-text"></p>
      <div class="guide-actions">
        <button class="text guide-skip">Saltar guía</button>
        <span></span>
        <button class="guide-back">Atrás</button>
        <button class="primary guide-next">Siguiente</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  root.querySelector('.guide-skip').onclick = () => close(false);
  root.querySelector('.guide-back').onclick = () => go(i - 1);
  root.querySelector('.guide-next').onclick = () =>
    i === STEPS.length - 1 ? close(true) : go(i + 1);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  document.addEventListener('keydown', key, true);
}

function key(e) {
  if (!root || root.hidden) return;
  if (e.key === 'Escape') close(false);
  else if (e.key === 'ArrowRight' || e.key === 'Enter')
    i === STEPS.length - 1 ? close(true) : go(i + 1);
  else if (e.key === 'ArrowLeft') go(i - 1);
  else return;
  e.preventDefault();
  e.stopPropagation();
}

function target() {
  const s = STEPS[i];
  return s.el ? document.querySelector(s.el) : null;
}

/** Ring around the element and the card beside it (or at the bottom on small screens). */
function place() {
  if (!root || root.hidden) return;
  const ring = root.querySelector('.guide-ring'),
    card = root.querySelector('.guide-card'),
    el = target();
  const small = innerWidth < 760;
  card.classList.toggle('bottom', small);
  if (!el) {
    ring.hidden = true;
    root.classList.add('dim');
    card.style.left = card.style.top = '';
    card.classList.add('center');
    return;
  }
  root.classList.remove('dim');
  card.classList.remove('center');
  const r = el.getBoundingClientRect(),
    pad = 6;
  ring.hidden = false;
  Object.assign(ring.style, {
    left: r.left - pad + 'px',
    top: r.top - pad + 'px',
    width: r.width + 2 * pad + 'px',
    height: r.height + 2 * pad + 'px',
  });
  if (small) {
    card.style.left = card.style.top = '';
    return;
  }
  const cw = card.offsetWidth,
    ch = card.offsetHeight,
    gap = 14;
  // Right of the element, else below, else above; always inside the window.
  let x = r.right + gap,
    y = r.top;
  if (x + cw > innerWidth - 12) {
    x = Math.min(Math.max(12, r.left), innerWidth - cw - 12);
    y = r.bottom + gap;
    if (y + ch > innerHeight - 12) y = r.top - ch - gap;
  }
  card.style.left = Math.max(12, Math.min(x, innerWidth - cw - 12)) + 'px';
  card.style.top = Math.max(12, Math.min(y, innerHeight - ch - 12)) + 'px';
}

function go(n) {
  i = Math.max(0, Math.min(STEPS.length - 1, n));
  const s = STEPS[i];
  if (s.view) setView(s.view);
  if (s.open) $(s.el.slice(1)).open = true;
  if (s.openParent) document.querySelector(s.el)?.closest('details')?.setAttribute('open', '');
  root.querySelector('.guide-count').textContent = `Paso ${i + 1} de ${STEPS.length}`;
  root.querySelector('#guideTitle').textContent = s.title;
  root.querySelector('.guide-text').textContent = s.text;
  root.querySelector('.guide-back').disabled = i === 0;
  root.querySelector('.guide-next').textContent = i === STEPS.length - 1 ? 'Empezar' : 'Siguiente';
  const el = target();
  if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  requestAnimationFrame(place);
  setTimeout(place, 250);
  root.querySelector('.guide-next').focus({ preventScroll: true });
}

export function openGuide() {
  if (!root) build();
  root.hidden = false;
  go(0);
}

function close(done) {
  if (!root) return;
  root.hidden = true;
  try {
    localStorage.setItem(SEEN, done ? 'completa' : 'saltada');
  } catch {
    // storage blocked: the guide may show again next time
  }
  track(done ? 'guia' : 'guia_saltada');
  window.scrollTo({ top: 0 });
}

$('guide').onclick = openGuide;

// First visit: open by itself once the example house is on screen.
let seen = true;
try {
  seen = !!localStorage.getItem(SEEN);
} catch {
  seen = true;
}
if (!seen && !document.querySelector('meta[name=python-engine]')) setTimeout(openGuide, 900);
