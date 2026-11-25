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
function clearOfDoors(it, doors, W, D, gap = 0.95) {
  return doors.every((p) => {
    const dx = p.x * W - it.x * W,
      dy = p.y * D - it.y * D;
    return Math.hypot(dx, dy) > gap + Math.max(it.w, it.d) / 2 - 0.15;
  });
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
function sides(b, doors, W, D) {
  const near = (p, side) => {
    const x = p.x * W,
      y = p.y * D;
    if (side === 'n' || side === 's')
      return Math.abs(y - (side === 'n' ? b.y0 : b.y1)) < 0.35 && x > b.x0 - 0.2 && x < b.x1 + 0.2;
    return Math.abs(x - (side === 'w' ? b.x0 : b.x1)) < 0.35 && y > b.y0 - 0.2 && y < b.y1 + 0.2;
  };
  return ['n', 's', 'w', 'e']
    .map((side) => ({
      side,
      len: side === 'n' || side === 's' ? b.x1 - b.x0 : b.y1 - b.y0,
      door: doors.some((p) => near(p, side)),
    }))
    .sort((p, q) => p.door - q.door || q.len - p.len);
}
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
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
) {
  const st = STYLES[styleKey] || STYLES.calido,
    b = roomBounds(room, W, D),
    doors = doorPoints(walls),
    sd = sides(b, doors, W, D),
    main = sd[variant % sd.length].side,
    w = b.x1 - b.x0,
    d = b.y1 - b.y0,
    cx = (b.x0 + b.x1) / 2,
    cy = (b.y0 + b.y1) / 2,
    out = [];
  const t = (type || '').toLowerCase();
  const fab = st.fabric,
    put = (it) => it && out.push(it);
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
    put(
      against(w * d > 14 ? 'sofa_l' : 'sofa', b, main, 0.5, W, D, { color: fab[0] }) ||
        against('sofa', b, main, 0.5, W, D, { color: fab[0] }),
    );
    const p = inward(0.42);
    put(
      at('rug', p.x, p.y, ROT[main], W, D, {
        color: fab[2],
        size: { w: Math.min(2.4, Math.max(w, d) * 0.55), d: 1.6 },
      }),
    );
    put(at('coffee_round', p.x, p.y, 0, W, D, { color: fab[2] }));
    put(against('tv_unit', b, OPP[main], 0.5, W, D));
    const side = sd.find((s) => s.side !== main && s.side !== OPP[main]);
    if (side) put(against('armchair', b, side.side, 0.5, W, D, { color: fab[1], off: 0.35 }));
    put(against('plant', b, main, 0.98, W, D, { color: st.plant, size: { w: 0.5, d: 0.5 } }));
    put(against('floor_lamp', b, main, 0.02, W, D));
    put(against('bookshelf', b, side ? OPP[side.side] : main, 0.5, W, D, { color: st.wood }));
  } else if (/sala-comedor|sala comedor/.test(t)) {
    // Living half against the main wall, dining towards the opposite one.
    const half = main === 'n' || main === 's' ? { ...b, x1: cx } : { ...b, y1: cy },
      other = main === 'n' || main === 's' ? { ...b, x0: cx } : { ...b, y0: cy };
    put(against('sofa', half, main, 0.5, W, D, { color: fab[0] }));
    const q =
      main === 'n'
        ? { x: (half.x0 + half.x1) / 2, y: b.y0 + d * 0.45 }
        : main === 's'
          ? { x: (half.x0 + half.x1) / 2, y: b.y1 - d * 0.45 }
          : main === 'w'
            ? { x: b.x0 + w * 0.45, y: (half.y0 + half.y1) / 2 }
            : { x: b.x1 - w * 0.45, y: (half.y0 + half.y1) / 2 };
    put(at('rug', q.x, q.y, ROT[main], W, D, { color: fab[2], size: { w: 2.0, d: 1.5 } }));
    put(at('coffee_table', q.x, q.y, ROT[main], W, D));
    put(against('tv_unit', half, OPP[main], 0.5, W, D));
    const ox = (other.x0 + other.x1) / 2,
      oy = (other.y0 + other.y1) / 2;
    dining(out, ox, oy, W, D, fab, st);
    put(against('plant', other, main, 0.95, W, D, { color: st.plant, size: { w: 0.5, d: 0.5 } }));
  } else if (/comedor/.test(t)) {
    dining(out, cx, cy, W, D, fab, st);
    put(against('dresser', b, main, 0.5, W, D, { color: st.wood }));
    put(against('plant', b, main, 0.98, W, D, { color: st.plant, size: { w: 0.5, d: 0.5 } }));
  } else if (/dormitorio|habitaci|cuarto|recámara/.test(t)) {
    const double = /principal/.test(t) || w * d >= 10.5;
    const bed = against(double ? 'bed_double' : 'bed_single', b, main, 0.5, W, D, {
      color: fab[2],
    });
    if (bed) {
      put(bed);
      const shift = ((double ? 1.6 : 1.0) / 2 + 0.3) / (main === 'n' || main === 's' ? W : D);
      for (const sgn of [-1, 1]) {
        const ns = against('nightstand', b, main, 0.5, W, D, { color: st.wood });
        if (main === 'n' || main === 's') ns.x = bed.x + sgn * shift;
        else ns.y = bed.y + sgn * shift;
        put(ns);
      }
      const p = inward(0.55);
      put(
        at('rug', p.x, p.y, ROT[main], W, D, {
          color: fab[1],
          size: { w: double ? 2.2 : 1.6, d: 1.3 },
        }),
      );
    }
    const side = sd.find((s) => s.side !== main && !s.door) || sd.find((s) => s.side !== main);
    put(against('wardrobe', b, side.side, 0.5, W, D));
    put(against('dresser', b, OPP[main], 0.5, W, D, { color: st.wood }));
    put(
      against('plant', b, OPP[main], 0.02, W, D, { color: st.plant, size: { w: 0.45, d: 0.45 } }),
    );
  } else if (/cocina/.test(t)) {
    const len = Math.min(sd[0].len - 0.2, 3.2);
    put(against('kitchen_counter', b, main, 0.35, W, D, { size: { w: Math.max(1.2, len - 0.8) } }));
    put(against('upper_cabinets', b, main, 0.35, W, D, { size: { w: Math.max(1.2, len - 0.8) } }));
    put(against('fridge', b, main, 1, W, D));
    if (w * d > 9)
      put(
        at('island', cx, cy, ROT[main], W, D, { size: { w: Math.min(1.6, Math.max(w, d) * 0.4) } }),
      );
    else put(against('stove', b, OPP[main], 0.5, W, D));
  } else if (/baño/.test(t)) {
    put(against('vanity', b, main, 0.15, W, D));
    put(against('toilet', b, main, 0.75, W, D));
    if (w * d >= 5) put(against('bathtub', b, OPP[main], 0.5, W, D));
    else put(against('shower', b, OPP[main], 0.9, W, D));
  } else if (/estudio|oficina/.test(t)) {
    put(against('desk', b, main, 0.5, W, D));
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
    put(against('washer', b, main, 0.2, W, D));
    put(against('washer', b, main, 0.55, W, D));
  }
  // Keep what fits inside the room, out of door swings and not on top of something else.
  const kept = [];
  for (const it of out) {
    if (!it || !CATALOG[it.kind]) continue;
    if (wanted && !wanted.includes(it.kind)) continue;
    if (it.kind !== 'rug' && !clearOfDoors(it, doors, W, D)) continue;
    if (!fits(it, room, W, D)) continue;
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
    kept.push(it);
  }
  return kept;
}

function dining(out, x, y, W, D, fab, st) {
  out.push(at('dining_table', x, y, 0, W, D, { color: st.wood }));
  for (const [dx, dy, rot] of [
    [-0.4, -0.66, 0],
    [0.4, -0.66, 0],
    [-0.4, 0.66, 180],
    [0.4, 0.66, 180],
  ])
    out.push(at('chair', x + dx, y + dy, rot, W, D, { color: fab[1] }));
}

/** Furnish every room that has a name (or guess "Sala" for the biggest one). */
export function furnishAll(rooms, tags, walls, W, D, styleKey) {
  const items = [];
  rooms.forEach((room, i) => {
    const name = roomName(room, tags) || (i === 0 ? 'Sala-comedor' : guessType(room, W, D));
    items.push(...furnishRoom(room, name, walls, W, D, styleKey));
  });
  return items;
}

/** A reasonable type for an unnamed room from its area. */
export function guessType(room, W, D) {
  const a = room.area;
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
export function placeExtra(kind, room, items, W, D, color) {
  const b = roomBounds(room, W, D),
    size = defaultSize(kind),
    others = items.filter((o) => inRoom(o, room) && o.kind !== 'rug');
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
        if (fits(it, room, W, D) && !others.some((o) => overlaps(o, it, W, D))) return it;
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
