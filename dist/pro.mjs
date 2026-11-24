// Professional tools (pure logic, no DOM): room types, typed lengths, structural grid and
// columns, quantity take-off, technical review and geometry fixes.
// Coordinates: walls, columns and room tags are normalised to the sheet (0..1); W and D are
// the sheet size in metres. Grid positions are in metres from the sheet's top-left corner.
import { length, nearest } from './geometry.mjs';

// --- Room types ----------------------------------------------------------------------
/**
 * Common room names with reference values for the review: minimum area (m²) and whether
 * the room normally needs a window. They are general design references, not a building
 * code: always check the local regulations (ordenanza municipal, NEC, etc.).
 */
export const ROOM_TYPES = [
  { name: 'Sala', min: 10, light: true },
  { name: 'Comedor', min: 7, light: true },
  { name: 'Sala-comedor', min: 15, light: true },
  { name: 'Cocina', min: 5, light: true },
  { name: 'Dormitorio principal', min: 9, light: true },
  { name: 'Dormitorio', min: 7, light: true },
  { name: 'Estudio', min: 6, light: true },
  { name: 'Baño', min: 2.5, light: false },
  { name: 'Medio baño', min: 1.2, light: false },
  { name: 'Lavandería', min: 2.5, light: false },
  { name: 'Circulación', min: 0, light: false },
  { name: 'Vestíbulo', min: 0, light: false },
  { name: 'Bodega', min: 0, light: false },
  { name: 'Garaje', min: 15, light: false },
  { name: 'Oficina', min: 9, light: true },
  { name: 'Local comercial', min: 12, light: true },
  { name: 'Balcón', min: 0, light: false },
  { name: 'Terraza', min: 0, light: false },
];
export const roomType = (name) => ROOM_TYPES.find((t) => t.name === name) || null;

export function inRoom(p, room) {
  return room.runs.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
}

/** Name of a room: the tag (a named point) that falls inside it, or null. */
export function roomName(room, tags = []) {
  return tags.find((t) => inRoom(t, room))?.name || null;
}

/** Room number (from 1) and name, as shown in lists: "R2 · Cocina". */
export function roomTitle(room, i, tags) {
  const n = roomName(room, tags);
  return 'R' + (i + 1) + (n ? ' · ' + n : '');
}

// --- Typed lengths --------------------------------------------------------------------
/**
 * Length typed while drawing: "4.25", "4,25", "425cm", "4250mm", optionally with an angle
 * in degrees ("4.25<90" or "4.25@90", 0° = right, 90° = up). Returns null if invalid.
 */
export function parseLength(text) {
  const m = String(text)
    .trim()
    .toLowerCase()
    .replace(',', '.')
    .match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:[<@]\s*(-?\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const len = Number(m[1]) / ({ mm: 1000, cm: 100 }[m[2]] || 1);
  if (!(len > 0 && len <= 300)) return null;
  return { length: len, angle: m[3] == null ? null : Number(m[3]) };
}

/** End point of a wall from `start` with `length` m, following `toward` or an angle. */
export function pointAt(start, { length: len, angle }, toward, W, D) {
  let ux, uy;
  if (angle != null) {
    const r = (angle * Math.PI) / 180;
    ux = Math.cos(r);
    uy = -Math.sin(r); // the sheet's y grows downwards
  } else {
    const dx = ((toward?.x ?? start.x + 1) - start.x) * W,
      dy = ((toward?.y ?? start.y) - start.y) * D,
      l = Math.hypot(dx, dy);
    if (l < 1e-9) return null;
    ux = dx / l;
    uy = dy / l;
  }
  return { x: start.x + (ux * len) / W, y: start.y + (uy * len) / D };
}

// --- Structural grid and columns -------------------------------------------------------
/** "4, 3.5, 4" -> [4, 3.5, 4]; empty -> []. Null if any value is invalid. */
export function parseSpans(text) {
  const parts = String(text || '')
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const v = parts.map((s) => Number(s.replace(',', '.')));
  return v.every((n) => Number.isFinite(n) && n > 0 && n <= 50) && v.length <= 30 ? v : null;
}

/** Axis positions (m) from an origin and the spans between axes. */
export function axisPositions(origin, spans) {
  const out = [origin];
  for (const s of spans) out.push(out.at(-1) + s);
  return out;
}

/** Axis names: numbers along x (1, 2, 3…), letters along y (A, B, C…, then AA, AB…). */
export function axisName(kind, i) {
  if (kind === 'x') return String(i + 1);
  let s = '',
    n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Columns (b × h m) at every grid intersection inside the sheet. */
export function columnsAtGrid(grid, b, h, W, D) {
  const out = [];
  for (const x of grid.xs)
    for (const y of grid.ys)
      if (x >= b / 2 && x <= W - b / 2 && y >= h / 2 && y <= D - h / 2)
        out.push({ x: x / W, y: y / D, b, h });
  return out;
}

// --- Quantity take-off ----------------------------------------------------------------
/** Reference yields; the user can change them in the take-off dialog. */
export const FACTORS = {
  blocksPerM2: 12.5, // bloque 40 × 20 cm con junta de 1 cm
  layMortar: 0.012, // m³ de mortero de pega por m² de mampostería
  plaster: 0.015, // espesor del enlucido (m), por cara
  subfloor: 0.08, // espesor del contrapiso (m)
  steelColumns: 120, // kg de acero por m³ de hormigón en columnas (referencial)
  steelSlab: 90, // kg de acero por m³ de hormigón en losa (referencial)
};

/** Opening area of a door or window segment (m²). */
function openingArea(w, W, D, H) {
  const l = length(w, W, D),
    h = w.height || H;
  if (w.type === 'door') return l * Math.min(h, w.openHeight || 2.1);
  if (w.type === 'window')
    return l * Math.min(Math.max(0, h - (w.sill ?? 0.9)), w.openHeight || 1.2);
  return 0;
}

/**
 * Preliminary take-off. Returns rows { group, item, qty, unit }. Masonry counts walls and
 * subtracts doors and windows; junctions are not deducted, so lengths are slightly high.
 */
export function takeoff({
  walls,
  rooms,
  columns = [],
  slab = null,
  W,
  D,
  H,
  T,
  factors = FACTORS,
}) {
  const f = { ...FACTORS, ...factors };
  let lengthAll = 0,
    gross = 0,
    open = 0,
    volume = 0,
    doors = 0,
    windows = 0,
    lintel = 0;
  for (const w of walls) {
    const l = length(w, W, D),
      h = w.height || H,
      t = w.thickness || T,
      hole = openingArea(w, W, D, H);
    lengthAll += l;
    gross += l * h;
    open += hole;
    volume += (l * h - hole) * t;
    if (w.type === 'door') doors++;
    if (w.type === 'window') windows++;
    if (w.type !== 'wall') lintel += l + 0.4; // dintel: vano + 20 cm de apoyo por lado
  }
  const net = Math.max(0, gross - open),
    floor = rooms.reduce((n, r) => n + r.area, 0),
    colVolume = columns.reduce((n, c) => n + c.b * c.h * H, 0),
    footprint = floor + volume / H, // interior + huella de muros
    slabVolume = slab?.thickness ? footprint * slab.thickness : 0;
  const rows = [
    ['Mampostería', 'Longitud de muros (incluye vanos)', lengthAll, 'm'],
    ['Mampostería', 'Área neta de mampostería (una cara, sin vanos)', net, 'm²'],
    ['Mampostería', 'Bloques', Math.ceil(net * f.blocksPerM2), 'u'],
    ['Mampostería', 'Mortero de pega', net * f.layMortar, 'm³'],
    ['Mampostería', 'Dinteles (vano + 0,20 m por lado)', lintel, 'm'],
    ['Acabados', 'Enlucido (dos caras)', net * 2, 'm²'],
    ['Acabados', 'Mortero de enlucido', net * 2 * f.plaster, 'm³'],
    ['Acabados', 'Pintura (dos caras)', net * 2, 'm²'],
    ['Acabados', 'Piso interior', floor, 'm²'],
    ['Acabados', 'Contrapiso', floor * f.subfloor, 'm³'],
    ['Carpintería', 'Puertas', doors, 'u'],
    ['Carpintería', 'Ventanas', windows, 'u'],
    ['Carpintería', 'Área de vanos', open, 'm²'],
  ];
  if (columns.length)
    rows.push(
      ['Estructura', 'Columnas', columns.length, 'u'],
      ['Estructura', 'Hormigón en columnas', colVolume, 'm³'],
      ['Estructura', 'Acero en columnas (referencial)', colVolume * f.steelColumns, 'kg'],
    );
  if (slabVolume)
    rows.push(
      ['Estructura', 'Área de losa (interior + muros)', footprint, 'm²'],
      ['Estructura', 'Hormigón en losa', slabVolume, 'm³'],
      ['Estructura', 'Acero en losa (referencial)', slabVolume * f.steelSlab, 'kg'],
    );
  return rows.map(([group, item, qty, unit]) => ({ group, item, qty, unit }));
}

/** Area (m²) of each named room, for the area table (cuadro de áreas). */
export function areaTable(rooms, tags) {
  return rooms.map((r, i) => ({
    id: 'R' + (i + 1),
    name: roomName(r, tags) || 'Sin nombre',
    area: r.area,
  }));
}

// --- Technical review --------------------------------------------------------------------
const ends = (w) => [w.a, w.b];
const close = (p, q, W, D) => Math.hypot((p.x - q.x) * W, (p.y - q.y) * D);
const angleDeg = (w, W, D) =>
  (Math.atan2((w.b.y - w.a.y) * D, (w.b.x - w.a.x) * W) * 180) / Math.PI;
/** Deviation (deg) from the nearest of 0°/90°/180°/270°. */
function offAxis(w, W, D) {
  const a = ((angleDeg(w, W, D) % 90) + 90) % 90;
  return Math.min(a, 90 - a);
}

/** Wall ends that touch nothing (no other wall's end or body within 5 mm). */
function looseEnds(walls, W, D) {
  const out = [];
  for (const w of walls)
    for (const key of ['a', 'b']) {
      const p = w[key];
      const touches = walls.some((o) => o !== w && nearest(p, o, W, D).d < 0.005);
      if (!touches) out.push({ wall: w, key, p });
    }
  return out;
}

/** Point on the room side of an opening: its midpoint pushed `d` m along either normal. */
function sides(w, W, D, d) {
  const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 },
    dx = (w.b.x - w.a.x) * W,
    dy = (w.b.y - w.a.y) * D,
    l = Math.hypot(dx, dy) || 1;
  return [1, -1].map((s) => ({ x: m.x + (s * -dy * d) / l / W, y: m.y + (s * dx * d) / l / D }));
}

/**
 * Review of the drawing. Findings: { level: 'error' | 'aviso' | 'info', topic, text, at? }.
 * `at` is a normalised point to show on the plan.
 */
export function review({ walls, rooms, tags = [], features = [], W, D, H, T }) {
  const out = [];
  const add = (level, topic, text, at) => out.push({ level, topic, text, at });
  // Geometry precision
  const loose = looseEnds(walls, W, D);
  for (const e of loose) {
    const gap = Math.min(
      ...walls.filter((o) => o !== e.wall).map((o) => nearest(e.p, o, W, D).d),
      Infinity,
    );
    if (gap < 0.15)
      add(
        'aviso',
        'Uniones',
        `Unión abierta de ${(gap * 100).toFixed(1)} cm entre muros: usa «Cerrar uniones».`,
        e.p,
      );
  }
  for (const w of walls) {
    const l = length(w, W, D);
    if (w.type === 'wall' && l < 0.1)
      add(
        'aviso',
        'Muros',
        `Muro muy corto (${(l * 100).toFixed(0)} cm): puede ser un resto del dibujo.`,
        w.a,
      );
    const dev = offAxis(w, W, D);
    if (dev > 0.05 && dev < 3)
      add(
        'info',
        'Muros',
        `Muro desviado ${dev.toFixed(1)}° de la escuadra: usa «Enderezar muros» si debía ser recto.`,
        w.a,
      );
    if (w.type === 'door' && !w.passage && l < 0.7)
      add(
        'aviso',
        'Puertas',
        `Puerta de ${(l * 100).toFixed(0)} cm: por debajo de 70 cm cuesta el paso (accesibilidad recomienda 90 cm).`,
        w.a,
      );
    if (w.type === 'window' && (w.sill ?? 0.9) + (w.openHeight || 1.2) > (w.height || H))
      add('error', 'Ventanas', 'La ventana no cabe en la altura del muro.', w.a);
  }
  // Rooms
  const near = (T || 0.15) / 2 + 0.25;
  rooms.forEach((room, i) => {
    const name = roomName(room, tags),
      type = roomType(name),
      title = 'R' + (i + 1) + (name ? ' (' + name + ')' : '');
    const touching = (kind) =>
      walls.some((w) => w.type === kind && sides(w, W, D, near).some((p) => inRoom(p, room)));
    if (!touching('door'))
      add('aviso', 'Recintos', `${title}: no tiene puerta. Revisa el acceso.`, room.center);
    if (type?.light && !touching('window'))
      add(
        'aviso',
        'Recintos',
        `${title}: sin ventana. Necesita luz y ventilación natural.`,
        room.center,
      );
    if (type?.min && room.area < type.min)
      add(
        'aviso',
        'Recintos',
        `${title}: ${room.area.toFixed(1)} m², por debajo de la referencia de ${type.min} m² para ${type.name.toLowerCase()}.`,
        room.center,
      );
    if (!name)
      add(
        'info',
        'Recintos',
        `${title}: sin nombre. Nómbralo para el cuadro de áreas.`,
        room.center,
      );
  });
  // Stairs: Blondel's rule 2C + H = 60–65 cm, riser C ≤ 18 cm, tread H ≥ 25 cm.
  for (const f of features.filter((f) => f.type === 'stair')) {
    const run = (f.axis === 'y' ? f.h * D : f.w * W) / f.steps,
      rise = H / (f.steps + 1),
      b = 2 * rise + run;
    if (rise > 0.18 || run < 0.25 || b < 0.6 || b > 0.65)
      add(
        'aviso',
        'Escaleras',
        `Escalera de ${f.steps} huellas: huella ${(run * 100).toFixed(1)} cm, contrahuella ${(rise * 100).toFixed(1)} cm, 2C + H = ${(b * 100).toFixed(1)} cm (recomendado 60–65).`,
        { x: f.x + f.w / 2, y: f.y + f.h / 2 },
      );
  }
  const rank = { error: 0, aviso: 1, info: 2 };
  return out.sort((p, q) => rank[p.level] - rank[q.level]);
}

// --- Geometry fixes ------------------------------------------------------------------
/** Move every wall end equal to `from` (within 1e-6) to `to`. */
function moveEnd(walls, from, to) {
  for (const w of walls)
    for (const key of ['a', 'b'])
      if (Math.abs(w[key].x - from.x) < 1e-6 && Math.abs(w[key].y - from.y) < 1e-6)
        w[key] = { ...to };
}

/**
 * Close small gaps: a loose wall end within `tol` m of another wall moves onto that wall's
 * nearest end (if within tol) or onto its body (T junction). Returns { walls, fixed }.
 */
export function closeJoints(walls, W, D, tol = 0.15) {
  const out = structuredClone(walls);
  let fixed = 0;
  for (const e of looseEnds(out, W, D)) {
    const p = e.wall[e.key];
    let best = null;
    for (const o of out) {
      if (o === e.wall) continue;
      for (const q of ends(o)) {
        const d = close(p, q, W, D);
        if (d < tol && (!best || d < best.d - 1e-9)) best = { d, to: { ...q }, end: true };
      }
    }
    if (!best)
      for (const o of out) {
        if (o === e.wall || o.type !== 'wall') continue;
        const n = nearest(p, o, W, D);
        if (n.d < tol && (!best || n.d < best.d)) best = { d: n.d, to: n.p };
      }
    if (
      best &&
      best.d > 1e-6 &&
      length({ a: e.wall[e.key === 'a' ? 'b' : 'a'], b: best.to }, W, D) > 0.05
    ) {
      moveEnd(out, { ...p }, best.to);
      fixed++;
    }
  }
  return { walls: out, fixed };
}

/**
 * Straighten walls that are within `maxDeg` of horizontal or vertical, keeping shared
 * ends joined. Returns { walls, fixed }.
 */
export function straighten(walls, W, D, maxDeg = 3) {
  const out = structuredClone(walls);
  let fixed = 0;
  for (const w of out) {
    const dev = offAxis(w, W, D);
    if (dev < 1e-3 || dev >= maxDeg) continue;
    const horizontal = Math.abs((w.b.x - w.a.x) * W) >= Math.abs((w.b.y - w.a.y) * D);
    const a = { ...w.a },
      b = { ...w.b };
    if (horizontal) {
      const y = (a.y + b.y) / 2;
      moveEnd(out, a, { x: a.x, y });
      moveEnd(out, b, { x: b.x, y });
    } else {
      const x = (a.x + b.x) / 2;
      moveEnd(out, a, { x, y: a.y });
      moveEnd(out, b, { x, y: b.y });
    }
    fixed++;
  }
  return { walls: out, fixed };
}

// --- Validation of the saved professional data ------------------------------------------
export function validatePro(d) {
  const fin = (n, a, b) => Number.isFinite(n) && n >= a && n <= b;
  if (d.roomTags != null) {
    if (!Array.isArray(d.roomTags) || d.roomTags.length > 200) throw Error('Nombres no válidos');
    for (const t of d.roomTags)
      if (
        !fin(t?.x, 0, 1) ||
        !fin(t?.y, 0, 1) ||
        typeof t.name !== 'string' ||
        !t.name.trim() ||
        t.name.length > 40
      )
        throw Error('Nombres no válidos');
  }
  if (d.grid != null) {
    const ok = (a) => Array.isArray(a) && a.length <= 31 && a.every((n) => fin(n, -1, 301));
    if (!ok(d.grid.xs) || !ok(d.grid.ys)) throw Error('Ejes no válidos');
  }
  if (d.columns != null) {
    if (!Array.isArray(d.columns) || d.columns.length > 1000) throw Error('Columnas no válidas');
    for (const c of d.columns)
      if (!fin(c?.x, 0, 1) || !fin(c?.y, 0, 1) || !fin(c.b, 0.1, 3) || !fin(c.h, 0.1, 3))
        throw Error('Columnas no válidas');
  }
  if (d.slab != null && (!fin(d.slab.thickness, 0.05, 0.6) || typeof d.slab.show !== 'boolean'))
    throw Error('Losa no válida');
  return d;
}

// --- Glossary --------------------------------------------------------------------------
export const GLOSSARY = [
  [
    'Muro',
    'Elemento vertical que cierra o divide espacios. Puede ser portante (carga) o de cierre.',
  ],
  ['Mampostería', 'Muro hecho de piezas (bloque, ladrillo) unidas con mortero de pega.'],
  ['Vano', 'Hueco en un muro para una puerta o una ventana.'],
  ['Antepecho', 'Parte del muro bajo una ventana; su altura es la del alféizar.'],
  ['Dintel', 'Elemento sobre un vano que soporta el muro de encima.'],
  ['Luz', 'Distancia libre entre apoyos, por ejemplo entre dos columnas o dos ejes.'],
  [
    'Eje',
    'Línea de referencia del proyecto. Se nombran con números en un sentido y letras en el otro (1, 2, 3 / A, B, C).',
  ],
  [
    'Columna (pilar)',
    'Elemento vertical de la estructura que recibe las cargas y las lleva a la cimentación.',
  ],
  ['Viga', 'Elemento horizontal de la estructura que salva una luz y apoya en columnas o muros.'],
  ['Losa', 'Placa horizontal de hormigón que forma el piso o la cubierta.'],
  ['Contrapiso', 'Capa de hormigón pobre sobre el terreno, base del piso terminado.'],
  ['Enlucido (revoque)', 'Capa de mortero que alisa el muro antes de pintar.'],
  ['Cota', 'Medida anotada en el plano.'],
  ['NPT', 'Nivel de piso terminado: altura de referencia de cada planta.'],
  ['Huella', 'Parte horizontal de un escalón, donde se apoya el pie.'],
  [
    'Contrahuella',
    'Altura de un escalón. Regla de Blondel: 2 contrahuellas + 1 huella ≈ 60–65 cm.',
  ],
  ['Cuadro de áreas', 'Tabla con el área de cada ambiente y el total del proyecto.'],
  ['Cómputo métrico', 'Cálculo de cantidades de obra (m², m³, unidades) para el presupuesto.'],
  ['Escuadra', 'Ángulo recto (90°) entre dos muros.'],
  ['Unión (encuentro)', 'Punto donde se juntan dos o más muros.'],
];
