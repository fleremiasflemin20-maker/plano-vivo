// Openings: gaps between collinear walls, or between a wall's free end and the face
// of a perpendicular wall. Each gap is classified from the ink inside and around it:
// thin lines across the gap = window, an arc or a leaf = door, nothing = passage.
import { at } from './raster.mjs';

// Typical interior door leaf, used to estimate the drawing scale.
export const DOOR_WIDTH_M = 0.85;

/** Ink fraction of the band [s0, s1] × [c - t/2, c + t/2], per line across the wall. */
function gapProfile(marks, w, h, o, c, s0, s1, t) {
  const across = [],
    half = Math.max(1, t / 2);
  let ink = 0,
    total = 0;
  for (let q = Math.round(c - half); q <= Math.round(c + half); q++) {
    let n = 0,
      m = 0;
    for (let s = Math.ceil(s0); s <= Math.floor(s1); s++) {
      const v = o === 'h' ? at(marks, w, h, s, q) : at(marks, w, h, q, s);
      n += v;
      m++;
    }
    across.push(m ? n / m : 0);
    ink += n;
    total += m;
  }
  return { across, fill: total ? ink / total : 0 };
}

/** Count separate lines running along the gap (consecutive rows above 60 % ink). */
function spanningLines(across) {
  let lines = 0,
    inLine = false;
  for (const f of across) {
    if (f >= 0.6 && !inLine) lines++;
    inLine = f >= 0.6;
  }
  return lines;
}

/** Fraction of sample points with ink within `r` px. */
function inkAlong(marks, w, h, points, r = 2) {
  let hits = 0;
  for (const [x, y] of points) {
    let hit = 0;
    for (let dy = -r; dy <= r && !hit; dy++)
      for (let dx = -r; dx <= r && !hit; dx++) hit = at(marks, w, h, x + dx, y + dy);
    hits += hit;
  }
  return points.length ? hits / points.length : 0;
}

/**
 * Look for a door swing: a quarter arc of radius = gap width centred on either jamb,
 * on either side of the wall, or the open leaf drawn perpendicular to the wall.
 */
function findSwing(marks, w, h, o, c, s0, s1) {
  const g = s1 - s0,
    toXY = (s, q) => (o === 'h' ? [s, q] : [q, s]);
  let best = null;
  for (const hinge of ['s0', 's1'])
    for (const side of [-1, 1]) {
      const hs = hinge === 's0' ? s0 : s1,
        dir = hinge === 's0' ? 1 : -1,
        arc = [],
        leaf = [];
      for (let k = 2; k <= 13; k++) {
        const phi = (k / 15) * (Math.PI / 2);
        arc.push(toXY(hs + dir * g * Math.cos(phi), c + side * g * Math.sin(phi)));
      }
      for (let k = 3; k <= 9; k++) leaf.push(toXY(hs, c + (side * g * k) / 10));
      const score = Math.max(inkAlong(marks, w, h, arc), inkAlong(marks, w, h, leaf) * 0.95);
      if (!best || score > best.score) best = { hinge, side, score };
    }
  return best && best.score >= 0.55 ? best : null;
}

function classify(marks, w, h, o, c, s0, s1, t) {
  const { across, fill } = gapProfile(marks, w, h, o, c, s0 + 1, s1 - 1, t);
  if (fill >= 0.7) return { kind: 'wall' };
  if (spanningLines(across) >= 1) return { kind: 'window' };
  const swing = findSwing(marks, w, h, o, c, s0, s1);
  return swing ? { kind: 'door', swing } : { kind: 'passage' };
}

/**
 * @param walls    merged walls (before junction snapping)
 * @param marks    all ink
 * @param detail   ink that is not part of the walls (thin linework)
 */
export function detectOpenings(walls, marks, detail, w, h, wallWidth) {
  const minGap = Math.max(6, 1.2 * wallWidth),
    maxGap = Math.max(40, 14 * wallWidth),
    openings = [],
    joins = [];
  const crossing = (o, c, s0, s1) =>
    walls.some((q) => q.o !== o && q.c > s0 && q.c < s1 && c >= q.s0 - 1 && c <= q.s1 + 1);

  // 1. Gaps between collinear walls.
  for (const a of walls) {
    let next = null;
    for (const b of walls) {
      if (b === a || b.o !== a.o || b.s0 <= a.s1) continue;
      if (Math.abs(a.c - b.c) > Math.max(a.t, b.t) / 2 + 1) continue;
      if (!next || b.s0 < next.s0) next = b;
    }
    if (!next) continue;
    const s0 = a.s1,
      s1 = next.s0,
      g = s1 - s0;
    if (g < minGap || g > maxGap || crossing(a.o, a.c, s0, s1)) continue;
    const c = (a.c + next.c) / 2,
      t = Math.max(a.t, next.t),
      kind = classify(detail, w, h, a.o, c, s0, s1, t);
    if (kind.kind === 'wall') joins.push([a, next]);
    else openings.push({ o: a.o, c, s0, s1, t, ...kind, ends: [a, next] });
  }

  // 2. Gaps between a free wall end and the face of a perpendicular wall.
  for (const a of walls)
    for (const end of ['s0', 's1']) {
      const pos = a[end],
        dir = end === 's1' ? 1 : -1;
      // Already closed by a collinear opening, or touching a perpendicular wall?
      if (openings.some((op) => op.ends?.includes(a) && (end === 's1' ? op.s0 : op.s1) === pos))
        continue;
      const touching = walls.some(
        (q) =>
          q.o !== a.o &&
          Math.abs(q.c - pos) <= q.t / 2 + a.t &&
          a.c >= q.s0 - a.t &&
          a.c <= q.s1 + a.t,
      );
      if (touching) continue;
      let face = null;
      for (const q of walls) {
        if (q.o === a.o || a.c < q.s0 - 1 || a.c > q.s1 + 1) continue;
        const f = q.c - (dir * q.t) / 2,
          g = (f - pos) * dir;
        if (g > 0 && (!face || g < face.g)) face = { g, f, q };
      }
      if (!face || face.g < minGap || face.g > maxGap) continue;
      // A collinear wall starting before the face means this is case 1, not an opening.
      const s0 = Math.min(pos, face.f),
        s1 = Math.max(pos, face.f);
      if (
        walls.some(
          (b) =>
            b !== a &&
            b.o === a.o &&
            Math.abs(b.c - a.c) <= Math.max(a.t, b.t) / 2 + 1 &&
            b.s1 > s0 &&
            b.s0 < s1,
        )
      )
        continue;
      const kind = classify(detail, w, h, a.o, a.c, s0, s1, a.t);
      if (kind.kind === 'wall') continue;
      openings.push({ o: a.o, c: a.c, s0, s1, t: a.t, ...kind });
    }

  // Gaps that are really drawn as continuous wall (e.g. a lighter tone): join them.
  for (const [a, b] of joins) {
    a.s1 = Math.max(a.s1, b.s1);
    a.t = Math.max(a.t, b.t);
    b.removed = true;
  }
  return { openings, walls: walls.filter((x) => !x.removed) };
}
