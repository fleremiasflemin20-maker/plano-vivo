// Interior design (pure logic, no DOM): styles, automatic furnishing of each room from its
// real size and type, and the room finishes. Items are { id, kind, x, y, rot, w, d, h,
// color?, color2? }: centre normalised to the sheet, rotation in degrees (0 = the item's
// front looks down the sheet, +y), sizes in metres.
import { inRoom, roomName } from './pro.mjs';
import { CATALOG, defaultSize } from './furniture3d.mjs';

/** Style presets: floor, walls, fabrics (main pieces / accents) and wood. */
export const STYLES = {
  calido: {
    name: 'Cálido minimalista',
    floor: '#c49a6c',
    wall: '#f1ebe1',
    fabric: ['#d9cbb6', '#b5774a', '#ece6dc'],
    wood: '#b38b5a',
    plant: '#5a8f4e',
  },
  nordico: {
    name: 'Nórdico',
    floor: '#e2d3bb',
    wall: '#f6f6f3',
    fabric: ['#d7dce0', '#9fb3c8', '#f2efe9'],
    wood: '#e0c9a6',
    plant: '#6a9a5b',
  },
  moderno: {
    name: 'Moderno',
    floor: '#cfcfcc',
    wall: '#ececea',
    fabric: ['#6d7a86', '#2f3b45', '#e6e6e3'],
    wood: '#3d3d3d',
    plant: '#4f8a4a',
  },
  industrial: {
    name: 'Industrial',
    floor: '#7d7a75',
    wall: '#d9d5cf',
    fabric: ['#7a4e33', '#3b3b3b', '#a89a86'],
    wood: '#2e2b28',
    plant: '#4c7d43',
  },
  midcentury: {
    name: 'Mid-century',
    floor: '#8a5a37',
    wall: '#eee5d6',
    fabric: ['#c8742c', '#2f6f6a', '#e9dfcd'],
    wood: '#8a5a37',
    plant: '#4f8a4a',
  },
  verde: {
    name: 'Verde natural',
    floor: '#a97c50',
    wall: '#7f9a7a',
    fabric: ['#e8e1d3', '#b5774a', '#f3efe7'],
    wood: '#9b7044',
    plant: '#3f7a3a',
  },
};
export const FLOORS = {
  'Madera clara': '#d4b48c',
  'Madera media': '#b0835a',
  'Madera oscura': '#6e4a2f',
  Porcelanato: '#d9d8d4',
  Cerámica: '#cfc9bf',
  Mármol: '#ecebe7',
  Cemento: '#a7a6a2',
};
export const WALL_COLORS = {
  Blanco: '#f4f3ef',
  Hueso: '#efe8dc',
  'Gris claro': '#dcdcd8',
  Arena: '#e6d6bd',
  'Verde salvia': '#9fb39a',
  'Verde oscuro': '#4f6b55',
  'Azul suave': '#b9cad6',
  Terracota: '#c98a6a',
};

let counter = 0;
const id = () => 'm' + Date.now().toString(36) + (counter++).toString(36);

/** Axis-aligned bounds of a room in metres: { x0, y0, x1, y1 }. */
export function roomBounds(room, W, D) {
  let x0 = 1,
    y0 = 1,
    x1 = 0,
    y1 = 0;
  for (const r of room.runs) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x0: x0 * W, y0: y0 * D, x1: x1 * W, y1: y1 * D };
}

/** Footprint corners of an item (metres) for the overlap and fit checks. */
function corners(it, W, D) {
  const cx = it.x * W,
    cy = it.y * D,
    r = (it.rot * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => {
    const x = (a * it.w) / 2,
      y = (b * it.d) / 2;
    return { x: (cx + x * c - y * s) / W, y: (cy + x * s + y * c) / D };
  });
}
export function fits(it, room, W, D) {
  const pts = corners(it, W, D);
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  return [...pts, mid(pts[0], pts[2])].every((p) => inRoom(p, room));
}

/** Door midpoints (normalised), to keep their swing clear. */
function doorPoints(walls) {
  return walls
    .filter((w) => w.type === 'door')
    .map((w) => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }));
}
/** Door openings in metres: centre, unit vector along the wall and width. */
function doorZones(walls, W, D) {
  return walls
    .filter((w) => w.type === 'door')
    .map((w) => {
      const ax = w.a.x * W,
        ay = w.a.y * D,
        dx = w.b.x * W - ax,
        dy = w.b.y * D - ay,
        L = Math.hypot(dx, dy) || 1;
      return { mx: ax + dx / 2, my: ay + dy / 2, ux: dx / L, uy: dy / L, L };
    });
}
/**
 * The leaf of a door sweeps a square in front of the opening (its width by its width), on
 * either side of the wall: nothing may stand there. Furniture beside the door is fine.
 */
function clearOfDoors(it, doors, W, D) {
  const r = ((it.rot || 0) * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r),
    pts = [];
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const x = -it.w / 2 + (it.w * i) / 4,
        y = -it.d / 2 + (it.d * j) / 4;
      pts.push({ x: it.x * W + x * c - y * s, y: it.y * D + x * s + y * c });
    }
  return doors.every((d) =>
    pts.every((q) => {
      const px = q.x - d.mx,
        py = q.y - d.my,
        along = Math.abs(px * d.ux + py * d.uy),
        across = Math.abs(px * d.uy - py * d.ux);
      return !(along < d.L / 2 + 0.05 && across < d.L + 0.05);
    }),
  );
}
/** Free distance (m) between two pieces' bounding boxes. */
function boxGap(a, b, W, D) {
  const box = (it) => {
    const r = Math.abs(Math.sin(((it.rot || 0) * Math.PI) / 180)) > 0.5,
      w = r ? it.d : it.w,
      d = r ? it.w : it.d;
    return {
      x0: it.x * W - w / 2,
      x1: it.x * W + w / 2,
      y0: it.y * D - d / 2,
      y1: it.y * D + d / 2,
    };
  };
  const p = box(a),
    q = box(b);
  return Math.hypot(Math.max(0, q.x0 - p.x1, p.x0 - q.x1), Math.max(0, q.y0 - p.y1, p.y0 - q.y1));
}
function overlaps(a, b, W, D) {
  const box = (it) => {
    const r = Math.abs(Math.sin((it.rot * Math.PI) / 180)) > 0.5;
    const w = r ? it.d : it.w,
      d = r ? it.w : it.d;
    return {
      x0: it.x * W - w / 2,
      x1: it.x * W + w / 2,
      y0: it.y * D - d / 2,
      y1: it.y * D + d / 2,
    };
  };
  const p = box(a),
    q = box(b);
  return p.x0 < q.x1 - 0.02 && q.x0 < p.x1 - 0.02 && p.y0 < q.y1 - 0.02 && q.y0 < p.y1 - 0.02;
}

/**
 * Wall sides of the room bounds, longest first, with their length and whether a door is
 * on them. side: 'n' (y0), 's' (y1), 'w' (x0), 'e' (x1).
 */
function windowPoints(walls) {
  return walls
    .filter((w) => w.type === 'window')
    .map((w) => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }));
}
function sides(b, doors, W, D, windows = []) {
  const near = (p, side) => {
    const x = p.x * W,
      y = p.y * D;
    if (side === 'n' || side === 's')
      return Math.abs(y - (side === 'n' ? b.y0 : b.y1)) < 0.35 && x > b.x0 - 0.2 && x < b.x1 + 0.2;
    return Math.abs(x - (side === 'w' ? b.x0 : b.x1)) < 0.35 && y > b.y0 - 0.2 && y < b.y1 + 0.2;
  };
  return (
    ['n', 's', 'w', 'e']
      .map((side) => ({
        side,
        len: side === 'n' || side === 's' ? b.x1 - b.x0 : b.y1 - b.y0,
        door: doors.some((p) => near(p, side)),
        win: windows.some((p) => near(p, side)),
      }))
      // A solid wall (no door, no window) first, then the longest.
      .sort((p, q) => p.door - q.door || p.win - q.win || q.len - p.len)
  );
}
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };

/** Free space needed in front of each piece to use it (m), like a designer would leave. */
export const FRONT = {
  bed_double: 0.6,
  bed_single: 0.5,
  wardrobe: 0.65,
  dresser: 0.6,
  nightstand: 0.25,
  desk: 0.6,
  bookshelf: 0.6,
  kitchen_counter: 0.9,
  fridge: 0.9,
  stove: 0.8,
  island: 0.9,
  sofa: 0.4,
  sofa_l: 0.4,
  armchair: 0.4,
  tv_unit: 0.9,
  vanity: 0.6,
  toilet: 0.5,
  bathtub: 0.6,
  shower: 0.6,
  washer: 0.7,
};
/** Pieces taller than a window sill: never in front of a window. */
export const TALL = new Set(['wardrobe', 'bookshelf', 'fridge', 'upper_cabinets', 'tv_unit']);
/** Low pieces that may stand in another piece's front space (a coffee table before a sofa…). */
const LOW = new Set([
  'rug',
  'coffee_table',
  'coffee_round',
  'chair',
  'office_chair',
  'plant',
  'floor_lamp',
]);

/** Point (normalised) inside an item's rotated footprint, grown by `pad` metres. */
function insideItem(p, it, W, D, pad = 0) {
  const r = (-(it.rot || 0) * Math.PI) / 180,
    dx = (p.x - it.x) * W,
    dy = (p.y - it.y) * D,
    x = dx * Math.cos(r) - dy * Math.sin(r),
    y = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(x) <= it.w / 2 + pad && Math.abs(y) <= it.d / 2 + pad;
}
/** Sample points (normalised) of a rectangle in the item's own axes: x across, y forward. */
function localPoints(it, W, D, x0, x1, y0, y1, n = 3) {
  const r = ((it.rot || 0) * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r),
    out = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const x = x0 + ((x1 - x0) * i) / n,
        y = y0 + ((y1 - y0) * j) / n;
      out.push({ x: it.x + (x * c - y * s) / W, y: it.y + (x * s + y * c) / D });
    }
  return out;
}
/** Footprint sample of an item. */
const footprint = (it, W, D) => localPoints(it, W, D, -it.w / 2, it.w / 2, -it.d / 2, it.d / 2);
/** Its use zone: the strip in front of it (front = +y of the item). */
const useZone = (it, W, D) =>
  localPoints(
    it,
    W,
    D,
    -it.w / 2 + 0.05,
    it.w / 2 - 0.05,
    it.d / 2 + 0.05,
    it.d / 2 + FRONT[it.kind],
  );
const inRect = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/**
 * Areas no furniture may take: stairs, terraces and structural columns (normalised rects).
 * features: plan features; columns: { x, y, b, h } with sizes in metres.
 */
export function obstaclesFrom(features = [], columns = [], W = 1, D = 1) {
  const out = features
    .filter((f) => f.type === 'stair' || f.type === 'terrace')
    .map((f) => ({ x0: f.x, y0: f.y, x1: f.x + f.w, y1: f.y + f.h }));
  for (const c of columns)
    out.push({
      x0: c.x - c.b / 2 / W,
      y0: c.y - c.h / 2 / D,
      x1: c.x + c.b / 2 / W,
      y1: c.y + c.h / 2 / D,
    });
  return out;
}
/** The plan's recognised furniture blocks inside these rooms: replaced when we furnish them. */
export function withoutRecognizedFurniture(features = [], rooms = []) {
  return features.filter(
    (f) =>
      !(
        f.type === 'furniture' &&
        rooms.some((r) => inRoom({ x: f.x + f.w / 2, y: f.y + f.h / 2 }, r))
      ),
  );
}
/** Window segments in metres, for the "nothing tall in front of a window" rule. */
function windowSegments(walls, W, D) {
  return walls
    .filter((w) => w.type === 'window')
    .map((w) => ({ ax: w.a.x * W, ay: w.a.y * D, bx: w.b.x * W, by: w.b.y * D }));
}
function blocksWindow(it, wins, W, D) {
  if (!TALL.has(it.kind)) return false;
  // Any point of the footprint within 0.35 m of a window segment.
  return footprint(it, W, D).some((p) => {
    const x = p.x * W,
      y = p.y * D;
    return wins.some((s) => {
      const dx = s.bx - s.ax,
        dy = s.by - s.ay,
        L = dx * dx + dy * dy || 1,
        t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / L));
      return Math.hypot(x - (s.ax + t * dx), y - (s.ay + t * dy)) < 0.35;
    });
  });
}
/**
 * Common-sense check of a piece against the room and what is already there: inside the room,
 * clear of doors, stairs, terraces and columns, not hiding a window if tall, with its use
 * zone free and not standing in another piece's use zone.
 */
export function sensible(it, room, kept, ctx) {
  const why = (reason) => {
    if (ctx.why) ctx.why.push(it.kind + ': ' + reason);
    return false;
  };
  const { W, D, doors = [], obstacles = [], wins = [] } = ctx;
  if (!fits(it, room, W, D)) return why('fuera del recinto');
  if (it.kind !== 'rug' && !clearOfDoors(it, doors, W, D)) return why('barrido de puerta');
  const fp = footprint(it, W, D);
  if (it.kind !== 'rug' && obstacles.some((r) => fp.some((p) => inRect(p, r))))
    return why('escalera o columna');
  if (blocksWindow(it, wins, W, D)) return why('tapa una ventana');
  // Around a bed: 50 cm free to walk by and make it, nothing tall closer than that.
  const isBed = (k) => /^bed_/.test(k);
  if (
    kept.some(
      (o) =>
        ((TALL.has(it.kind) && isBed(o.kind)) || (isBed(it.kind) && TALL.has(o.kind))) &&
        boxGap(it, o, W, D) < 0.5,
    )
  )
    return why('pegado a la cama');
  const solid = (o) => !LOW.has(o.kind);
  // Its own use zone: inside the room, free of obstacles and of solid pieces.
  if (FRONT[it.kind]) {
    const zone = useZone(it, W, D);
    if (zone.some((p) => !inRoom(p, room))) return why('sin espacio de uso');
    if (zone.some((p) => obstacles.some((r) => inRect(p, r))))
      return why('espacio de uso con escalera');
    if (
      kept.some(
        (o) => solid(o) && o.kind !== 'nightstand' && zone.some((p) => insideItem(p, o, W, D)),
      )
    )
      return why('espacio de uso ocupado');
  }
  // Not standing in another piece's use zone (low pieces such as a coffee table may).
  if (
    solid(it) &&
    it.kind !== 'nightstand' &&
    kept.some((o) => FRONT[o.kind] && useZone(o, W, D).some((q) => insideItem(q, it, W, D)))
  )
    return why('dentro del espacio de uso de otro mueble');
  return true;
}
/** Rotation so an item's back is against `side` (its front looks into the room). */
const ROT = { n: 0, s: 180, w: 270, e: 90 };

/**
 * Place an item against a side of the bounds, at `t` (0..1) along it, `off` m from the wall.
 * Returns the item (normalised) or null if it does not fit the side.
 */
function against(kind, b, side, t, W, D, opts = {}) {
  const size = { ...defaultSize(kind), ...opts.size },
    off = opts.off ?? 0.02,
    alongX = side === 'n' || side === 's',
    span = alongX ? b.x1 - b.x0 : b.y1 - b.y0;
  if (size.w > span - 0.1) return null;
  const pos = (alongX ? b.x0 : b.y0) + size.w / 2 + 0.05 + (span - size.w - 0.1) * t;
  let x, y;
  if (alongX) {
    x = pos;
    y = side === 'n' ? b.y0 + off + size.d / 2 : b.y1 - off - size.d / 2;
  } else {
    y = pos;
    x = side === 'w' ? b.x0 + off + size.d / 2 : b.x1 - off - size.d / 2;
  }
  return {
    id: id(),
    kind,
    x: x / W,
    y: y / D,
    rot: ROT[side],
    ...size,
    ...(opts.color ? { color: opts.color } : {}),
  };
}
/** Item placed freely at a point (metres), facing `side`'s opposite. */
function at(kind, x, y, rot, W, D, opts = {}) {
  const size = { ...defaultSize(kind), ...opts.size };
  return {
    id: id(),
    kind,
    x: x / W,
    y: y / D,
    rot,
    ...size,
    ...(opts.color ? { color: opts.color } : {}),
  };
}

/** Furniture for one room, from its type (Sala, Dormitorio…) and a style. */
export function furnishRoom(
  room,
  type,
  walls,
  W,
  D,
  styleKey = 'calido',
  wanted = null,
  variant = 0,
  obstacles = [],
) {
  const st = STYLES[styleKey] || STYLES.calido,
    b = roomBounds(room, W, D),
    doors = doorPoints(walls),
    sd = sides(b, doors, W, D, windowPoints(walls)),
    main = sd[variant % sd.length].side,
    w = b.x1 - b.x0,
    d = b.y1 - b.y0,
    cx = (b.x0 + b.x1) / 2,
    cy = (b.y0 + b.y1) / 2,
    out = [];
  const t = (type || '').toLowerCase();
  const fab = st.fabric,
    put = (it) => it && out.push(it),
    ctx0 = {
      W,
      D,
      doors: doorZones(walls, W, D),
      obstacles,
      wins: windowSegments(walls, W, D),
      why: globalThis.__furnishWhy,
    };
  /** The first wall side and position (best first) where `kind` makes sense. */
  const best = (kind, sideOrder, opts = {}) => {
    // Full size first; then the narrower versions a designer would order for a tight room.
    for (const size of [opts.size, ...(opts.sizes || [])])
      for (const sx of sideOrder)
        for (const tt of opts.ts || [0.5, 0.3, 0.7, 0.15, 0.85, 0, 1]) {
          const it = against(kind, opts.region || b, sx, tt, W, D, { ...opts, size });
          if (
            it &&
            sensible(
              it,
              room,
              out.filter((o) => o.kind !== 'rug'),
              ctx0,
            )
          )
            return it;
        }
    return null;
  };
  const order = [main, ...sd.map((x) => x.side).filter((x) => x !== main)];
  const sideOf = (it) => ({ 0: 'n', 180: 's', 270: 'w', 90: 'e' })[it.rot];
  /** The point (metres) `dist` in front of a piece. */
  const ahead = (it, dist) => {
    const r = (it.rot * Math.PI) / 180;
    return { x: it.x * W - Math.sin(r) * dist, y: it.y * D + Math.cos(r) * dist };
  };
  /** Table and chairs around (x, y) m: the first nearby spot where the table makes sense. */
  const diningAt = (x, y, region = b) => {
    // Candidate centres over the whole zone, nearest to (x, y) first.
    const pts = [];
    for (let px = region.x0 + 0.4; px <= region.x1 - 0.4; px += 0.2)
      for (let py = region.y0 + 0.4; py <= region.y1 - 0.4; py += 0.2) pts.push([px, py]);
    pts.sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y));
    const tall = region.y1 - region.y0 > region.x1 - region.x0;
    const solids = () => out.filter((o) => o.kind !== 'rug');
    for (const compact of [false, true])
      for (const turn of tall ? [90, 0] : [0, 90])
        for (const [px, py] of pts) {
          const set = [];
          dining(set, px, py, W, D, fab, st, turn, compact);
          if (!sensible(set[0], room, solids(), { ...ctx0, why: null })) continue;
          out.push(set[0]);
          const chairs = set
            .slice(1)
            .filter((c) => sensible(c, room, solids(), { ...ctx0, why: null }));
          if (chairs.length === set.length - 1) {
            out.push(...chairs);
            return true;
          }
          out.pop();
        }
    return false;
  };
  // Point at a fraction into the room from the main wall towards its opposite.
  const inward = (f) => {
    const s = main;
    return s === 'n'
      ? { x: cx, y: b.y0 + d * f }
      : s === 's'
        ? { x: cx, y: b.y1 - d * f }
        : s === 'w'
          ? { x: b.x0 + w * f, y: cy }
          : { x: b.x1 - w * f, y: cy };
  };
  if (/sala|estar|living/.test(t) && !/comedor/.test(t)) {
    const sofa =
      (w * d > 14 ? best('sofa_l', order, { color: fab[0] }) : null) ||
      best('sofa', order, { color: fab[0] });
    put(sofa);
    const sofaSide = sofa ? sideOf(sofa) : main;
    // Coffee table and rug in front of the sofa, 45 cm of passage between them.
    const p = sofa ? ahead(sofa, sofa.d / 2 + 0.75) : inward(0.42);
    put(
      at('rug', p.x, p.y, ROT[sofaSide], W, D, {
        color: fab[2],
        size: { w: Math.min(2.4, Math.max(w, d) * 0.55), d: 1.6 },
      }),
    );
    put(at('coffee_round', p.x, p.y, 0, W, D, { color: fab[2] }));
    // The TV faces the sofa, on the opposite wall; else a wall without a window (no glare).
    const tvSide = OPP[sofaSide];
    put(
      best('tv_unit', [tvSide]) ||
        best(
          'tv_unit',
          order.filter((x) => x !== sofaSide && !sd.find((y) => y.side === x).win),
        ),
    );
    const side = sd.find((s) => s.side !== sofaSide && s.side !== tvSide);
    if (side) put(against('armchair', b, side.side, 0.5, W, D, { color: fab[1], off: 0.35 }));
    put(against('plant', b, sofaSide, 0.98, W, D, { color: st.plant, size: { w: 0.5, d: 0.5 } }));
    put(against('floor_lamp', b, sofaSide, 0.02, W, D));
    put(best('bookshelf', side ? [OPP[side.side]] : [], { color: st.wood }));
  } else if (/sala-comedor|sala comedor/.test(t)) {
    // Living half against the main wall, dining towards the opposite one.
    const half = main === 'n' || main === 's' ? { ...b, x1: cx } : { ...b, y1: cy },
      other = main === 'n' || main === 's' ? { ...b, x0: cx } : { ...b, y0: cy };
    const sofa =
      best('sofa', order, { color: fab[0], region: half }) ||
      best('sofa', order, { color: fab[0] });
    put(sofa);
    const sofaSide = sofa ? sideOf(sofa) : main;
    if (sofa) {
      const q = ahead(sofa, sofa.d / 2 + 0.7);
      put(at('rug', q.x, q.y, ROT[sofaSide], W, D, { color: fab[2], size: { w: 2.0, d: 1.5 } }));
      put(at('coffee_table', q.x, q.y, ROT[sofaSide], W, D));
      // The TV on the wall facing the sofa, in line with it when it can.
      put(
        best('tv_unit', [OPP[sofaSide]], { region: half, ts: [0.5, 0.3, 0.7] }) ||
          best('tv_unit', [OPP[sofaSide], ...order.filter((x) => x !== sofaSide)]),
      );
    }
    const ox = (other.x0 + other.x1) / 2,
      oy = (other.y0 + other.y1) / 2;
    diningAt(ox, oy, other);
    put(against('plant', other, main, 0.95, W, D, { color: st.plant, size: { w: 0.5, d: 0.5 } }));
  } else if (/comedor/.test(t)) {
    diningAt(cx, cy);
    put(against('dresser', b, main, 0.5, W, D, { color: st.wood }));
    put(against('plant', b, main, 0.98, W, D, { color: st.plant, size: { w: 0.5, d: 0.5 } }));
  } else if (/dormitorio|habitaci|cuarto|recámara/.test(t)) {
    const double = /principal/.test(t) || w * d >= 10.5;
    const sideOf = (it) => ({ 0: 'n', 180: 's', 270: 'w', 90: 'e' })[it.rot];
    /** The nightstands that fit beside a bed (one on each side of the headboard). */
    const stands = (bed) => {
      const bs = sideOf(bed),
        along = bs === 'n' || bs === 's',
        shift = (bed.w / 2 + 0.3) / (along ? W : D),
        got = [];
      for (const sgn of [-1, 1]) {
        const ns = against('nightstand', b, bs, 0.5, W, D, { color: st.wood });
        if (along) ns.x = bed.x + sgn * shift;
        else ns.y = bed.y + sgn * shift;
        if (
          sensible(
            ns,
            room,
            [...out, ...got].filter((o) => o.kind !== 'rug'),
            { ...ctx0, why: null },
          )
        )
          got.push(ns);
      }
      return got;
    };
    /** The wardrobe on a solid wall (no door, no window) other than the bed's. */
    const closet = (bs) => {
      const others = sd.filter((x) => x.side !== bs);
      return best(
        'wardrobe',
        [...others.filter((x) => !x.door && !x.win), ...others].map((x) => x.side),
        { ts: [0.5, 0.15, 0.85, 0, 1], sizes: [{ w: 1.2 }, { w: 1.0 }] },
      );
    };
    // The bed where both nightstands fit (a double needs both), else one, else just the bed.
    // «Reacomodar» (variant) moves it to the next wall where it works just as well.
    let bed = null,
      tables = [];
    const solids = () => out.filter((o) => o.kind !== 'rug');
    for (const kind of double ? ['bed_double', 'bed_single'] : ['bed_single']) {
      // Every wall's best spot, scored: the wardrobe still fits (2), each nightstand (1).
      const found = [];
      for (const sx of order) {
        let top = null;
        for (const tt of [0.5, 0.3, 0.7, 0.15, 0.85, 0, 1]) {
          const it = against(kind, b, sx, tt, W, D, { color: fab[2] });
          if (!it || !sensible(it, room, solids(), ctx0)) continue;
          out.push(it);
          const ns = stands(it);
          out.push(...ns);
          const wd = closet(sideOf(it));
          out.splice(out.length - ns.length - 1);
          const score = (wd ? 2 : 0) + ns.length;
          if (!top || score > top.score) top = { it, ns, score };
        }
        if (top) found.push(top);
      }
      if (!found.length) continue;
      const max = Math.max(...found.map((f) => f.score)),
        good = found.filter((f) => f.score === max),
        pick = good[variant % good.length];
      bed = pick.it;
      tables = pick.ns;
      break;
    }
    // Everything else in the room follows the wall the bed ended on.
    const bedSide = bed ? sideOf(bed) : main;
    if (bed) {
      put(bed);
      out.push(...tables);
      // Rug under the lower two thirds of the bed, centred on it.
      const off = bed.d * 0.25,
        dir = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[bedSide];
      const p = { x: bed.x * W + dir[0] * off, y: bed.y * D + dir[1] * off };
      put(
        at('rug', p.x, p.y, ROT[bedSide], W, D, {
          color: fab[1],
          size: { w: double ? 2.2 : 1.6, d: 1.3 },
        }),
      );
    }
    // Wardrobe on a solid wall (no door, no window) other than the bed's, then a dresser.
    const others = sd.filter((x) => x.side !== bedSide);
    put(closet(bedSide));
    put(best('dresser', [OPP[bedSide], ...others.map((x) => x.side)], { color: st.wood }));
    put(
      best('plant', [OPP[bedSide]], {
        color: st.plant,
        size: { w: 0.45, d: 0.45 },
        ts: [0.02, 0.98],
      }),
    );
  } else if (/cocina/.test(t)) {
    const len = Math.min(sd[0].len - 0.2, 3.2);
    const counter = best('kitchen_counter', order, {
      size: { w: Math.max(1.2, len - 0.8) },
      ts: [0.35, 0.5, 0.1, 0.9],
    });
    put(counter);
    const cSide = counter ? { 0: 'n', 180: 's', 270: 'w', 90: 'e' }[counter.rot] : main;
    if (counter) {
      const up = {
        ...counter,
        id: id(),
        kind: 'upper_cabinets',
        h: defaultSize('upper_cabinets').h,
        d: defaultSize('upper_cabinets').d,
      };
      // Same wall, flush with it: move it back by the depth difference.
      const k = (counter.d - up.d) / 2,
        dir = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[cSide];
      up.x += (dir[0] * k) / W;
      up.y += (dir[1] * k) / D;
      put(up);
    }
    put(best('fridge', [cSide, ...order.filter((x) => x !== cSide)], { ts: [1, 0, 0.85, 0.15] }));
    if (w * d > 9)
      put(
        at('island', cx, cy, ROT[main], W, D, { size: { w: Math.min(1.6, Math.max(w, d) * 0.4) } }),
      );
    else put(against('stove', b, OPP[main], 0.5, W, D));
  } else if (/baño/.test(t)) {
    // The wet zone (tub or shower) goes at the far end from the door. A designer tries the
    // pieces in a few orders and keeps the plan with a toilet and the most pieces.
    const doorSide = sd.find((x) => x.door)?.side,
      far = doorSide ? OPP[doorSide] : OPP[main],
      wet = [far, ...order.filter((x) => x !== far)];
    const pieces = {
      wet: () =>
        (w * d >= 5 && best('bathtub', wet)) ||
        best('shower', wet, { ts: [1, 0, 0.5], sizes: [{ w: 0.8, d: 0.8 }] }),
      vanity: () =>
        best('vanity', order, { ts: [0.15, 0.5, 0.85, 0, 1], sizes: [{ w: 0.6, d: 0.45 }] }),
      toilet: () => best('toilet', order, { ts: [0.75, 0.25, 0.5, 0, 1] }),
    };
    const start = out.length;
    let plan = null;
    for (const seq of [
      ['wet', 'vanity', 'toilet'],
      ['toilet', 'wet', 'vanity'],
      ['toilet', 'vanity', 'wet'],
      ['vanity', 'toilet', 'wet'],
    ]) {
      for (const k of seq) put(pieces[k]());
      const got = out.splice(start),
        score = got.length + (got.some((o) => o.kind === 'toilet') ? 10 : 0);
      if (!plan || score > plan.score) plan = { score, got };
    }
    out.push(...plan.got);
  } else if (/estudio|oficina/.test(t)) {
    put(best('desk', order));
    const desk = out.at(-1);
    if (desk) {
      const chair = { ...at('office_chair', 0, 0, (ROT[main] + 180) % 360, W, D) };
      const off = (desk.d / 2 + 0.4) * (main === 'n' || main === 'w' ? 1 : -1);
      chair.x = desk.x + (main === 'w' || main === 'e' ? off / W : 0);
      chair.y = desk.y + (main === 'n' || main === 's' ? off / D : 0);
      put(chair);
    }
    put(against('bookshelf', b, OPP[main], 0.5, W, D, { color: st.wood }));
    put(against('plant', b, main, 0.98, W, D, { color: st.plant, size: { w: 0.45, d: 0.45 } }));
  } else if (/lavander/.test(t)) {
    put(best('washer', order, { ts: [0.2, 0.8] }));
    put(best('washer', order, { ts: [0.55, 0.45, 0.9] }));
  }
  // Keep only what an architect would: see sensible(). Rugs go under the rest.
  const ctx = {
    W,
    D,
    doors: doorZones(walls, W, D),
    obstacles,
    wins: windowSegments(walls, W, D),
    why: globalThis.__furnishWhy,
  };
  const kept = [];
  const ordered = [
    ...out.filter((it) => it && it.kind !== 'rug'),
    ...out.filter((it) => it && it.kind === 'rug'),
  ];
  for (const it of ordered) {
    if (!CATALOG[it.kind]) continue;
    if (wanted && !wanted.includes(it.kind)) continue;
    const flat = (k) => k === 'rug';
    // Pieces that may tuck under or against each other: chairs at a table or desk.
    const pair = (a, b) => /chair/.test(a) && /table|round|desk/.test(b);
    if (
      kept.some(
        (o) =>
          !flat(o.kind) &&
          !flat(it.kind) &&
          !(it.kind === 'coffee_round' || it.kind === 'coffee_table') &&
          !pair(it.kind, o.kind) &&
          !pair(o.kind, it.kind) &&
          overlaps(o, it, W, D),
      )
    )
      continue;
    if (
      !sensible(
        it,
        room,
        kept.filter((o) => !flat(o.kind)),
        ctx,
      )
    )
      continue;
    kept.push(it);
  }
  return kept;
}

function dining(out, x, y, W, D, fab, st, turn = 0, compact = false) {
  // Compact: a 0.8 m square table for two, the chairs face to face.
  out.push(
    at('dining_table', x, y, turn, W, D, {
      color: st.wood,
      ...(compact ? { size: { w: 0.8, d: 0.8 } } : {}),
    }),
  );
  const seats = compact
    ? [
        [0, -0.62, 0],
        [0, 0.62, 180],
      ]
    : [
        [-0.4, -0.66, 0],
        [0.4, -0.66, 0],
        [-0.4, 0.66, 180],
        [0.4, 0.66, 180],
      ];
  for (const [dx, dy, rot] of seats) {
    // Turned 90°: the table runs along the room's long side, chairs on its long edges.
    const [ox, oy] = turn ? [-dy, dx] : [dx, dy];
    out.push(at('chair', x + ox, y + oy, (rot + turn) % 360, W, D, { color: fab[1] }));
  }
}

/** Furnish every room that has a name (or guess "Sala" for the biggest one). */
export function furnishAll(rooms, tags, walls, W, D, styleKey, obstacles = []) {
  const items = [];
  rooms.forEach((room, i) => {
    const name = roomName(room, tags) || (i === 0 ? 'Sala-comedor' : guessType(room, W, D));
    if (!name) return; // a closet, shaft or corridor: left empty
    items.push(...furnishRoom(room, name, walls, W, D, styleKey, null, 0, obstacles));
  });
  return items;
}

/** A reasonable type for an unnamed room from its area. */
export function guessType(room, W, D) {
  const a = room.area;
  // Under 2.5 m² is a closet, a shaft or a corridor piece, not a room to furnish.
  if (a < 2.5) return null;
  if (a < 4) return 'Baño';
  if (a < 7.5) return 'Estudio';
  if (a < 11) return 'Dormitorio';
  return 'Dormitorio principal';
}

/** Per-room finishes from a style: one { x, y, floor, wall } per room (point inside it). */
export function styleFinishes(rooms, styleKey) {
  const st = STYLES[styleKey] || STYLES.calido;
  return rooms.map((room) => {
    const r = room.runs[Math.floor(room.runs.length / 2)];
    const wet = false;
    return {
      x: r.x + r.w / 2,
      y: r.y + r.h / 2,
      floor: wet ? FLOORS.Cerámica : st.floor,
      wall: st.wall,
    };
  });
}
export const finishFor = (room, finishes) => finishes.find((f) => inRoom(f, room)) || null;

/** List of furniture with sizes (for the "Lista" view and CSV). */
export function itemList(items, rooms, tags) {
  return items.map((it) => {
    const room = rooms.findIndex((r) => inRoom({ x: it.x, y: it.y }, r));
    return {
      name: CATALOG[it.kind]?.name || it.kind,
      room: room >= 0 ? roomName(rooms[room], tags) || 'R' + (room + 1) : '—',
      size: `${it.w.toFixed(2)} × ${it.d.toFixed(2)} × ${it.h.toFixed(2)} m`,
      color: it.color || CATALOG[it.kind]?.main,
    };
  });
}

export function validateInterior(d) {
  const fin = (n, a, b) => Number.isFinite(n) && n >= a && n <= b;
  const hex = (c) => c == null || /^#[0-9a-f]{6}$/i.test(c);
  if (d.items != null) {
    if (!Array.isArray(d.items) || d.items.length > 800) throw Error('Muebles no válidos');
    for (const it of d.items)
      if (
        !CATALOG[it?.kind] ||
        !fin(it.x, 0, 1) ||
        !fin(it.y, 0, 1) ||
        !fin(it.rot, -360, 360) ||
        !fin(it.w, 0.05, 8) ||
        !fin(it.d, 0.05, 8) ||
        !fin(it.h, 0.005, 4) ||
        !hex(it.color) ||
        !hex(it.color2)
      )
        throw Error('Muebles no válidos');
  }
  if (d.finishes != null) {
    if (!Array.isArray(d.finishes) || d.finishes.length > 200) throw Error('Acabados no válidos');
    for (const f of d.finishes)
      if (!fin(f?.x, 0, 1) || !fin(f?.y, 0, 1) || !hex(f.floor) || !hex(f.wall))
        throw Error('Acabados no válidos');
  }
  return d;
}

/** Recolour the furniture for a style (fabric, accents, wood and plants). */
export function restyle(items, styleKey) {
  const st = STYLES[styleKey] || STYLES.calido;
  const role = {
    sofa: st.fabric[0],
    sofa_l: st.fabric[0],
    armchair: st.fabric[1],
    chair: st.fabric[1],
    office_chair: st.fabric[1],
    rug: st.fabric[2],
    bed_double: st.fabric[2],
    bed_single: st.fabric[2],
    coffee_round: st.fabric[2],
    nightstand: st.wood,
    dresser: st.wood,
    bookshelf: st.wood,
    dining_table: st.wood,
    dining_round: st.wood,
    plant: st.plant,
  };
  return items.map((it) => (role[it.kind] ? { ...it, color: role[it.kind] } : it));
}

/**
 * Extra piece placed on a free spot of the room (scanning a grid from the walls inwards),
 * not overlapping the items already there. Returns the item or null.
 */
export function placeExtra(kind, room, items, W, D, color, ctx = {}) {
  const b = roomBounds(room, W, D),
    size = defaultSize(kind),
    others = items.filter((o) => inRoom(o, room) && o.kind !== 'rug'),
    walls = ctx.walls || [],
    rules = {
      W,
      D,
      doors: doorZones(walls, W, D),
      wins: windowSegments(walls, W, D),
      obstacles: ctx.obstacles || [],
    },
    ok = (it) =>
      it && !others.some((o) => overlaps(o, it, W, D)) && sensible(it, room, others, rules);
  // Against a wall first, as a designer would; low pieces may also stand free in the room.
  for (const side of ['n', 's', 'w', 'e'])
    for (const t of [0.5, 0.3, 0.7, 0.1, 0.9, 0, 1]) {
      const it = against(kind, b, side, t, W, D, color ? { color } : {});
      if (ok(it)) return it;
    }
  const step = 0.25;
  for (const rot of [0, 90, 180, 270])
    for (let y = b.y0 + 0.3; y <= b.y1 - 0.3; y += step)
      for (let x = b.x0 + 0.3; x <= b.x1 - 0.3; x += step) {
        const it = {
          id: id(),
          kind,
          x: x / W,
          y: y / D,
          rot,
          ...size,
          ...(color ? { color } : {}),
        };
        if (ok(it)) return it;
      }
  return null;
}

const PUBLIC = /sala|comedor|cocina|estudio|oficina|vest[ií]bulo|balc/i;
/**
 * A simple floor plan for a list of rooms [{ tipo, area }]: public rooms in one row, private
 * rooms (bedrooms, bathrooms…) in the other, one door per room and a window on the
 * façade. Returns { W, D, walls, tags } with walls in normalised sheet coordinates.
 */
export function layoutProgram(rooms) {
  const list = rooms.filter((r) => r.area > 0.5).slice(0, 14);
  if (!list.length) return null;
  const top = list.filter((r) => PUBLIC.test(r.tipo)),
    bottom = list.filter((r) => !PUBLIC.test(r.tipo));
  const rows = [top, bottom].filter((r) => r.length);
  const A = list.reduce((n, r) => n + r.area, 0),
    width = Math.max(6, Math.sqrt(A * 1.5)),
    heights = rows.map((row) => row.reduce((n, r) => n + r.area, 0) / width),
    depth = heights.reduce((n, h) => n + h, 0),
    m = 1.2,
    W = width + 2 * m,
    D = depth + 2 * m;
  const walls = [],
    tags = [],
    N = (x, y) => ({ x: (x + m) / W, y: (y + m) / D });
  /** A straight wall from p to q (metres) with openings [{ at, len, type }] along it. */
  const line = (p, q, openings = []) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y),
      ux = (q.x - p.x) / L,
      uy = (q.y - p.y) / L;
    let t = 0;
    for (const o of openings.sort((a, b) => a.at - b.at)) {
      const s0 = Math.max(t, o.at - o.len / 2),
        s1 = Math.min(L, o.at + o.len / 2);
      if (s1 - s0 < 0.3) continue;
      if (s0 - t > 0.02)
        walls.push({
          a: N(p.x + ux * t, p.y + uy * t),
          b: N(p.x + ux * s0, p.y + uy * s0),
          type: 'wall',
        });
      walls.push({
        a: N(p.x + ux * s0, p.y + uy * s0),
        b: N(p.x + ux * s1, p.y + uy * s1),
        type: o.type,
      });
      t = s1;
    }
    if (L - t > 0.02)
      walls.push({
        a: N(p.x + ux * t, p.y + uy * t),
        b: N(p.x + ux * L, p.y + uy * L),
        type: 'wall',
      });
  };
  let y = 0;
  const cells = rows.map((row, ri) => {
    const h = heights[ri];
    let x = 0;
    const out = row.map((r) => {
      const w = r.area / h,
        c = { ...r, x0: x, x1: x + w, y0: y, y1: y + h, row: ri };
      x += w;
      return c;
    });
    y += h;
    return out;
  });
  const flat = cells.flat();
  // Façades with one window per room (smaller in bathrooms), the entrance in the first room.
  const win = (c) => ({
    at: (c.x0 + c.x1) / 2,
    len: /baño/i.test(c.tipo) ? 0.6 : Math.min(1.5, (c.x1 - c.x0) * 0.4),
    type: 'window',
  });
  line({ x: 0, y: 0 }, { x: width, y: 0 }, cells[0].map(win));
  const last = cells.at(-1);
  line(
    { x: 0, y: depth },
    { x: width, y: depth },
    rows.length > 1
      ? last.map(win)
      : [{ at: (last[0].x0 + last[0].x1) / 2, len: 0.95, type: 'door' }],
  );
  line({ x: 0, y: 0 }, { x: 0, y: depth }, [{ at: heights[0] / 2, len: 0.95, type: 'door' }]); // entrance
  line({ x: width, y: 0 }, { x: width, y: depth });
  // Partitions inside each row, with a door between neighbours of the public row.
  cells.forEach((row, ri) => {
    row.slice(1).forEach((c, i) => {
      const prevPublic = ri === 0 && rows.length > 1;
      line(
        { x: c.x0, y: c.y0 },
        { x: c.x0, y: c.y1 },
        prevPublic || rows.length === 1 ? [{ at: (c.y1 - c.y0) / 2, len: 0.9, type: 'door' }] : [],
      );
    });
  });
  // The wall between the rows: one door per private room.
  if (rows.length > 1) {
    const yb = heights[0];
    line(
      { x: 0, y: yb },
      { x: width, y: yb },
      cells[1].map((c) => ({ at: Math.min(c.x1 - 0.6, c.x0 + 0.7), len: 0.85, type: 'door' })),
    );
  }
  for (const c of flat) tags.push({ ...N((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2), name: c.tipo });
  return { W, D, walls, tags };
}
