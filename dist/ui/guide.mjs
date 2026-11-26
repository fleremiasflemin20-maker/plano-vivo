// Quick guide: points at each part of the interface, one step at a time. Opens by itself
// for every new visitor (remembered in localStorage) and from the "Guía rápida" button.
// It can always be skipped. `openGuide(true)` would make it mandatory (no skip).
import { $ } from './core.mjs';
import { setView } from './model.mjs';
import { track } from './stats.mjs';

const SEEN = 'pv-guia-2'; // new tour: everyone sees it once, also those who saw the first one
const STEPS = [
  {
    title: 'Bienvenido a Plantea 3D',
    text: 'Este es tu estudio para pasar de un plano a un modelo 3D, amueblarlo con IA y documentarlo. Te mostramos cada sección en dos minutos. Lo que ves es una vivienda de ejemplo: todo se puede deshacer con Ctrl Z.',
  },
  {
    el: '.upload',
    title: '1 · Sube tu plano',
    text: 'Una foto, una captura o un PDF del plano (hasta 20 MB). Se procesa en tu equipo: el plano no se envía a ningún servidor.',
  },
  {
    el: '#build',
    title: '2 · Construir en 3D',
    text: 'Reconoce muros con su grosor (también en diagonal), puertas con su giro, ventanas, escaleras, muebles y la escala. Las dudas quedan resaltadas para que las revises.',
  },
  {
    el: '.tabs',
    title: '3 · Vistas',
    text: 'Vista dual (plano y 3D a la vez), solo el plano 2D o solo el modelo 3D. Los cambios en uno se ven al instante en el otro.',
  },
  {
    el: '.editorbar .tools',
    view: 'split',
    title: '4 · Dibuja y corrige',
    text: 'Seleccionar, muros, rectángulos, puertas, ventanas, medir, Ambiente (para nombrar sala, dormitorio, baño…) y borrar. Al dibujar un muro, escribe su longitud (4.25 o 3<90) y pulsa Intro.',
  },
  {
    el: '.metrics',
    title: '5 · Medidas y cantidades',
    text: 'Longitud de muros, área neta de muro, volumen y área interior, y el área de cada recinto. Se recalculan con cada cambio.',
  },
  {
    el: '#modelpane',
    view: 'split',
    title: '6 · Modelo 3D',
    text: 'Arrastra para girar y usa la rueda para acercarte. «+ Puerta» y «+ Ventana» añaden aberturas con un clic sobre el muro; un clic en un mueble lo selecciona para editarlo.',
  },
  {
    el: '#aiRender',
    view: 'split',
    title: '7 · Foto realista',
    text: 'Convierte la vista 3D en una foto realista con IA y compárala con el modelo deslizando. Sale mejor con la cámara cerca de un ambiente.',
  },
  {
    el: '#walk',
    title: '8 · Recorrido',
    text: 'Camina por dentro a la altura de los ojos con WASD o las flechas. Pulsa P o V para abrir una puerta o una ventana donde miras, y salta entre ambientes.',
  },
  {
    el: '#interiorPanel',
    open: true,
    title: '9 · Diseño de interiores',
    text: 'Estilos (cálido, nórdico, moderno, industrial, mid-century, verde), «Amueblar todo» según las medidas reales, piso y pintura por ambiente, catálogo de muebles y lista de muebles.',
  },
  {
    el: '#aiRow',
    open: '#interiorPanel',
    title: '10 · Crear con IA',
    text: 'Sube fotos de cada cuarto o un video recorriendo la casa y la IA lo reconstruye en 3D amueblado. O describe tu casa («2 dormitorios, 80 m², estilo nórdico») y la creamos. Con el plano subido, las medidas son reales.',
  },
  {
    el: '#aiBar',
    view: 'split',
    title: '11 · Cambia cada cuarto',
    text: 'Escribe o dicta lo que quieres: «paredes verde oscuro», «sofá naranja», «agrega una planta», «reacomoda los muebles». Elige el ambiente a la izquierda o toda la casa.',
  },
  {
    el: '#proPanel',
    open: true,
    title: '12 · Herramientas profesionales',
    text: 'Ejes estructurales y columnas, losa, cerrar uniones y enderezar muros, revisión técnica, cómputos métricos, cuadro de áreas y glosario de obra.',
  },
  {
    el: '.export-buttons',
    openParent: true,
    title: '13 · Exporta',
    text: 'DXF para tu programa de CAD (con ejes, columnas y ambientes), SVG, GLB para 3D, cantidades en CSV e imagen. También tus versiones locales.',
  },
  {
    el: '#share',
    title: '14 · Guarda y comparte',
    text: '«Guardar proyecto» descarga el archivo; «Compartir» crea un enlace para que otra persona vea el proyecto. Tu trabajo también se guarda solo en este navegador.',
  },
  {
    el: '#feedback',
    title: '15 · Cuéntanos qué falta',
    text: 'Estamos en beta. Con «Sugerencias» nos dices qué mejorar, sin crear cuenta. Puedes volver a ver esta guía con «Guía rápida». ¡A diseñar!',
  },
];

let i = 0,
  root = null,
  required = false;

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
  if (e.key === 'Escape') {
    if (!required) close(false);
  } else if (e.key === 'ArrowRight' || e.key === 'Enter')
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
  if (s.open) document.querySelector(typeof s.open === 'string' ? s.open : s.el).open = true;
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

export function openGuide(mustFinish = false) {
  if (!root) build();
  required = mustFinish === true;
  root.classList.toggle('lock', required);
  root.querySelector('.guide-skip').hidden = required;
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

$('guide').onclick = () => openGuide(false);

// First visit: open by itself once the example house is on screen.
let seen = true;
try {
  seen = !!localStorage.getItem(SEEN);
} catch {
  seen = true;
}
if (!seen && !document.querySelector('meta[name=python-engine]'))
  setTimeout(() => openGuide(false), 900);
