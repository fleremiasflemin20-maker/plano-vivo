// Wall extraction: stroke-width analysis, solid and double-line walls, and the wall
// graph (merging, junction snapping). All coordinates are working-image pixels.
// A wall is { o: 'h' | 'v', c, s0, s1, t }: orientation, centre-line coordinate
// (y for 'h', x for 'v'), span along the axis [s0, s1] and thickness t.
import {
  open,
  close,
  dilate,
  and,
  andNot,
  transpose,
  distanceTransform,
  strokeWidths,
  discOpen,
  slantedPixels,
} from './raster.mjs';

// Narrowest stroke (px, at working resolution) that can be a wall.
const MIN_WALL = 3;

// Ridge widths come out mostly odd (2·d − 1), so smooth over ±2 bins.
const smooth = (hist, i) => {
  let n = 0;
  for (let j = i - 2; j <= i + 2; j++) n += hist[j] || 0;
  return n;
};

/**
 * Typical stroke widths. `wall` is the width carrying the most ink (stroke length ×
 * width); `thin` is the most common width among strokes clearly thinner than that
 * (furniture, text, hatching, glazing).
 */
export function analyseStrokes(marks, w, h) {
  const dist = distanceTransform(marks, w, h),
    hist = strokeWidths(dist, w, h);
  let wall = 1,
    best = 0,
    totalInk = 0;
  for (let i = 1; i < hist.length; i++) {
    totalInk += hist[i] * i;
    // Hairlines (1–2 px: dashes, outlines, hatching) can add up to as much ink as the
    // walls in detailed plans, but a wall is never that thin at working resolution.
    if (i < MIN_WALL) continue;
    const ink = smooth(hist, i) * i;
    if (ink > best) {
      best = ink;
      wall = i;
    }
  }
  // The ink weighting pulls the peak towards wider bins; settle on the raw peak nearby.
  const around = wall;
  for (let j = Math.max(MIN_WALL, around - 2); j <= around + 2; j++)
    if ((hist[j] || 0) > hist[wall]) wall = j;
  let thin = 1;
  for (let i = 1; i < Math.max(2, wall * 0.6); i++)
    if (smooth(hist, i) > smooth(hist, thin)) thin = i;
  // Solid walls: clearly heavier than the linework and a real share of the ink.
  // Otherwise it is a single-weight (line) drawing: walls are double lines or axes.
  const share = (smooth(hist, wall) * wall) / totalInk,
    solid = wall >= Math.max(thin + 2, thin * 1.8) && share >= 0.12;
  return { thin: Math.min(thin, wall), wall: solid ? wall : 0, solid, dist };
}

/**
 * Group long axis-aligned runs of `mask` into bands (rectangles). Horizontal bands
 * from rows; call with a transposed mask for vertical ones.
 */
export function extractBands(mask, w, h, minLen, maxThickness, strict = false) {
  const bands = [],
    active = [];
  for (let y = 0; y < h; y++) {
    const row = y * w,
      runs = [];
    for (let x = 0; x < w;) {
      if (!mask[row + x]) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < w && mask[row + x]) x++;
      if (x - x0 >= minLen) runs.push([x0, x - 1]);
    }
    const next = [];
    for (const [x0, x1] of runs) {
      let match = null;
      for (const b of active) {
        if (b.used) continue;
        // Walls tolerate ragged anti-aliased edge rows (overlap vs. the shorter run);
        // linework requires similar extents, so touching elements stay separate.
        const ov = Math.min(x1, b.x1) - Math.max(x0, b.x0),
          ref = strict ? Math.max(x1 - x0, b.x1 - b.x0) : Math.min(x1 - x0, b.x1 - b.x0);
        if (ov >= ref * 0.8) {
          match = b;
          break;
        }
      }
      if (match) {
        match.used = true;
        match.y1 = y;
        match.x0s.push(x0);
        match.x1s.push(x1);
        match.x0 = x0;
        match.x1 = x1;
        next.push(match);
      } else next.push({ y0: y, y1: y, x0, x1, x0s: [x0], x1s: [x1], used: true });
    }
    for (const b of active) if (!next.includes(b)) bands.push(b);
    for (const b of next) b.used = false;
    active.length = 0;
    active.push(...next);
  }
  bands.push(...active);
  const median = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
  return bands
    .map((b) => ({
      c: (b.y0 + b.y1) / 2,
      s0: median(b.x0s),
      s1: median(b.x1s),
      t: b.y1 - b.y0 + 1,
      y0: b.y0,
      y1: b.y1,
    }))
    .filter((b) => b.t <= maxThickness && b.s1 - b.s0 + 1 >= minLen);
}

/**
 * Re-join pieces of one wall that banding split across its thickness (an element
 * touching the wall changes the run length of some rows): parallel bands with the
 * same extent, stacked with a gap smaller than `gap`.
 */
function mergeStacked(bands, gap) {
  const sorted = bands.slice().sort((a, b) => a.y0 - b.y0),
    out = [];
  for (const b of sorted) {
    const q = out.find((q) => {
      const ov = Math.min(q.s1, b.s1) - Math.max(q.s0, b.s0),
        longer = Math.max(q.s1 - q.s0, b.s1 - b.s0);
      return ov >= 0.8 * longer && b.y0 - q.y1 - 1 <= gap && b.y0 > q.y0;
    });
    if (!q) {
      out.push({ ...b });
      continue;
    }
    q.y1 = Math.max(q.y1, b.y1);
    q.s0 = Math.min(q.s0, b.s0);
    q.s1 = Math.max(q.s1, b.s1);
    q.t = q.y1 - q.y0 + 1;
    q.c = (q.y0 + q.y1) / 2;
  }
  return out;
}

/** Bands in both orientations, as walls. */
function bandsBoth(mask, w, h, minLen, maxThickness, stackGap = 0) {
  const both = (m, ww, hh) => {
    const bands = extractBands(m, ww, hh, minLen, Infinity);
    return (stackGap ? mergeStacked(bands, stackGap) : bands).filter((b) => b.t <= maxThickness);
  };
  const hb = both(mask, w, h).map((b) => ({ ...b, o: 'h' })),
    vb = both(transpose(mask, w, h), h, w).map((b) => ({ ...b, o: 'v' }));
  return hb.concat(vb);
}

/** Merge touching or overlapping parallel pieces of the same wall. */
export function mergeCollinear(walls, joinGap) {
  const out = [];
  const sorted = walls.slice().sort((a, b) => a.o.localeCompare(b.o) || a.c - b.c || a.s0 - b.s0);
  for (const w of sorted) {
    const same = out.find(
      (q) =>
        q.o === w.o &&
        Math.abs(q.c - w.c) <= Math.max(q.t, w.t) / 2 &&
        w.s0 <= q.s1 + joinGap &&
        w.s1 >= q.s0 - joinGap,
    );
    if (!same) {
      out.push({ ...w });
      continue;
    }
    // Weighted centre and thickness, union of spans.
    const lq = same.s1 - same.s0,
      lw = w.s1 - w.s0;
    same.c = (same.c * lq + w.c * lw) / (lq + lw || 1);
    same.t = Math.max(same.t, w.t);
    same.s0 = Math.min(same.s0, w.s0);
    same.s1 = Math.max(same.s1, w.s1);
  }
  return out;
}

/**
 * Double-line walls: pairs of parallel thin lines with nothing between them.
 * Regularly spaced series (hatching, stair treads) are rejected.
 */
function doubleLineWalls(thinLines, maxGap, minGap) {
  const walls = [];
  for (const o of ['h', 'v']) {
    const lines = thinLines.filter((l) => l.o === o).sort((a, b) => a.c - b.c);
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i];
      for (let j = i + 1; j < lines.length; j++) {
        const b = lines[j],
          gap = b.c - a.c;
        if (gap > maxGap) break;
        if (gap < minGap) continue;
        const ov = Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0),
          shorter = Math.min(a.s1 - a.s0, b.s1 - b.s0);
        if (ov < shorter * 0.7) continue;
        // Something else between them -> not an empty wall section.
        const between = lines.some(
          (m) => m !== a && m !== b && m.c > a.c && m.c < b.c && m.s1 > a.s0 && m.s0 < a.s1,
        );
        if (between) break;
        // Part of an evenly spaced series?
        const prev = lines.find(
          (m) => m !== a && Math.abs(a.c - m.c - gap) < gap * 0.2 && m.s1 > a.s0 && m.s0 < a.s1,
        );
        const after = lines.find(
          (m) => m !== b && Math.abs(m.c - b.c - gap) < gap * 0.2 && m.s1 > b.s0 && m.s0 < b.s1,
        );
        if (!(prev && after))
          walls.push({
            o,
            c: (a.c + b.c) / 2,
            s0: Math.max(a.s0, b.s0),
            s1: Math.min(a.s1, b.s1),
            t: gap + Math.max(a.t, b.t),
            double: true,
          });
        break;
      }
    }
  }
  return walls;
}

/**
 * Thin line segments (both orientations) from a thin-stroke mask. Small breaks along
 * each line (dashes, compression artefacts in low-resolution images) are bridged
 * first, separately per direction so perpendicular lines are not smeared.
 */
export function thinSegments(mask, w, h, minLen, maxThickness, bridge = 5, strict = true) {
  const rows = close(mask, w, h, bridge, 1),
    cols = transpose(close(mask, w, h, 1, bridge), w, h),
    hb = extractBands(rows, w, h, minLen, maxThickness, strict).map((b) => ({ ...b, o: 'h' })),
    vb = extractBands(cols, h, w, minLen, maxThickness, strict).map((b) => ({ ...b, o: 'v' }));
  return hb.concat(vb);
}

/**
 * Detect walls. Returns walls plus the solid wall mask (used to separate thin
 * details such as windows, door arcs and stairs).
 */
export function detectWalls(marks, w, h, strokes) {
  const { thin } = strokes;
  let wallWidth = strokes.wall,
    walls = [],
    wallMask = new Uint8Array(marks.length),
    slanted = wallMask,
    tensor = null;
  if (strokes.solid) {
    // Keep strokes at least ~40 % of the wall width (partitions are often thinner
    // than structural walls) but clearly thicker than the thin linework.
    const k = Math.max(thin + 2, Math.round(wallWidth * 0.4), 3);
    wallMask = open(marks, w, h, k, k);
    // Walls at an angle are set apart first: banded row by row they would come out
    // as a staircase of short axis-aligned pieces. A disc keeps thin partitions at
    // 45° that a square element erases.
    const heavy = discOpen(strokes.dist, w, h, k / 2);
    tensor = slantedPixels(heavy, w, h, Math.max(3, Math.round(wallWidth * 0.75)));
    slanted = andNot(
      and(heavy, tensor.mask),
      // Near a junction the orientation window also sees the diagonal: pixels on long
      // straight runs belong to the axis wall all the same.
      longRuns(wallMask, w, h, 4 * wallWidth),
    );
    const axisMask = andNot(wallMask, dilate(slanted, w, h, 3, 3));
    const minLen = Math.max(3 * k, Math.round(1.5 * wallWidth));
    walls = bandsBoth(axisMask, w, h, minLen, Math.round(2.2 * wallWidth) + 2, wallWidth);
    walls = mergeCollinear(walls, k);
  }
  return { walls, wallMask, slanted, tensor, wallWidth, mode: strokes.solid ? 'solid' : 'lines' };
}

/** Pixels on horizontal or vertical runs of at least `min` set pixels. */
function longRuns(mask, w, h, min) {
  const out = new Uint8Array(mask.length);
  const mark = (get, set, n, lines) => {
    for (let a = 0; a < lines; a++)
      for (let b = 0; b < n;) {
        if (!mask[get(a, b)]) {
          b++;
          continue;
        }
        const b0 = b;
        while (b < n && mask[get(a, b)]) b++;
        if (b - b0 >= min) for (let i = b0; i < b; i++) out[set(a, i)] = 1;
      }
  };
  const row = (y, x) => y * w + x,
    col = (x, y) => y * w + x;
  mark(row, row, w, h);
  mark(col, col, h, w);
  return out;
}

/** Fallback for single-weight drawings: double lines, or the thin strokes themselves. */
export function lineDrawingWalls(thinLines, w, h, thin) {
  const maxGap = Math.max(10, Math.round(Math.max(w, h) * 0.025)),
    double = doubleLineWalls(thinLines, maxGap, Math.max(3, 2 * thin + 1));
  const doubleLength = double.reduce((n, l) => n + l.s1 - l.s0, 0),
    total = thinLines.reduce((n, l) => n + l.s1 - l.s0, 0);
  if (double.length >= 4 && doubleLength > total * 0.15)
    return { walls: mergeCollinear(double, thin * 3), wallWidth: median(double.map((d) => d.t)) };
  // Single-line plan: every long thin line is a wall centre line.
  const minLen = Math.max(20, Math.round(Math.max(w, h) * 0.03)),
    long = thinLines.filter((l) => l.s1 - l.s0 >= minLen).map((l) => ({ ...l, t: thin }));
  return { walls: mergeCollinear(long, thin * 3), wallWidth: thin };
}

const median = (a) => (a.length ? a.slice().sort((p, q) => p - q)[a.length >> 1] : 0);

/**
 * Connect the wall graph: move free ends onto perpendicular walls they reach (L and
 * T junctions), so rooms close and the 3D corners meet.
 */
export function snapJunctions(walls, tolerance) {
  const perpendicular = (w) => walls.filter((q) => q.o !== w.o);
  for (const w of walls) {
    for (const end of ['s0', 's1']) {
      const pos = w[end];
      let best = null,
        bestDist = Infinity;
      for (const q of perpendicular(w)) {
        // q's centre line is at coordinate q.c along w's axis; w's centre line must
        // fall within q's span (allowing for q reaching just short of it).
        const reach = Math.max(q.t, w.t) / 2 + tolerance,
          along = Math.abs(q.c - pos),
          inSpan = w.c >= q.s0 - reach && w.c <= q.s1 + reach;
        if (!inSpan || along > reach) continue;
        if (along < bestDist) {
          bestDist = along;
          best = q;
        }
      }
      if (!best) continue;
      w[end] = best.c;
      w.joined = w.joined || {};
      w.joined[end] = true;
      // Extend q so that it reaches w's centre line (L corners drawn short).
      if (w.c < best.s0) best.s0 = w.c;
      if (w.c > best.s1) best.s1 = w.c;
    }
  }
  return walls;
}

/**
 * Diagonal walls: heavy strokes left over once the axis-aligned walls are removed.
 * Each connected leftover that is long, straight and about one wall thick (principal
 * component analysis of its pixels) becomes a wall { o: 'd', x0, y0, x1, y1, t }.
 * Ends are extended onto the axis walls they meet, and those walls' ends onto it.
 */
export function diagonalWalls(slanted, tensor, walls, w, h, wallWidth) {
  const residual = slanted;
  const seen = new Uint8Array(w * h),
    stack = new Int32Array(w * h),
    out = [];
  for (let start = 0; start < residual.length; start++) {
    if (!residual[start] || seen[start]) continue;
    // Flood fill (8-connected), accumulating moments for the principal axis.
    let top = 0,
      n = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0,
      ta = 0,
      tb = 0,
      tc = 0;
    const pixels = [];
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const k = stack[--top],
        x = k % w,
        y = (k - x) / w;
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      ta += tensor.sxx[k];
      tb += tensor.syy[k];
      tc += tensor.sxy[k];
      pixels.push(k);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (residual[j] && !seen[j]) {
            seen[j] = 1;
            stack[top++] = j;
          }
        }
    }
    if (n < wallWidth * wallWidth * 1.5) continue;
    // Direction from the edge orientation of the uncut strokes (the tensor), not from
    // the pixel cloud: pieces are cut square where they meet axis walls, which skews
    // the shape of short pieces.
    const mx = sx / n,
      my = sy / n,
      angle = 0.5 * Math.atan2(2 * tc, ta - tb) + Math.PI / 2,
      ux = Math.cos(angle),
      uy = Math.sin(angle);
    // Axis-aligned leftovers are stubs of walls already found.
    const deg = Math.abs(((angle * 180) / Math.PI) % 90);
    if (deg < 8 || deg > 82) continue;
    let a0 = Infinity,
      a1 = -Infinity,
      p0 = Infinity,
      p1 = -Infinity;
    for (const k of pixels) {
      const x = (k % w) - mx,
        y = Math.floor(k / w) - my,
        along = x * ux + y * uy,
        across = -x * uy + y * ux;
      if (along < a0) a0 = along;
      if (along > a1) a1 = along;
      if (across < p0) p0 = across;
      if (across > p1) p1 = across;
    }
    const length = a1 - a0 + 1,
      t = p1 - p0 + 1,
      // Centre line through the middle of the cross-section.
      mid = (p0 + p1) / 2,
      cx = mx - uy * mid,
      cy = my + ux * mid;
    // Straight and wall-thick: the pixels fill the oriented box; not a blob or a curve.
    if (length < 2 * wallWidth || t > 2.2 * wallWidth || t < 0.4 * wallWidth) continue;
    if (n < 0.5 * length * t) continue;
    out.push({ o: 'd', x0: cx + ux * a0, y0: cy + uy * a0, x1: cx + ux * a1, y1: cy + uy * a1, t });
  }
  // Junction blobs where a diagonal meets a wall leave short axis stubs: drop them.
  for (let i = walls.length - 1; i >= 0; i--) {
    const q = walls[i];
    if (q.s1 - q.s0 >= 1.5 * wallWidth) continue;
    const mid = q.o === 'h' ? { x: (q.s0 + q.s1) / 2, y: q.c } : { x: q.c, y: (q.s0 + q.s1) / 2 };
    const near = out.some((d) =>
      [
        [d.x0, d.y0],
        [d.x1, d.y1],
      ].some(([x, y]) => Math.hypot(x - mid.x, y - mid.y) <= 1.5 * wallWidth),
    );
    if (near) walls.splice(i, 1);
  }
  for (const d of out) joinDiagonal(d, walls);
  return out;
}

/** Intersection of a diagonal's centre line with an axis wall's centre line. */
function crossing(d, q) {
  const dx = d.x1 - d.x0,
    dy = d.y1 - d.y0;
  if (q.o === 'h') {
    if (Math.abs(dy) < 1e-6) return null;
    const s = (q.c - d.y0) / dy;
    return { x: d.x0 + dx * s, y: q.c, s };
  }
  if (Math.abs(dx) < 1e-6) return null;
  const s = (q.c - d.x0) / dx;
  return { x: q.c, y: d.y0 + dy * s, s };
}

function joinDiagonal(d, walls) {
  for (const end of [0, 1]) {
    const ex = end ? d.x1 : d.x0,
      ey = end ? d.y1 : d.y0;
    let best = null;
    for (const q of walls) {
      const p = crossing(d, q);
      if (!p) continue;
      const along = q.o === 'h' ? p.x : p.y,
        reach = (q.t + d.t) * 1.2,
        dist = Math.hypot(p.x - ex, p.y - ey);
      if (along < q.s0 - reach || along > q.s1 + reach || dist > reach) continue;
      if (!best || dist < best.dist) best = { q, p, dist };
    }
    if (!best) continue;
    const { q, p } = best;
    if (end) [d.x1, d.y1] = [p.x, p.y];
    else [d.x0, d.y0] = [p.x, p.y];
    d.joined = d.joined || {};
    d.joined[end ? 's1' : 's0'] = true;
    // The axis wall stopped where the diagonal began: carry its end to the crossing.
    const along = q.o === 'h' ? p.x : p.y;
    if (Math.abs(along - q.s0) < Math.abs(along - q.s1)) {
      if (Math.abs(along - q.s0) <= best.dist + q.t + d.t) q.s0 = along;
    } else if (Math.abs(along - q.s1) <= best.dist + q.t + d.t) q.s1 = along;
  }
}

/**
 * Openings in diagonal walls: two collinear diagonal pieces with a gap between them.
 * Linework running along the gap (glazing) makes it a window, otherwise a door.
 * Pieces separated by less than a wall thickness are rejoined.
 */
export function diagonalOpenings(diagonals, marks, w, h, wallWidth) {
  const openings = [],
    dir = (d) => {
      const L = Math.hypot(d.x1 - d.x0, d.y1 - d.y0) || 1;
      return { ux: (d.x1 - d.x0) / L, uy: (d.y1 - d.y0) / L, L };
    };
  for (let i = 0; i < diagonals.length; i++)
    for (let j = i + 1; j < diagonals.length; j++) {
      const a = diagonals[i],
        b = diagonals[j];
      if (!a || !b) continue;
      const { ux, uy, L } = dir(a),
        db = dir(b);
      if (Math.abs(ux * db.uy - uy * db.ux) > 0.07) continue; // > 4° apart
      // b's end points in a's frame: along and across a's centre line.
      const frame = (x, y) => ({
        s: (x - a.x0) * ux + (y - a.y0) * uy,
        n: -(x - a.x0) * uy + (y - a.y0) * ux,
      });
      const p = frame(b.x0, b.y0),
        q = frame(b.x1, b.y1);
      if (Math.max(Math.abs(p.n), Math.abs(q.n)) > Math.max(a.t, b.t)) continue;
      const bs0 = Math.min(p.s, q.s),
        bs1 = Math.max(p.s, q.s),
        gap0 = bs0 > L ? L : bs1,
        gap1 = bs0 > L ? bs0 : 0,
        gap = gap1 - gap0;
      if (gap < 0 || gap > 10 * wallWidth) continue;
      const at = (s) => ({ x: a.x0 + ux * s, y: a.y0 + uy * s }),
        start = at(gap0),
        end = at(gap1);
      if (gap < Math.max(4, 0.8 * wallWidth)) {
        // Same wall, split by a junction or noise: join.
        const ends = [at(0), at(L), at(bs0), at(bs1)].sort((m, n) => m.x - n.x || m.y - n.y);
        Object.assign(a, {
          x0: ends[0].x,
          y0: ends[0].y,
          x1: ends[3].x,
          y1: ends[3].y,
          t: Math.max(a.t, b.t),
        });
        diagonals[j] = null;
        continue;
      }
      if (gap < 1.5 * wallWidth) continue;
      // Glazing: ink along lines parallel to the wall inside the gap.
      let glazed = false;
      const t = Math.max(a.t, b.t);
      for (let off = -t / 2; off <= t / 2 && !glazed; off += 1) {
        let ink = 0,
          n = 0;
        for (let s = gap0 + 2; s <= gap1 - 2; s += 1, n++) {
          const x = Math.round(a.x0 + ux * s - uy * off),
            y = Math.round(a.y0 + uy * s + ux * off);
          if (x >= 0 && y >= 0 && x < w && y < h) ink += marks[y * w + x];
        }
        if (n && ink >= 0.7 * n) glazed = true;
      }
      openings.push({
        x0: start.x,
        y0: start.y,
        x1: end.x,
        y1: end.y,
        t,
        kind: glazed ? 'window' : 'door',
      });
    }
  return { diagonals: diagonals.filter(Boolean), openings };
}
