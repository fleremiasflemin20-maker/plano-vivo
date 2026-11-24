// 2D plan canvas: drawing, drawing tools, selection and the element inspector.
import { clamp, length, nearest, FURNITURE } from '../geometry.mjs';
import { roomTitle, roomName, axisName, parseLength, pointAt } from '../pro.mjs';
import {
  $,
  num,
  W,
  D,
  H,
  T,
  fmt,
  uid,
  say,
  state,
  viewer,
  project,
  checkpoint,
  addWall,
} from './core.mjs';
import { rebuild, renderModel } from './model.mjs';

const canvas = $('plan'),
  ctx = canvas.getContext('2d');

// Screen placement of the sheet, plus zoom/pan and the current pointer drag.
let fit = { x: 0, y: 0, w: 1, h: 1 },
  zoom = 1,
  pan = { x: 0, y: 0 },
  drag = null;

const COLORS = {
  selected: '#188f69',
  inferred: '#b78b43',
  door: '#ad8657',
  window: '#579aad',
  wall: '#416b59',
};

const HINTS = {
  wall: 'Dos puntos para una pared · Esc cancela · Mayús alinea',
  rectangle: 'Marca dos esquinas para crear cuatro paredes',
  select: 'Selecciona y arrastra · Extremos para alargar · Supr elimina',
  door: 'Haz clic sobre una pared para insertar una puerta',
  window: 'Haz clic sobre una pared para insertar una ventana',
  measure: 'Marca dos puntos para medir la distancia',
  erase: 'Haz clic sobre el elemento que quieras borrar',
  scale: 'Marca dos puntos cuya distancia real conozcas',
  room: 'Haz clic dentro de un recinto para darle nombre (sala, dormitorio, baño…)',
};

export function resetPlan() {
  zoom = 1;
  pan = { x: 0, y: 0 };
  draw();
}

/** Normalised sheet point -> canvas pixels. */
function screen(p) {
  return { x: fit.x + p.x * fit.w, y: fit.y + p.y * fit.h };
}

/** Pointer event -> normalised sheet point, without snapping. */
function rawPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - fit.x) / fit.w, y: (e.clientY - r.top - fit.y) / fit.h };
}

/** Pointer event -> normalised sheet point with snapping, ortho and fixed length applied. */
function point(e, align = true) {
  const { walls, selected, start, tool } = state;
  let p = rawPoint(e);
  p.x = clamp(p.x, 0, 1);
  p.y = clamp(p.y, 0, 1);
  const tol = (10 / fit.w) * W();
  let anchor = null;
  if ($('snap').checked) {
    let best = tol;
    for (const w of walls)
      if (w.id !== selected || !drag)
        for (const q of [w.a, w.b]) {
          const d = Math.hypot((p.x - q.x) * W(), (p.y - q.y) * D());
          if (d < best) {
            anchor = q;
            best = d;
          }
        }
    if (anchor) p = { ...anchor };
    else {
      const g = num('grid');
      p.x = (Math.round((p.x * W()) / g) * g) / W();
      p.y = (Math.round((p.y * D()) / g) * g) / D();
    }
  }
  if (align && start && tool === 'wall') {
    const dx = (p.x - start.x) * W(),
      dy = (p.y - start.y) * D();
    if ($('ortho').checked || e.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) p.y = start.y;
      else p.x = start.x;
    }
    const fixed = num('fixedLength');
    if (fixed > 0 && fixed <= 100) {
      const l = Math.hypot((p.x - start.x) * W(), (p.y - start.y) * D());
      if (l > 0.001) {
        p.x = start.x + ((p.x - start.x) * fixed) / l;
        p.y = start.y + ((p.y - start.y) * fixed) / l;
      }
    }
  }
  return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
}

function label(text, x, y, color = '#607d69') {
  ctx.font = '11px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  const width = ctx.measureText(text).width;
  ctx.fillStyle = '#ffffffed';
  ctx.fillRect(x - width / 2 - 4, y - 10, width + 8, 15);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
}

function dimension(w) {
  const a = screen(w.a),
    b = screen(w.b),
    dx = b.x - a.x,
    dy = b.y - a.y,
    l = Math.hypot(dx, dy);
  if (l < 42) return;
  const nx = -dy / l,
    ny = dx / l,
    offset = 13;
  ctx.strokeStyle = '#9eb1a5';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * offset, a.y + ny * offset);
  ctx.lineTo(b.x + nx * offset, b.y + ny * offset);
  for (const p of [a, b]) {
    ctx.moveTo(p.x + nx * 9, p.y + ny * 9);
    ctx.lineTo(p.x + nx * 17, p.y + ny * 17);
  }
  ctx.stroke();
  label(fmt(length(w, W(), D())) + ' m', (a.x + b.x) / 2 + nx * 23, (a.y + b.y) / 2 + ny * 23);
}

function drawGrid(r) {
  let step = num('grid');
  while ((step / W()) * fit.w < 12) step *= 2;
  ctx.strokeStyle = '#eef3ef';
  ctx.lineWidth = 0.7;
  for (let x = 0; x <= W(); x += step) {
    const sx = fit.x + (x / W()) * fit.w;
    if (sx < 0 || sx > r.width) continue;
    ctx.beginPath();
    ctx.moveTo(sx, Math.max(0, fit.y));
    ctx.lineTo(sx, Math.min(r.height, fit.y + fit.h));
    ctx.stroke();
  }
  for (let y = 0; y <= D(); y += step) {
    const sy = fit.y + (y / D()) * fit.h;
    if (sy < 0 || sy > r.height) continue;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, fit.x), sy);
    ctx.lineTo(Math.min(r.width, fit.x + fit.w), sy);
    ctx.stroke();
  }
}

function wallColor(w) {
  if (w.id === state.selected) return COLORS.selected;
  if (w.inferred && $('review').checked) return COLORS.inferred;
  return COLORS[w.type] || COLORS.wall;
}

function drawWall(w) {
  const a = screen(w.a),
    b = screen(w.b),
    dx = b.x - a.x,
    dy = b.y - a.y,
    l = Math.hypot(dx, dy);
  ctx.lineWidth = w.type === 'wall' ? Math.max(2, ((w.thickness || T()) / W()) * fit.w) : 2;
  ctx.strokeStyle = wallColor(w);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (w.type === 'door' && l > 2 && !w.passage) {
    // Door leaf and swing arc, hinged at `a`; swing -1 opens to the other side.
    ctx.lineWidth = 1;
    const angle = Math.atan2(dy, dx),
      side = w.swing === -1 ? -1 : 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(a.x, a.y, l, angle, angle - (side * Math.PI) / 2, side === 1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + side * Math.sin(angle) * l, a.y - side * Math.cos(angle) * l);
    ctx.stroke();
  }
  if (w.type === 'window' && l > 2) {
    // Two parallel lines for the glazing.
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const offset of [-3, 3]) {
      ctx.moveTo(a.x - (dy / l) * offset, a.y + (dx / l) * offset);
      ctx.lineTo(b.x - (dy / l) * offset, b.y + (dx / l) * offset);
    }
    ctx.stroke();
  }
  if ($('dims').checked) dimension(w);
  if (w.id === state.selected) {
    for (const p of [a, b]) {
      ctx.fillStyle = 'white';
      ctx.strokeStyle = '#16865c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/**
 * Stairs (treads + climbing arrow), terraces (hatched decking), furniture (outline,
 * thick edge at the head or back, name) and text labels.
 */
function drawFeature(f) {
  const a = screen({ x: f.x, y: f.y }),
    b = screen({ x: f.x + f.w, y: f.y + f.h }),
    w = b.x - a.x,
    h = b.y - a.y;
  ctx.save();
  ctx.lineWidth = 1;
  if (f.type === 'furniture') {
    ctx.fillStyle = '#fbe9d7cc';
    ctx.fillRect(a.x, a.y, w, h);
    ctx.strokeStyle = '#c47a2c';
    ctx.strokeRect(a.x, a.y, w, h);
    if (f.back) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      const [x0, y0, x1, y1] = {
        n: [a.x, a.y, b.x, a.y],
        s: [a.x, b.y, b.x, b.y],
        w: [a.x, a.y, a.x, b.y],
        e: [b.x, a.y, b.x, b.y],
      }[f.back];
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
    if (w > 28 && h > 12)
      label(FURNITURE[f.kind]?.name || 'Mueble', a.x + w / 2, a.y + h / 2 + 4, '#9a5a1c');
    return;
  }
  if (f.type === 'label') {
    if (f.text) {
      ctx.restore();
      label(f.text, a.x + w / 2, a.y + h / 2 + 4, '#7a3f9a');
      return;
    }
    ctx.strokeStyle = '#a05cc0';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(a.x, a.y, w, h);
    ctx.restore();
    return;
  }
  if (f.type === 'terrace') {
    ctx.fillStyle = '#f3ead6';
    ctx.fillRect(a.x, a.y, w, h);
    ctx.beginPath();
    ctx.rect(a.x, a.y, w, h);
    ctx.clip();
    ctx.strokeStyle = '#d4bf94';
    ctx.beginPath();
    for (let k = -h; k < w; k += 9) {
      ctx.moveTo(a.x + k, a.y + h);
      ctx.lineTo(a.x + k + h, a.y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#b39a6a';
    ctx.strokeRect(a.x, a.y, w, h);
    return;
  }
  ctx.fillStyle = '#eeeaf5';
  ctx.fillRect(a.x, a.y, w, h);
  ctx.strokeStyle = '#7b6aa8';
  ctx.strokeRect(a.x, a.y, w, h);
  ctx.beginPath();
  for (let i = 1; i < f.steps; i++) {
    const t = i / f.steps;
    if (f.axis === 'y') {
      ctx.moveTo(a.x, a.y + h * t);
      ctx.lineTo(b.x, a.y + h * t);
    } else {
      ctx.moveTo(a.x + w * t, a.y);
      ctx.lineTo(a.x + w * t, b.y);
    }
  }
  ctx.stroke();
  // Climbing direction, from the first tread to the last.
  const [sx, sy, ex, ey] =
    f.axis === 'y'
      ? [a.x + w / 2, a.y + h * 0.92, a.x + w / 2, a.y + h * 0.08]
      : [a.x + w * 0.08, a.y + h / 2, a.x + w * 0.92, a.y + h / 2];
  const ang = Math.atan2(ey - sy, ex - sx),
    head = Math.min(8, Math.hypot(ex - sx, ey - sy) / 4);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(ang - 0.5), ey - head * Math.sin(ang - 0.5));
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(ang + 0.5), ey - head * Math.sin(ang + 0.5));
  ctx.stroke();
  ctx.restore();
}

/** Preview of the element being drawn, plus the live measurement badge. */
function drawPending() {
  const { start, hover, tool } = state;
  if (!start) {
    $('liveMeasure').hidden = true;
    return;
  }
  const a = screen(start);
  ctx.fillStyle = '#29996c';
  ctx.beginPath();
  ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
  ctx.fill();
  if (!hover) return;
  const b = screen(hover);
  ctx.strokeStyle = '#29996c';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  if (tool === 'rectangle') ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  else {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  $('liveMeasure').hidden = false;
  if (state.typed) {
    $('liveMeasure').textContent = 'Longitud: ' + state.typed + ' ↵';
    return;
  }
  $('liveMeasure').textContent =
    tool === 'rectangle'
      ? fmt(Math.abs(hover.x - start.x) * W()) +
        ' × ' +
        fmt(Math.abs(hover.y - start.y) * D()) +
        ' m'
      : fmt(length({ a: start, b: hover }, W(), D())) + ' m';
}

export function draw() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = devicePixelRatio || 1;
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  const ratio = D() / W(),
    base = Math.max(1, Math.min(r.width - 64, (r.height - 100) / ratio));
  fit = {
    x: (r.width - base * zoom) / 2 + pan.x,
    y: 50 + (r.height - 100 - base * ratio * zoom) / 2 + pan.y,
    w: base * zoom,
    h: base * ratio * zoom,
  };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, r.width, r.height);
  drawGrid(r);
  if (state.bg) {
    ctx.globalAlpha = 0.48;
    ctx.drawImage(state.bg, fit.x, fit.y, fit.w, fit.h);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#edf3e9';
    for (const room of state.rooms)
      for (const run of room.runs)
        ctx.fillRect(
          fit.x + run.x * fit.w,
          fit.y + run.y * fit.h,
          run.w * fit.w + 0.3,
          run.h * fit.h + 0.3,
        );
  }
  for (const f of state.features) drawFeature(f);
  for (const w of state.walls) drawWall(w);
  state.rooms.forEach((room, i) => {
    const named = roomName(room, state.roomTags);
    if (!named && !$('showRooms').checked) return;
    const p = screen(room.center);
    label(
      roomTitle(room, i, state.roomTags) + ' · ' + fmt(room.area) + ' m²',
      p.x,
      p.y,
      named ? '#1f5c45' : undefined,
    );
  });
  drawStructure();
  drawPending();
  if (state.measure) {
    const a = screen(state.measure.a),
      b = screen(state.measure.b);
    ctx.strokeStyle = '#6655a4';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    label(
      fmt(length(state.measure, W(), D())) + ' m',
      (a.x + b.x) / 2,
      (a.y + b.y) / 2 - 12,
      '#6655a4',
    );
  }
  label(fmt(W(), 1) + ' m', fit.x + fit.w / 2, fit.y + fit.h + 22);
  if (state.flash) {
    const p = screen(state.flash);
    ctx.strokeStyle = '#d0402b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Structural axes (dash-dot, with name bubbles) and columns (filled sections). */
function drawStructure() {
  const g = state.grid;
  if (g) {
    ctx.save();
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([10, 3, 2, 3]);
    const bubble = (text, x, y) => {
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 10px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y + 3.5);
      ctx.setLineDash([10, 3, 2, 3]);
    };
    g.xs.forEach((m, i) => {
      const x = fit.x + (m / W()) * fit.w;
      ctx.beginPath();
      ctx.moveTo(x, fit.y - 14);
      ctx.lineTo(x, fit.y + fit.h);
      ctx.stroke();
      bubble(axisName('x', i), x, fit.y - 24);
    });
    g.ys.forEach((m, i) => {
      const y = fit.y + (m / D()) * fit.h;
      ctx.beginPath();
      ctx.moveTo(fit.x - 14, y);
      ctx.lineTo(fit.x + fit.w, y);
      ctx.stroke();
      bubble(axisName('y', i), fit.x - 24, y);
    });
    ctx.restore();
  }
  ctx.fillStyle = '#5b6560';
  for (const c of state.columns) {
    const p = screen(c),
      bw = (c.b / W()) * fit.w,
      bh = (c.h / D()) * fit.h;
    ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
  }
}

export function setTool(t) {
  state.tool = t;
  state.start = null;
  state.hover = null;
  state.measure = null;
  state.typed = '';
  if (t !== 'select') state.selected = null;
  document
    .querySelectorAll('[data-tool]')
    .forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  $('planhelp').textContent = HINTS[t];
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  updateInspector();
  draw();
}

/** Closest wall to a normalised point, within ~10 px. */
function hit(p) {
  let result = null,
    best = Math.max(0.1, (10 / fit.w) * W());
  for (const w of state.walls) {
    const d = nearest(p, w, W(), D()).d;
    if (d < best) {
      result = w;
      best = d;
    }
  }
  return result;
}

export function updateInspector() {
  const w = state.walls.find((w) => w.id === state.selected);
  $('inspector').hidden = !w;
  if (!w) return;
  $('elementType').value = w.type;
  $('elementLength').value = length(w, W(), D()).toFixed(3);
  $('elementAngle').value = (
    (Math.atan2((w.b.y - w.a.y) * D(), (w.b.x - w.a.x) * W()) * 180) /
    Math.PI
  ).toFixed(1);
  $('elementHeight').value = w.height || H();
  $('elementThickness').value = w.thickness || T();
  $('elementX').value = (w.a.x * W()).toFixed(3);
  $('elementY').value = (w.a.y * D()).toFixed(3);
  $('openingFields').hidden = w.type === 'wall';
  $('openingHeight').value = w.openHeight || (w.type === 'window' ? 1.2 : 2.1);
  $('openingSill').value = w.type === 'window' ? (w.sill ?? 0.9) : 0;
  $('openingSill').disabled = w.type !== 'window';
}

/** Move a wall's endpoints and drag along every other wall sharing those endpoints. */
function moveJoined(original, newA, newB) {
  original = structuredClone(original);
  for (const w of state.walls)
    for (const key of ['a', 'b']) {
      for (const [old, updated] of [
        [original.a, newA],
        [original.b, newB],
      ])
        if (Math.hypot(w[key].x - old.x, w[key].y - old.y) < 0.00001) {
          w[key] = { ...updated };
          w.inferred = false;
          break;
        }
    }
}

export function removeSelected() {
  if (!state.selected) return;
  checkpoint();
  state.walls = state.walls.filter((w) => w.id !== state.selected);
  state.selected = null;
  rebuild();
}

/** Escape: abandon the element being drawn and the measurement. */
export function cancelPending() {
  state.start = null;
  state.measure = null;
  state.typed = '';
  state.flash = null;
  draw();
}

/**
 * Keys typed while drawing a wall or a measure: a length (and optional angle) for the
 * next point. Returns true when the key was used.
 */
export function typeKey(e) {
  if (
    !state.start ||
    !['wall', 'measure', 'scale'].includes(state.tool) ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return false;
  if (e.key === 'Enter') {
    const v = parseLength(state.typed);
    if (!state.typed) return false;
    e.preventDefault();
    if (!v) {
      say('Longitud no válida. Ejemplos: 4.25 · 425cm · 3<90 (ángulo en grados).');
      return true;
    }
    const end = pointAt(state.start, v, state.hover, W(), D());
    if (!end || [end.x, end.y].some((n) => n < 0 || n > 1)) {
      say('Ese punto queda fuera de la hoja. Amplía las dimensiones del proyecto.');
      return true;
    }
    placeAt(end);
    return true;
  }
  if (e.key === 'Backspace' && state.typed) {
    e.preventDefault();
    state.typed = state.typed.slice(0, -1);
    draw();
    return true;
  }
  if (/^[0-9.,<@cmM-]$/.test(e.key) && (state.typed || /[0-9.,]/.test(e.key))) {
    e.preventDefault();
    state.typed = (state.typed + e.key).slice(0, 16);
    draw();
    return true;
  }
  return false;
}

// --- Pointer tools -------------------------------------------------------

function startSelect(e, raw) {
  const w = hit(raw);
  state.selected = w?.id || null;
  updateInspector();
  draw();
  renderModel();
  if (!w) return;
  const a = screen(w.a),
    b = screen(w.b),
    r = canvas.getBoundingClientRect(),
    x = e.clientX - r.left,
    y = e.clientY - r.top;
  const handle =
    Math.hypot(x - a.x, y - a.y) < 12 ? 'a' : Math.hypot(x - b.x, y - b.y) < 12 ? 'b' : null;
  drag = {
    kind: 'edit',
    original: structuredClone(w),
    all: structuredClone(state.walls),
    pointer: raw,
    handle,
    moved: false,
    snapshot: project(),
  };
  canvas.setPointerCapture(e.pointerId);
}

function erase(raw) {
  const w = hit(raw);
  if (w) {
    checkpoint();
    state.walls = state.walls.filter((s) => s !== w);
    state.selected = null;
    rebuild();
    return;
  }
  // No wall under the pointer: remove the smallest element there (a piece of
  // furniture or a text before the terrace it stands on).
  const f = state.features
    .filter((f) => raw.x >= f.x && raw.x <= f.x + f.w && raw.y >= f.y && raw.y <= f.y + f.h)
    .sort((p, q) => p.w * p.h - q.w * q.h)[0];
  if (!f) return;
  checkpoint();
  state.features = state.features.filter((s) => s !== f);
  rebuild();
}

/** Split a wall into wall + opening + wall around the clicked point. */
export function insertOpening(raw, type, wall = hit(raw)) {
  const w = wall;
  if (!w || w.type !== 'wall') {
    say(
      w
        ? 'Ahí ya hay una abertura. Elige una parte de la pared sin puerta ni ventana.'
        : 'Selecciona una pared. Puedes ajustar la abertura después con Seleccionar.',
    );
    return false;
  }
  const L = length(w, W(), D()),
    size = type === 'door' ? 0.9 : 1.2;
  if (L < size + 0.1) {
    say('La pared es demasiado corta para esta abertura.');
    return false;
  }
  checkpoint();
  const { t: projection } = nearest(raw, w, W(), D()),
    half = size / L / 2,
    t = clamp(projection, half, 1 - half),
    at = (t) => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });
  const before = { ...w, id: uid(), b: at(t - half) },
    opening = { ...w, id: uid(), a: at(t - half), b: at(t + half), type, inferred: false },
    after = { ...w, id: uid(), a: at(t + half) };
  state.walls.splice(
    state.walls.indexOf(w),
    1,
    ...[before, opening, after].filter((s) => length(s, W(), D()) > 0.005),
  );
  rebuild();
  return true;
}

/** Two-click tools: wall, rectangle, measure and scale. */
function placePoint(e) {
  placeAt(point(e, true));
}

function placeAt(end) {
  const { start, tool } = state;
  state.typed = '';
  if (!start) {
    state.start = end;
    state.hover = end;
    draw();
    return;
  }
  if (length({ a: start, b: end }, W(), D()) < 0.05) {
    state.start = null;
    draw();
    return;
  }
  if (tool === 'scale') {
    state.calibration = length({ a: start, b: end }, W(), D());
    $('scaleDialog').showModal();
    state.start = null;
    draw();
    return;
  }
  if (tool === 'measure') {
    state.measure = { a: start, b: end };
    say('Distancia medida: ' + fmt(length(state.measure, W(), D())) + ' m');
    state.start = null;
    draw();
    return;
  }
  if (tool === 'rectangle') {
    if (Math.abs(end.x - start.x) * W() < 0.1 || Math.abs(end.y - start.y) * D() < 0.1) {
      say('El rectángulo necesita ancho y fondo de al menos 10 cm.');
      return;
    }
    checkpoint();
    const p2 = { x: end.x, y: start.y },
      p4 = { x: start.x, y: end.y };
    addWall(start, p2);
    addWall(p2, end);
    addWall(end, p4);
    addWall(p4, start);
    state.start = null;
  } else {
    checkpoint();
    addWall(start, end);
    state.start = $('chain').checked ? end : null;
  }
  rebuild();
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.busy) return;
  canvas.focus();
  if (e.button === 1 || e.altKey) {
    e.preventDefault();
    drag = { kind: 'pan', x: e.clientX, y: e.clientY, pan: { ...pan } };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  const raw = rawPoint(e),
    { tool } = state;
  if (tool === 'select') startSelect(e, raw);
  else if (tool === 'erase') erase(raw);
  else if (tool === 'door' || tool === 'window') insertOpening(raw, tool);
  else if (tool === 'room') canvas.dispatchEvent(new CustomEvent('roompick', { detail: raw }));
  else placePoint(e);
});

canvas.addEventListener('pointermove', (e) => {
  if (drag?.kind === 'pan') {
    pan.x = drag.pan.x + e.clientX - drag.x;
    pan.y = drag.pan.y + e.clientY - drag.y;
    draw();
    return;
  }
  if (drag?.kind === 'edit') {
    const raw = point(e, false),
      o = drag.original;
    let a = { ...o.a },
      b = { ...o.b };
    if (drag.handle) {
      if (drag.handle === 'a') a = raw;
      else b = raw;
    } else {
      const dx = raw.x - drag.pointer.x,
        dy = raw.y - drag.pointer.y;
      a = { x: o.a.x + dx, y: o.a.y + dy };
      b = { x: o.b.x + dx, y: o.b.y + dy };
    }
    if ([a.x, a.y, b.x, b.y].some((n) => n < 0 || n > 1) || length({ a, b }, W(), D()) < 0.05)
      return;
    state.walls = structuredClone(drag.all);
    moveJoined(o, a, b);
    drag.moved = true;
    draw();
    renderModel();
    updateInspector();
    return;
  }
  state.hover = point(e, true);
  if (state.start) draw();
});

canvas.addEventListener('pointerup', () => {
  if (drag?.kind === 'edit' && drag.moved) {
    checkpoint(drag.snapshot);
    rebuild();
  }
  drag = null;
});

canvas.addEventListener('pointercancel', () => {
  if (drag?.kind === 'edit') {
    state.walls = drag.all;
    rebuild(false);
  }
  drag = null;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top,
      old = zoom,
      next = clamp(old * Math.exp(-e.deltaY * 0.001), 0.5, 8),
      factor = next / old;
    pan.x = (pan.x + r.width / 2 - x) * factor - r.width / 2 + x;
    pan.y = (pan.y + r.height / 2 - y) * factor - r.height / 2 + y;
    zoom = next;
    draw();
  },
  { passive: false },
);

document
  .querySelectorAll('[data-tool]')
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));

// --- Inspector -----------------------------------------------------------

$('applyElement').onclick = () => {
  const w = state.walls.find((w) => w.id === state.selected);
  if (!w) return;
  const type = $('elementType').value,
    l = num('elementLength'),
    angle = (num('elementAngle') * Math.PI) / 180,
    h = num('elementHeight'),
    t = num('elementThickness'),
    x = num('elementX'),
    y = num('elementY'),
    oh = num('openingHeight'),
    sill = type === 'window' ? num('openingSill') : 0;
  if (
    ![l, angle, h, t, x, y, oh, sill].every(Number.isFinite) ||
    l < 0.05 ||
    h < 2 ||
    h > 12 ||
    t < 0.05 ||
    t > 1 ||
    oh <= 0 ||
    sill < 0 ||
    (type !== 'wall' && sill + oh > h)
  ) {
    say('Revisa las medidas. La abertura debe caber dentro de la altura del muro.');
    return;
  }
  const a = { x: x / W(), y: y / D() },
    b = { x: (x + Math.cos(angle) * l) / W(), y: (y + Math.sin(angle) * l) / D() };
  if ([a.x, a.y, b.x, b.y].some((n) => n < 0 || n > 1)) {
    say('El elemento quedaría fuera de la hoja. Amplía las dimensiones del proyecto.');
    return;
  }
  checkpoint();
  moveJoined(w, a, b);
  Object.assign(w, { height: h, thickness: t, type, openHeight: oh, sill, inferred: false });
  rebuild();
  say('Medidas actualizadas; se conservaron las uniones compartidas.');
};

$('elementType').onchange = () => {
  const type = $('elementType').value;
  $('openingFields').hidden = type === 'wall';
  $('openingSill').disabled = type !== 'window';
  $('openingSill').value = type === 'window' ? 0.9 : 0;
  $('openingHeight').value = type === 'window' ? 1.2 : 2.1;
};

$('deleteElement').onclick = removeSelected;

// --- Scale calibration ---------------------------------------------------

$('scaleDialog').addEventListener('close', () => {
  if ($('scaleDialog').returnValue === 'ok') {
    const factor = num('known') / state.calibration;
    const inRange = (v) => v >= 1 && v <= 300;
    if (factor > 0 && inRange(W() * factor) && inRange(D() * factor)) {
      checkpoint();
      $('width').value = (W() * factor).toFixed(4);
      $('depth').value = (D() * factor).toFixed(4);
      $('scaleHint').textContent = 'Escala calibrada con una distancia conocida.';
      state.scaleAssumed = false;
      rebuild();
      viewer.reset();
      say('Escala calibrada.');
    } else say('La escala calculada queda fuera del intervalo de 1 a 300 m.');
  }
  setTool('wall');
});
