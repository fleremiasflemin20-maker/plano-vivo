// Wall extraction: stroke-width analysis, solid and double-line walls, and the wall
// graph (merging, junction snapping). All coordinates are working-image pixels.
// A wall is { o: 'h' | 'v', c, s0, s1, t }: orientation, centre-line coordinate
// (y for 'h', x for 'v'), span along the axis [s0, s1] and thickness t.
import { open, close, transpose, distanceTransform, strokeWidths } from './raster.mjs';

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
    const ink = smooth(hist, i) * i;
    if (ink > best) {
      best = ink;
      wall = i;
    }
  }
  // The ink weighting pulls the peak towards wider bins; settle on the raw peak nearby.
  const around = wall;
  for (let j = around - 2; j <= around + 2; j++) if ((hist[j] || 0) > hist[wall]) wall = j;
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
    wallMask = new Uint8Array(marks.length);
  if (strokes.solid) {
    // Keep strokes at least ~40 % of the wall width (partitions are often thinner
    // than structural walls) but clearly thicker than the thin linework.
    const k = Math.max(thin + 2, Math.round(wallWidth * 0.4), 3);
    wallMask = open(marks, w, h, k, k);
    const minLen = Math.max(3 * k, Math.round(1.5 * wallWidth));
    walls = bandsBoth(wallMask, w, h, minLen, Math.round(2.2 * wallWidth) + 2, wallWidth);
    walls = mergeCollinear(walls, k);
  }
  return { walls, wallMask, wallWidth, mode: strokes.solid ? 'solid' : 'lines' };
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
