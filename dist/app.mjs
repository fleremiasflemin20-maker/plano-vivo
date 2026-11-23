import {
  clamp,
  length,
  nearest,
  quantities,
  findRooms,
  validateProject,
  toDXF,
} from './geometry.mjs';
import { createViewer } from './viewer.mjs';
import * as storage from './storage.mjs';
const $ = (id) => document.getElementById(id),
  canvas = $('plan'),
  ctx = canvas.getContext('2d'),
  num = (id) => Number($(id).value),
  W = () => num('width'),
  D = () => num('depth'),
  H = () => num('height'),
  T = () => num('thickness'),
  fmt = (v, d = 2) =>
    v.toLocaleString('es', { maximumFractionDigits: d, minimumFractionDigits: d }),
  uid = () => crypto.randomUUID();
let walls = [],
  rooms = [],
  bg = null,
  tool = 'wall',
  start = null,
  hover = null,
  selected = null,
  undo = [],
  redo = [],
  fit = { x: 0, y: 0, w: 1, h: 1 },
  zoom = 1,
  pan = { x: 0, y: 0 },
  drag = null,
  measure = null,
  calibration = 0,
  worker = null,
  busy = false,
  saveTimer,
  loadEpoch = 0,
  report = null;
const localEngine = !!document.querySelector('meta[name=python-engine]');
let sourceFile = null,
  pythonJob = null,
  pythonRun = 0,
  analysis = null;
$('pythonPanel').hidden = !localEngine;
$('exportIFC').hidden = !localEngine;
const say = (s) => ($('status').textContent = s);
let viewer;
try {
  viewer = createViewer($('render'), say);
} catch (e) {
  say('No se pudo iniciar el visor 3D. Activa la aceleración gráfica del navegador.');
  viewer = {
    rebuild() {},
    resize() {},
    reset() {},
    walk() {
      return false;
    },
    top() {},
    png() {
      throw Error('WebGL no disponible');
    },
    export() {
      throw Error('WebGL no disponible');
    },
  };
}
function project() {
  return {
    version: 2,
    name: $('projectName').value.slice(0, 80),
    width: W(),
    height: H(),
    thickness: T(),
    ratio: D() / W(),
    material: $('material').value,
    floorColor: $('floorMaterial').value,
    walls: structuredClone(walls),
    image: bg?.src || null,
    filename: $('filename').textContent,
    report,
    analysis,
  };
}
function checkpoint() {
  undo.push(project());
  if (undo.length > 60) undo.shift();
  redo = [];
  syncHistory();
}
function syncHistory() {
  $('undo').disabled = !undo.length;
  $('redo').disabled = !redo.length;
}
function autosave() {
  clearTimeout(saveTimer);
  $('saveState').textContent = 'Guardando…';
  const data = project();
  saveTimer = setTimeout(
    () =>
      storage
        .write('current', data)
        .then(() => ($('saveState').textContent = 'Guardado en este navegador'))
        .catch(() => ($('saveState').textContent = 'Descarga una copia para guardar')),
    450,
  );
}
async function snapshot() {
  try {
    await storage.version(project());
  } catch {
    say('No se pudo guardar una versión local. Descarga el proyecto para conservar una copia.');
  }
}
async function confirmChange(title, text) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  const dlg = $('confirmDialog');
  dlg.showModal();
  return await new Promise((resolve) =>
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }),
  );
}
function addWall(a, b, type = 'wall', props = {}) {
  if (length({ a, b }, W(), D()) < 0.05) return;
  walls.push({ id: uid(), a: { ...a }, b: { ...b }, type, ...props });
}
function demo() {
  walls = [];
  bg = null;
  sourceFile = null;
  analysis = null;
  report = null;
  $('width').value = 12;
  $('depth').value = 9;
  $('height').value = 2.8;
  $('thickness').value = 0.18;
  for (const a of [
    [0.08, 0.12, 0.92, 0.12],
    [0.92, 0.12, 0.92, 0.88],
    [0.92, 0.88, 0.58, 0.88],
    [0.48, 0.88, 0.08, 0.88],
    [0.08, 0.88, 0.08, 0.12],
    [0.48, 0.12, 0.48, 0.44],
    [0.48, 0.55, 0.48, 0.88],
    [0.48, 0.5, 0.66, 0.5],
    [0.75, 0.5, 0.92, 0.5],
    [0.08, 0.53, 0.28, 0.53],
    [0.37, 0.53, 0.48, 0.53],
  ])
    addWall({ x: a[0], y: a[1] }, { x: a[2], y: a[3] });
  for (const a of [
    [0.48, 0.44, 0.48, 0.55],
    [0.28, 0.53, 0.37, 0.53],
    [0.66, 0.5, 0.75, 0.5],
    [0.48, 0.88, 0.58, 0.88],
  ])
    addWall({ x: a[0], y: a[1] }, { x: a[2], y: a[3] }, 'door');
  $('filename').textContent = 'Vivienda de ejemplo · 12 × 9 m';
  $('projectName').value = 'Vivienda de ejemplo';
  selected = null;
  start = null;
  resetPlan();
  rebuild();
  viewer.reset();
  say('Ejemplo original conservado. Dibuja, selecciona una pared o construye desde una imagen.');
}
function resetPlan() {
  zoom = 1;
  pan = { x: 0, y: 0 };
  draw();
}
function setView(v) {
  $('workspace').className = v;
  document
    .querySelectorAll('[data-view]')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  requestAnimationFrame(() => {
    viewer.resize();
    draw();
  });
}
document
  .querySelectorAll('[data-view]')
  .forEach((b) => (b.onclick = () => setView(b.dataset.view)));
function renderModel() {
  viewer.rebuild({
    walls,
    W: W(),
    D: D(),
    H: H(),
    T: T(),
    rooms,
    image: bg,
    material: $('material').value,
    floorColor: $('floorMaterial').value,
    imageFloor: $('imageFloor').checked,
    selected,
  });
}
function rebuild(save = true) {
  rooms = findRooms(walls, W(), D(), T());
  renderModel();
  const q = quantities(walls, W(), D(), H(), T());
  $('linear').textContent = fmt(q.linear) + ' m';
  $('wallArea').textContent = fmt(q.net) + ' m²';
  $('volume').textContent = fmt(q.volume) + ' m³';
  $('floorArea').textContent = rooms.length
    ? '≈ ' + fmt(rooms.reduce((n, r) => n + r.area, 0)) + ' m²'
    : 'Sin recinto cerrado';
  $('count').textContent =
    walls.filter((w) => w.type === 'wall').length +
    ' paredes · ' +
    q.doors +
    ' puertas · ' +
    q.windows +
    ' ventanas';
  $('dimensions').textContent = fmt(W(), 1) + ' × ' + fmt(D(), 1) + ' m';
  $('roomList').replaceChildren();
  rooms.forEach((r, i) => {
    const el = document.createElement('span');
    el.textContent = 'Recinto ' + (i + 1) + ' · ≈ ' + fmt(r.area) + ' m²';
    $('roomList').appendChild(el);
  });
  $('buildReport').hidden = !report;
  if (report) $('reportText').textContent = report;
  $('depth').disabled = !!bg;
  $('walk').disabled = !walls.length;
  updateInspector();
  draw();
  syncHistory();
  if (save) autosave();
}
function screen(p) {
  return { x: fit.x + p.x * fit.w, y: fit.y + p.y * fit.h };
}
function rawPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - fit.x) / fit.w, y: (e.clientY - r.top - fit.y) / fit.h };
}
function point(e, align = true) {
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
function draw() {
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
  if (bg) {
    ctx.globalAlpha = 0.48;
    ctx.drawImage(bg, fit.x, fit.y, fit.w, fit.h);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#edf3e9';
    for (const room of rooms)
      for (const run of room.runs)
        ctx.fillRect(
          fit.x + run.x * fit.w,
          fit.y + run.y * fit.h,
          run.w * fit.w + 0.3,
          run.h * fit.h + 0.3,
        );
  }
  for (const w of walls) {
    const a = screen(w.a),
      b = screen(w.b),
      dx = b.x - a.x,
      dy = b.y - a.y,
      l = Math.hypot(dx, dy);
    ctx.lineWidth = w.type === 'wall' ? Math.max(2, ((w.thickness || T()) / W()) * fit.w) : 2;
    ctx.strokeStyle =
      w.id === selected
        ? '#188f69'
        : w.inferred && $('review').checked
          ? '#b78b43'
          : w.type === 'door'
            ? '#ad8657'
            : w.type === 'window'
              ? '#579aad'
              : '#416b59';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (w.type === 'door' && l > 2) {
      ctx.lineWidth = 1;
      const angle = Math.atan2(dy, dx);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(a.x, a.y, l, angle, angle - Math.PI / 2, true);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + Math.sin(angle) * l, a.y - Math.cos(angle) * l);
      ctx.stroke();
    }
    if (w.type === 'window' && l > 2) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const offset of [-3, 3]) {
        ctx.moveTo(a.x - (dy / l) * offset, a.y + (dx / l) * offset);
        ctx.lineTo(b.x - (dy / l) * offset, b.y + (dx / l) * offset);
      }
      ctx.stroke();
    }
    if ($('dims').checked) dimension(w);
    if (w.id === selected) {
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
  if ($('showRooms').checked)
    rooms.forEach((room, i) => {
      const p = screen(room.center);
      label('R' + (i + 1) + ' · ≈ ' + fmt(room.area) + ' m²', p.x, p.y);
    });
  if (start) {
    const a = screen(start);
    ctx.fillStyle = '#29996c';
    ctx.beginPath();
    ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (hover) {
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
      $('liveMeasure').textContent =
        tool === 'rectangle'
          ? fmt(Math.abs(hover.x - start.x) * W()) +
            ' × ' +
            fmt(Math.abs(hover.y - start.y) * D()) +
            ' m'
          : fmt(length({ a: start, b: hover }, W(), D())) + ' m';
    }
  } else $('liveMeasure').hidden = true;
  if (measure) {
    const a = screen(measure.a),
      b = screen(measure.b);
    ctx.strokeStyle = '#6655a4';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    label(fmt(length(measure, W(), D())) + ' m', (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, '#6655a4');
  }
  label(fmt(W(), 1) + ' m', fit.x + fit.w / 2, fit.y + fit.h + 22);
}
function setTool(t) {
  tool = t;
  start = null;
  hover = null;
  measure = null;
  if (t !== 'select') selected = null;
  document
    .querySelectorAll('[data-tool]')
    .forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  const hints = {
    wall: 'Dos puntos para una pared · Esc cancela · Mayús alinea',
    rectangle: 'Marca dos esquinas para crear cuatro paredes',
    select: 'Selecciona y arrastra · Extremos para alargar · Supr elimina',
    door: 'Haz clic sobre una pared para insertar una puerta',
    window: 'Haz clic sobre una pared para insertar una ventana',
    measure: 'Marca dos puntos para medir la distancia',
    erase: 'Haz clic sobre el elemento que quieras borrar',
    scale: 'Marca dos puntos cuya distancia real conozcas',
  };
  $('planhelp').textContent = hints[t];
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  updateInspector();
  draw();
}
document
  .querySelectorAll('[data-tool]')
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
function hit(p) {
  let result = null,
    best = Math.max(0.1, (10 / fit.w) * W());
  for (const w of walls) {
    const d = nearest(p, w, W(), D()).d;
    if (d < best) {
      result = w;
      best = d;
    }
  }
  return result;
}
function updateInspector() {
  const w = walls.find((w) => w.id === selected);
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
function moveJoined(original, newA, newB) {
  original = structuredClone(original);
  for (const w of walls)
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
canvas.addEventListener('pointerdown', (e) => {
  if (busy) return;
  canvas.focus();
  if (e.button === 1 || e.altKey) {
    e.preventDefault();
    drag = { kind: 'pan', x: e.clientX, y: e.clientY, pan: { ...pan } };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  const p = point(e, false),
    raw = rawPoint(e);
  if (tool === 'select') {
    const w = hit(raw);
    selected = w?.id || null;
    updateInspector();
    draw();
    renderModel();
    if (w) {
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
        all: structuredClone(walls),
        pointer: raw,
        handle,
        moved: false,
        snapshot: project(),
      };
      canvas.setPointerCapture(e.pointerId);
    }
    return;
  }
  if (tool === 'erase') {
    const w = hit(raw);
    if (w) {
      checkpoint();
      walls = walls.filter((s) => s !== w);
      selected = null;
      rebuild();
    }
    return;
  }
  if (tool === 'door' || tool === 'window') {
    const w = hit(raw);
    if (!w || w.type !== 'wall') {
      say('Selecciona una pared. Puedes ajustar la abertura después con Seleccionar.');
      return;
    }
    const L = length(w, W(), D()),
      size = tool === 'door' ? 0.9 : 1.2;
    if (L < size + 0.1) {
      say('La pared es demasiado corta para esta abertura.');
      return;
    }
    checkpoint();
    const { t: projection } = nearest(raw, w, W(), D()),
      half = size / L / 2,
      t = clamp(projection, half, 1 - half),
      at = (t) => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });
    const before = { ...w, id: uid(), b: at(t - half) },
      opening = { ...w, id: uid(), a: at(t - half), b: at(t + half), type: tool, inferred: false },
      after = { ...w, id: uid(), a: at(t + half) };
    walls.splice(
      walls.indexOf(w),
      1,
      ...[before, opening, after].filter((s) => length(s, W(), D()) > 0.005),
    );
    rebuild();
    return;
  }
  const end = point(e, true);
  if (!start) {
    start = end;
    hover = end;
    draw();
    return;
  }
  if (length({ a: start, b: end }, W(), D()) < 0.05) {
    start = null;
    draw();
    return;
  }
  if (tool === 'scale') {
    calibration = length({ a: start, b: end }, W(), D());
    $('scaleDialog').showModal();
    start = null;
    draw();
    return;
  }
  if (tool === 'measure') {
    measure = { a: start, b: end };
    say('Distancia medida: ' + fmt(length(measure, W(), D())) + ' m');
    start = null;
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
    start = null;
  } else {
    checkpoint();
    addWall(start, end);
    start = $('chain').checked ? end : null;
  }
  rebuild();
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
    if (drag.handle) ((a = drag.handle === 'a' ? raw : a), (b = drag.handle === 'b' ? raw : b));
    else {
      const dx = raw.x - drag.pointer.x,
        dy = raw.y - drag.pointer.y;
      a = { x: o.a.x + dx, y: o.a.y + dy };
      b = { x: o.b.x + dx, y: o.b.y + dy };
    }
    if ([a.x, a.y, b.x, b.y].some((n) => n < 0 || n > 1) || length({ a, b }, W(), D()) < 0.05)
      return;
    walls = structuredClone(drag.all);
    moveJoined(o, a, b);
    drag.moved = true;
    draw();
    renderModel();
    updateInspector();
    return;
  }
  hover = point(e, true);
  if (start) draw();
});
canvas.addEventListener('pointerup', () => {
  if (drag?.kind === 'edit' && drag.moved) {
    undo.push(drag.snapshot);
    redo = [];
    rebuild();
  }
  drag = null;
});
canvas.addEventListener('pointercancel', () => {
  if (drag?.kind === 'edit') {
    walls = drag.all;
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
$('applyElement').onclick = () => {
  const w = walls.find((w) => w.id === selected);
  if (!w) return;
  const l = num('elementLength'),
    angle = (num('elementAngle') * Math.PI) / 180,
    h = num('elementHeight'),
    t = num('elementThickness'),
    x = num('elementX'),
    y = num('elementY'),
    oh = num('openingHeight'),
    sill = $('elementType').value === 'window' ? num('openingSill') : 0;
  if (
    ![l, angle, h, t, x, y, oh, sill].every(Number.isFinite) ||
    l < 0.05 ||
    h < 2 ||
    h > 12 ||
    t < 0.05 ||
    t > 1 ||
    oh <= 0 ||
    sill < 0 ||
    ($('elementType').value !== 'wall' && sill + oh > h)
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
  Object.assign(w, {
    height: h,
    thickness: t,
    type: $('elementType').value,
    openHeight: oh,
    sill,
    inferred: false,
  });
  rebuild();
  say('Medidas actualizadas; se conservaron las uniones compartidas.');
};
$('elementType').onchange = () => {
  $('openingFields').hidden = $('elementType').value === 'wall';
  $('openingSill').disabled = $('elementType').value !== 'window';
  $('openingSill').value = $('elementType').value === 'window' ? 0.9 : 0;
  $('openingHeight').value = $('elementType').value === 'window' ? 1.2 : 2.1;
};
function removeSelected() {
  if (!selected) return;
  checkpoint();
  walls = walls.filter((w) => w.id !== selected);
  selected = null;
  rebuild();
}
$('deleteElement').onclick = removeSelected;
async function restore(data, save = true) {
  validateProject(data);
  sourceFile = null;
  analysis = data.analysis || null;
  let img = bg;
  if (data.image !== bg?.src) {
    img = null;
    if (data.image) {
      img = new Image();
      img.src = data.image;
      await img.decode();
    }
  }
  bg = img;
  walls = data.walls.map((w) => ({ ...w, id: w.id || uid() }));
  $('width').value = data.width;
  $('depth').value = (data.width * data.ratio).toFixed(5);
  $('height').value = data.height;
  $('thickness').value = data.thickness;
  $('material').value = data.material;
  $('floorMaterial').value = ['#cfb792', '#d6d8d2', '#c4cbce'].includes(data.floorColor)
    ? data.floorColor
    : '#cfb792';
  $('projectName').value = data.name || 'Proyecto importado';
  $('filename').textContent = data.filename || 'Proyecto importado';
  report = typeof data.report === 'string' ? data.report : null;
  selected = null;
  start = null;
  measure = null;
  resetPlan();
  rebuild(save);
  viewer.reset();
}
$('undo').onclick = async () => {
  if (!undo.length || busy) return;
  redo.push(project());
  await restore(undo.pop());
  syncHistory();
  say('Cambio deshecho.');
};
$('redo').onclick = async () => {
  if (!redo.length || busy) return;
  undo.push(project());
  await restore(redo.pop());
  syncHistory();
  say('Cambio rehecho.');
};
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input,select,textarea') || document.querySelector('dialog[open]') || busy)
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    $(e.shiftKey ? 'redo' : 'undo').click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    $('save').click();
    return;
  }
  if (e.key === 'Escape') {
    start = null;
    measure = null;
    draw();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removeSelected();
  }
  if (e.key.toLowerCase() === 'v') setTool('select');
  if (e.key.toLowerCase() === 'p') setTool('wall');
  if (e.key.toLowerCase() === 'r') setTool('rectangle');
});
$('fitPlan').onclick = resetPlan;
$('resetcam').onclick = () => viewer.reset();
$('topcam').onclick = () => viewer.top();
$('exitwalk').onclick = () => viewer.reset();
$('walk').onclick = () => {
  if (viewer.walk()) {
    setView('model');
    say('Recorrido activo. Usa WASD o las flechas; arrastra para mirar.');
  }
};
$('calibrate').onclick = () => {
  setView('plan');
  setTool('scale');
  say('Marca una distancia conocida en el plano.');
};
$('scaleDialog').addEventListener('close', () => {
  if ($('scaleDialog').returnValue === 'ok') {
    const factor = num('known') / calibration;
    if (
      factor > 0 &&
      W() * factor >= 1 &&
      W() * factor <= 300 &&
      D() * factor >= 1 &&
      D() * factor <= 300
    ) {
      checkpoint();
      $('width').value = (W() * factor).toFixed(4);
      $('depth').value = (D() * factor).toFixed(4);
      $('scaleHint').textContent = 'Escala calibrada con una distancia conocida.';
      rebuild();
      viewer.reset();
      say('Escala calibrada.');
    } else say('La escala calculada queda fuera del intervalo de 1 a 300 m.');
  }
  setTool('wall');
});
for (const id of ['width', 'depth', 'height', 'thickness']) {
  let previous;
  $(id).addEventListener('focus', () => (previous = project()));
  $(id).addEventListener('change', () => {
    const el = $(id);
    if (!el.checkValidity() || !el.value) {
      say('Introduce una medida dentro del rango permitido.');
      if (previous) restore(previous);
      return;
    }
    if (previous) {
      undo.push(previous);
      redo = [];
      if (id === 'width' && bg) $('depth').value = ((W() * bg.height) / bg.width).toFixed(4);
    }
    rebuild();
    viewer.reset();
  });
}
for (const id of ['material', 'floorMaterial'])
  $(id).onchange = () => {
    rebuild();
  };
for (const id of ['dims', 'showRooms', 'snap', 'ortho', 'chain', 'grid', 'review'])
  $(id).onchange = draw;
$('imageFloor').onchange = renderModel;
$('projectName').onchange = autosave;
async function importFile(file) {
  if (!file || busy) return;
  if (file.size > 20 * 1024 * 1024) {
    say('El archivo supera los 20 MB.');
    return;
  }
  const epoch = ++loadEpoch;
  say('Abriendo plano…');
  try {
    let src;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pdfjs = await import('./vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await pdf.getPage(1),
        base = page.getViewport({ scale: 1 }),
        viewport = page.getViewport({
          scale: Math.min(4, 4096 / Math.max(base.width, base.height)),
        }),
        c = document.createElement('canvas');
      c.width = viewport.width;
      c.height = viewport.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
      src = c.toDataURL();
      await pdf.destroy();
    } else {
      src = await new Promise((res, rej) => {
        const f = new FileReader();
        f.onload = () => res(f.result);
        f.onerror = rej;
        f.readAsDataURL(file);
      });
    }
    let image = new Image();
    image.src = src;
    await image.decode();
    const c = document.createElement('canvas'),
      factor = Math.min(1, 4096 / Math.max(image.width, image.height));
    c.width = Math.max(1, Math.round(image.width * factor));
    c.height = Math.max(1, Math.round(image.height * factor));
    const g = c.getContext('2d');
    g.fillStyle = 'white';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(image, 0, 0, c.width, c.height);
    image = new Image();
    image.src = c.toDataURL('image/png');
    await image.decode();
    if (epoch !== loadEpoch) return;
    if (image.height / image.width < 0.05 || image.height / image.width > 20) throw Error();
    if (
      walls.length &&
      !(await confirmChange(
        'Abrir un nuevo plano',
        'Se guardará una versión local del proyecto actual. El nuevo plano reemplazará el modelo de la mesa de trabajo.',
      ))
    )
      return;
    await snapshot();
    checkpoint();
    bg = image;
    sourceFile = file;
    analysis = null;
    walls = [];
    report = null;
    selected = null;
    start = null;
    $('width').value = 12;
    $('depth').value = ((12 * bg.height) / bg.width).toFixed(4);
    $('filename').textContent = file.name + (file.type === 'application/pdf' ? ' · página 1' : '');
    $('projectName').value = file.name.replace(/\.[^.]+$/, '').slice(0, 80);
    $('scaleHint').textContent =
      'Escala inicial supuesta. Introduce el ancho real o calibra con dos puntos.';
    resetPlan();
    rebuild();
    viewer.reset();
    setView('split');
    if (localEngine) {
      $('pageLabel').hidden = !file.name.toLowerCase().endsWith('.pdf');
      $('pageNumber').value = 1;
      if (!$('pageLabel').hidden) {
        const form = new FormData();
        form.append('file', file);
        try {
          const response = await fetch('/api/inspect', { method: 'POST', body: form });
          if (response.ok) {
            const info = await response.json();
            $('pageNumber').max = info.pages;
            $('filename').textContent = file.name + ' · ' + info.pages + ' páginas';
          }
        } catch {}
      }
    }
    say(
      'Imagen lista. Pulsa Construir en 3D; después revisa la escala y los elementos propuestos.',
    );
  } catch (e) {
    say('No se pudo abrir el archivo. Usa PNG, JPG, WEBP o un PDF sin contraseña.');
  } finally {
    $('file').value = '';
  }
}
$('file').onchange = (e) => importFile(e.target.files[0]);
document.querySelector('.upload').onkeydown = (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('file').click();
  }
};
function setBusy(value) {
  busy = value;
  document.body.classList.toggle('busy', value);
  $('buildProgress').hidden = !value;
  for (const id of [
    'build',
    'load',
    'new',
    'demo',
    'save',
    'undo',
    'redo',
    'calibrate',
    'width',
    'depth',
    'height',
    'thickness',
    'applyElement',
    'deleteElement',
    'versions',
    'file',
    'walk',
    'pageNumber',
  ])
    $(id).disabled = value;
  if (!value) {
    $('depth').disabled = !!bg;
    syncHistory();
    $('walk').disabled = !walls.length;
  }
}
$('cancelBuild').onclick = () => {
  pythonRun++;
  if (pythonJob) fetch('/api/jobs/' + pythonJob + '/cancel', { method: 'POST' }).catch(() => {});
  pythonJob = null;
  worker?.terminate();
  worker = null;
  setBusy(false);
  say('Construcción cancelada. Se conservó el modelo anterior.');
};
$('build').onclick = async () => {
  if (busy) return;
  if (!bg) {
    if (walls.length) {
      viewer.reset();
      setView('model');
      say('Tu plano dibujado ya está construido en 3D. Puedes seguir editándolo en Vista dual.');
    } else say('Sube una imagen o dibuja paredes para construir el modelo.');
    return;
  }
  if (
    walls.length &&
    !(await confirmChange(
      'Reconstruir desde la imagen',
      'Se guardará una versión del modelo actual. La nueva detección reemplazará las paredes; puedes deshacer el cambio.',
    ))
  )
    return;
  await snapshot();
  if (localEngine) {
    await constructPython();
    return;
  }
  setBusy(true);
  $('progress').value = 5;
  $('progressText').textContent = 'Preparando la imagen…';
  const c = document.createElement('canvas'),
    factor = Math.min(1, 4096 / Math.max(bg.width, bg.height));
  c.width = Math.round(bg.width * factor);
  c.height = Math.round(bg.height * factor);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = 'white';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bg, 0, 0, c.width, c.height);
  const pixels = g.getImageData(0, 0, c.width, c.height).data;
  try {
    worker = new Worker('./detect-worker.mjs', { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.progress) {
        $('progress').value = e.data.progress;
        $('progressText').textContent = e.data.message;
        return;
      }
      worker?.terminate();
      worker = null;
      if (e.data.error) {
        setBusy(false);
        say('No se pudo analizar el plano. Puedes dibujar sobre la imagen.');
        return;
      }
      const result = e.data.result;
      if (!result.walls.length) {
        setBusy(false);
        say(result.notes[0]);
        return;
      }
      checkpoint();
      walls = result.walls.map((w) => ({ ...w, id: uid() }));
      selected = null;
      report = result.notes.join(' ');
      rebuild();
      setBusy(false);
      viewer.reset();
      setView('model');
      say(
        'Modelo 3D generado: ' +
          result.stats.segments +
          ' segmentos y ' +
          result.stats.openings +
          ' aberturas propuestas. Revisa la correspondencia con la imagen en Vista dual.',
      );
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      setBusy(false);
      say('El análisis no pudo completarse. El modelo anterior se conserva.');
    };
    worker.postMessage({ pixels, width: c.width, height: c.height, worldWidth: W() }, [
      pixels.buffer,
    ]);
  } catch {
    setBusy(false);
    say('No se pudo iniciar el análisis en este navegador.');
  }
};
$('acceptReview').onclick = () => {
  checkpoint();
  walls.forEach((w) => (w.inferred = false));
  report = null;
  rebuild();
  say('Elementos marcados como revisados por ti.');
};
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('save').onclick = async () => {
  const p = project();
  download(new Blob([JSON.stringify(p)], { type: 'application/json' }), 'plano-vivo.json');
  await snapshot();
  say('Proyecto descargado. Incluye imagen, medidas y geometría.');
};
$('load').onclick = () => $('json').click();
$('json').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 30 * 1024 * 1024) throw Error();
    const data = validateProject(JSON.parse(await file.text()));
    if (
      walls.length &&
      !(await confirmChange(
        'Abrir proyecto',
        'Se guardará una versión local del proyecto actual antes de reemplazarlo.',
      ))
    )
      return;
    await snapshot();
    checkpoint();
    await restore(data);
    say('Proyecto restaurado. También se admiten proyectos de la versión original.');
  } catch {
    say('El archivo no es un proyecto válido de Plano Vivo.');
  } finally {
    $('json').value = '';
  }
};
$('new').onclick = async () => {
  if (
    !(await confirmChange(
      'Crear un plano vacío',
      'Se guardará una versión del proyecto actual. Podrás recuperarla en Versiones locales.',
    ))
  )
    return;
  await snapshot();
  checkpoint();
  walls = [];
  bg = null;
  sourceFile = null;
  analysis = null;
  report = null;
  selected = null;
  start = null;
  $('projectName').value = 'Nuevo proyecto';
  $('filename').textContent = 'Plano vacío · dibuja tu primera pared';
  $('width').value = 12;
  $('depth').value = 9;
  resetPlan();
  rebuild();
  viewer.reset();
  setTool('wall');
  setView('split');
  say('Plano vacío listo. Usa Rectángulo para dibujar un recinto o Pared para comenzar.');
};
$('demo').onclick = async () => {
  if (
    !(await confirmChange(
      'Cargar el ejemplo',
      'Se guardará una versión local de tu proyecto antes de cargar la vivienda de ejemplo.',
    ))
  )
    return;
  await snapshot();
  checkpoint();
  demo();
};
$('versions').onclick = async () => {
  const list = $('versionList');
  list.replaceChildren();
  try {
    const versions = (await storage.read('versions')) || [];
    if (!versions.length)
      list.textContent = 'Todavía no hay versiones. Se crean al guardar, importar o reconstruir.';
    versions.forEach((v) => {
      const b = document.createElement('button');
      b.textContent =
        new Date(v.date).toLocaleString('es') +
        ' · ' +
        (v.project.name || 'Proyecto') +
        ' · ' +
        v.project.walls.length +
        ' elementos';
      b.onclick = async () => {
        try {
          const target = v.project;
          await snapshot();
          checkpoint();
          await restore(target);
          $('versionsDialog').close();
          say('Versión recuperada.');
        } catch {
          say('No se pudo recuperar esta versión.');
        }
      };
      list.appendChild(b);
    });
    $('versionsDialog').showModal();
  } catch {
    say('El almacenamiento local no está disponible en este navegador.');
  }
};
$('closeVersions').onclick = () => $('versionsDialog').close();
$('exportDXF').onclick = () => {
  download(new Blob([toDXF(walls, W(), D())], { type: 'application/dxf' }), 'plano-vivo.dxf');
  say('DXF exportado en metros, con ejes separados en capas MUROS, PUERTAS y VENTANAS.');
};
$('exportSVG').onclick = () => {
  let content =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
    W() +
    ' ' +
    D() +
    '"><rect width="100%" height="100%" fill="white"/>';
  for (const w of walls)
    content +=
      '<line x1="' +
      w.a.x * W() +
      '" y1="' +
      w.a.y * D() +
      '" x2="' +
      w.b.x * W() +
      '" y2="' +
      w.b.y * D() +
      '" stroke="' +
      (w.type === 'wall' ? '#416b59' : w.type === 'door' ? '#ae8550' : '#5295ac') +
      '" stroke-width="' +
      (w.type === 'wall' ? w.thickness || T() : 0.04) +
      '"/>';
  content += '</svg>';
  download(new Blob([content], { type: 'image/svg+xml' }), 'plano-vivo.svg');
};
$('exportCSV').onclick = () => {
  const q = quantities(walls, W(), D(), H(), T()),
    rows = [
      ['Concepto', 'Cantidad', 'Unidad'],
      ['Longitud de muros incluidos vanos', q.linear.toFixed(3), 'm'],
      ['Area bruta de muro una cara', q.gross.toFixed(3), 'm2'],
      ['Area de aberturas', q.open.toFixed(3), 'm2'],
      ['Area neta de muro una cara', q.net.toFixed(3), 'm2'],
      ['Volumen geometrico sin deduplicar encuentros', q.volume.toFixed(3), 'm3'],
      ['Puertas', q.doors, 'ud'],
      ['Ventanas', q.windows, 'ud'],
      ...rooms.map((r, i) => ['Area aproximada recinto ' + (i + 1), r.area.toFixed(3), 'm2']),
      ['NOTA', 'Computo preliminar. No incluye desperdicios, estructura ni normativa.', ''],
    ];
  download(
    new Blob(['\ufeff' + rows.map((row) => row.join(';')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
    'cantidades-plano-vivo.csv',
  );
  say(
    'Cantidades geométricas exportadas. Los encuentros pueden duplicar volumen; no son un presupuesto de obra.',
  );
};
$('exportGLB').onclick = async () => {
  try {
    $('exportGLB').disabled = true;
    const buffer = await viewer.export();
    download(new Blob([buffer], { type: 'model/gltf-binary' }), 'plano-vivo.glb');
    say('Modelo GLB exportado en metros.');
  } catch (e) {
    say('No se pudo exportar el modelo GLB.');
  } finally {
    $('exportGLB').disabled = false;
  }
};
$('exportPNG').onclick = async () => {
  try {
    const a = document.createElement('a');
    a.href = viewer.png();
    a.download = 'plano-vivo-3d.png';
    a.click();
  } catch {
    say('No se pudo capturar el modelo.');
  }
};
new ResizeObserver(() => {
  viewer.resize();
  draw();
}).observe($('workspace'));
try {
  const saved = await storage.read('current');
  if (saved) {
    await restore(saved, false);
    say('Recuperamos tu último proyecto de este navegador.');
  } else demo();
} catch {
  demo();
}
syncHistory();

async function constructPython() {
  const run = ++pythonRun;
  setBusy(true);
  $('progress').value = 2;
  $('progressText').textContent = 'Enviando al motor de este computador…';
  try {
    const original = sourceFile,
      file =
        original ||
        new File([await (await fetch(bg.src)).blob()], 'plano.png', { type: 'image/png' }),
      form = new FormData();
    form.append('file', file);
    form.append('page', String(original ? num('pageNumber') || 1 : 1));
    form.append('width', W());
    form.append('height', H());
    form.append('thickness', T());
    const response = await fetch('/api/jobs', { method: 'POST', body: form });
    if (!response.ok) {
      const error = await response.json();
      throw Error(
        typeof error.detail === 'string'
          ? error.detail
          : 'Revisa el archivo y el número de página.',
      );
    }
    const job = await response.json();
    pythonJob = job.id;
    if (run !== pythonRun) {
      fetch('/api/jobs/' + job.id + '/cancel', { method: 'POST' });
      return;
    }
    while (run === pythonRun) {
      const stateResponse = await fetch('/api/jobs/' + job.id);
      if (!stateResponse.ok) throw Error('No se pudo consultar el análisis.');
      const state = await stateResponse.json();
      if (run !== pythonRun) return;
      $('progress').value = state.progress;
      $('progressText').textContent = state.message;
      if (state.status === 'failed') throw Error(state.message);
      if (state.status === 'cancelled') return;
      if (state.status === 'succeeded') {
        checkpoint();
        const name = $('projectName').value,
          filename = $('filename').textContent;
        await restore({ ...state.result, name, filename });
        sourceFile = original;
        setView('model');
        say(
          'Construcción Python lista: ' +
            state.result.walls.length +
            ' elementos y ' +
            (state.result.analysis.texts?.length || 0) +
            ' textos leídos. Revisa los elementos propuestos.',
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
  } catch (error) {
    if (run === pythonRun)
      say('Motor Python: ' + error.message + ' El modelo anterior se conserva.');
  } finally {
    if (run === pythonRun) {
      pythonJob = null;
      setBusy(false);
    }
  }
}
$('exportIFC').onclick = async () => {
  try {
    $('exportIFC').disabled = true;
    const data = project();
    delete data.image;
    const response = await fetch('/api/export/ifc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw Error();
    download(await response.blob(), 'plano-vivo.ifc');
    say('IFC4 exportado: muros, aberturas y relaciones de puertas y ventanas. Modelo conceptual.');
  } catch {
    say('No se pudo exportar IFC. Comprueba que el motor local está activo.');
  } finally {
    $('exportIFC').disabled = false;
  }
};
