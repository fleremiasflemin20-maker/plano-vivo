// Shared state, DOM helpers, history and local persistence.
import { length } from '../geometry.mjs';
import { createViewer } from '../viewer.mjs';
import * as storage from '../storage.mjs';

export const $ = (id) => document.getElementById(id);
export const num = (id) => Number($(id).value);

// Project dimensions in metres, read from the sidebar inputs.
export const W = () => num('width');
export const D = () => num('depth');
export const H = () => num('height');
export const T = () => num('thickness');

export const fmt = (v, d = 2) =>
  v.toLocaleString('es', { maximumFractionDigits: d, minimumFractionDigits: d });
export const uid = () => crypto.randomUUID();
export const say = (s) => ($('status').textContent = s);

/** True when the page is served by the local Python engine (backend/server.py). */
export const localEngine = !!document.querySelector('meta[name=python-engine]');

/**
 * Mutable editor state shared by every UI module.
 * Wall coordinates are normalised to the sheet (0..1); multiply by W()/D() for metres.
 */
export const state = {
  walls: [],
  features: [], // stairs and terraces: { type, x, y, w, h, steps?, axis? }, normalised
  rooms: [],
  bg: null, // HTMLImageElement of the imported plan, if any
  tool: 'wall',
  start: null, // first point of the wall/rectangle/measure being drawn
  hover: null,
  selected: null, // id of the selected wall
  undo: [],
  redo: [],
  measure: null,
  calibration: 0,
  busy: false,
  report: null,
  sourceFile: null, // original uploaded File, sent to the Python engine
  scaleAssumed: false, // true until the user sets the scale; recognition may then set it
  analysis: null,
  worker: null,
  pythonJob: null,
  pythonRun: 0,
  loadEpoch: 0,
};

const MAX_UNDO = 60;

export let viewer;
try {
  viewer = createViewer($('render'), say);
} catch {
  say('No se pudo iniciar el visor 3D. Activa la aceleración gráfica del navegador.');
  viewer = {
    rebuild() {},
    resize() {},
    reset() {},
    walk() {
      return false;
    },
    goTo() {
      return false;
    },
    placeAhead() {},
    setPlacing() {},
    setGhost() {},
    isWalking: () => false,
    setOnPlace() {},
    top() {},
    png() {
      throw Error('WebGL no disponible');
    },
    export() {
      throw Error('WebGL no disponible');
    },
  };
}

/** Serialisable snapshot of the whole project (also the saved JSON format). */
export function project() {
  return {
    version: 2,
    name: $('projectName').value.slice(0, 80),
    width: W(),
    height: H(),
    thickness: T(),
    ratio: D() / W(),
    material: $('material').value,
    floorColor: $('floorMaterial').value,
    walls: structuredClone(state.walls),
    features: structuredClone(state.features),
    image: state.bg?.src || null,
    filename: $('filename').textContent,
    report: state.report,
    analysis: state.analysis,
  };
}

/** Push an undo entry; `entry` defaults to the current project. */
export function checkpoint(entry = project()) {
  state.undo.push(entry);
  if (state.undo.length > MAX_UNDO) state.undo.shift();
  state.redo = [];
  syncHistory();
}

export function syncHistory() {
  $('undo').disabled = !state.undo.length;
  $('redo').disabled = !state.redo.length;
}

let saveTimer;
export function autosave() {
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

/** Store a recoverable local version before a destructive change. */
export async function snapshot() {
  try {
    await storage.version(project());
  } catch {
    say('No se pudo guardar una versión local. Descarga el proyecto para conservar una copia.');
  }
}

export async function confirmChange(title, text) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  const dlg = $('confirmDialog');
  dlg.showModal();
  return await new Promise((resolve) =>
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }),
  );
}

export function addWall(a, b, type = 'wall', props = {}) {
  if (length({ a, b }, W(), D()) < 0.05) return;
  state.walls.push({ id: uid(), a: { ...a }, b: { ...b }, type, ...props });
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
