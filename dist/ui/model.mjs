// Recomputes rooms/quantities, refreshes the 3D model and restores saved projects.
import { quantities, findRooms, validateProject } from '../geometry.mjs';
import {
  $,
  W,
  D,
  H,
  T,
  fmt,
  uid,
  say,
  state,
  viewer,
  syncHistory,
  autosave,
  addWall,
} from './core.mjs';
import { draw, resetPlan, updateInspector } from './plan.mjs';

const FLOOR_COLORS = ['#cfb792', '#d6d8d2', '#c4cbce'];

export function setView(v) {
  $('workspace').className = v;
  document
    .querySelectorAll('[data-view]')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  requestAnimationFrame(() => {
    viewer.resize();
    draw();
  });
}

export function renderModel() {
  viewer.rebuild({
    walls: state.walls,
    W: W(),
    D: D(),
    H: H(),
    T: T(),
    rooms: state.rooms,
    features: state.features,
    image: state.bg,
    material: $('material').value,
    floorColor: $('floorMaterial').value,
    imageFloor: $('imageFloor').checked,
    selected: state.selected,
  });
}

function renderSummary(q) {
  const { walls, rooms, report } = state;
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
}

/** Recompute everything derived from the walls and refresh 2D, 3D and the summary. */
export function rebuild(save = true) {
  state.rooms = findRooms(state.walls, W(), D(), T());
  renderModel();
  renderSummary(quantities(state.walls, W(), D(), H(), T()));
  $('depth').disabled = !!state.bg;
  $('walk').disabled = !state.walls.length;
  updateInspector();
  draw();
  syncHistory();
  if (save) autosave();
}

/** Load a project object (saved JSON, local version or undo entry). */
export async function restore(data, save = true) {
  validateProject(data);
  state.sourceFile = null;
  state.analysis = data.analysis || null;
  let img = state.bg;
  if (data.image !== state.bg?.src) {
    img = null;
    if (data.image) {
      img = new Image();
      img.src = data.image;
      await img.decode();
    }
  }
  state.bg = img;
  state.walls = data.walls.map((w) => ({ ...w, id: w.id || uid() }));
  state.features = (data.features || []).map((f) => ({ ...f, id: f.id || uid() }));
  state.scaleAssumed = false;
  $('width').value = data.width;
  $('depth').value = (data.width * data.ratio).toFixed(5);
  $('height').value = data.height;
  $('thickness').value = data.thickness;
  $('material').value = data.material;
  $('floorMaterial').value = FLOOR_COLORS.includes(data.floorColor)
    ? data.floorColor
    : FLOOR_COLORS[0];
  $('projectName').value = data.name || 'Proyecto importado';
  $('filename').textContent = data.filename || 'Proyecto importado';
  state.report = typeof data.report === 'string' ? data.report : null;
  state.selected = null;
  state.start = null;
  state.measure = null;
  resetPlan();
  rebuild(save);
  viewer.reset();
}

/** Clear the sheet; used by "Nuevo plano", the demo and image imports. */
export function clearProject() {
  state.walls = [];
  state.features = [];
  state.bg = null;
  state.sourceFile = null;
  state.analysis = null;
  state.report = null;
  state.selected = null;
  state.start = null;
}

// Example house, in normalised sheet coordinates [x1, y1, x2, y2].
const DEMO_WALLS = [
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
];
const DEMO_DOORS = [
  [0.48, 0.44, 0.48, 0.55],
  [0.28, 0.53, 0.37, 0.53],
  [0.66, 0.5, 0.75, 0.5],
  [0.48, 0.88, 0.58, 0.88],
];

export function demo() {
  clearProject();
  $('width').value = 12;
  $('depth').value = 9;
  $('height').value = 2.8;
  $('thickness').value = 0.18;
  for (const a of DEMO_WALLS) addWall({ x: a[0], y: a[1] }, { x: a[2], y: a[3] });
  for (const a of DEMO_DOORS) addWall({ x: a[0], y: a[1] }, { x: a[2], y: a[3] }, 'door');
  $('filename').textContent = 'Vivienda de ejemplo · 12 × 9 m';
  $('projectName').value = 'Vivienda de ejemplo';
  resetPlan();
  rebuild();
  viewer.reset();
  say('Ejemplo original conservado. Dibuja, selecciona una pared o construye desde una imagen.');
}

document
  .querySelectorAll('[data-view]')
  .forEach((b) => (b.onclick = () => setView(b.dataset.view)));
