// Drawing scale. Graphic scale bars are recognised by geometry, without reading the
// digits: the tick positions along the bar form a characteristic ratio pattern
// (0 1 2.5 5 → 0, 0.2, 0.5, 1). Door widths are the fallback.
import { at } from './raster.mjs';
import { extractBands } from './walls.mjs';
import { DOOR_WIDTH_M } from './openings.mjs';

// Common graphic scales, in metres. Uniform ones are ambiguous about the unit and
// are tried at several multiples; non-uniform ones are distinctive.
const BARS = [
  [0, 1, 2.5, 5],
  [0, 1, 2, 5],
  [0, 1, 5],
  [0, 1, 3, 5],
  [0, 0.5, 1, 2],
  [0, 2, 5, 10],
  [0, 5, 10, 20],
  [0, 1, 2, 4],
  [0, 2.5, 5, 10],
];
const UNIFORM_UNITS = [1, 0.5, 2, 5];

// Physically plausible wall thickness, used to reject wrong unit guesses.
const WALL_MIN_M = 0.06,
  WALL_MAX_M = 0.7;

/** Ticks along a horizontal bar: columns with ink just above or below the line. */
function ticks(detail, w, h, line) {
  const xs = [],
    y = Math.round(line.c),
    reach = Math.max(4, Math.round((line.s1 - line.s0) * 0.06));
  for (let x = Math.round(line.s0); x <= Math.round(line.s1); x++) {
    let up = 0,
      down = 0;
    for (let d = 2; d <= reach; d++) {
      up += at(detail, w, h, x, y - d - line.t / 2);
      down += at(detail, w, h, x, y + d + line.t / 2);
    }
    if (up >= 2 || down >= 2) xs.push(x);
  }
  // Cluster neighbouring columns into tick positions; the bar ends are ticks too.
  const out = [line.s0];
  for (const x of xs) {
    const last = out[out.length - 1];
    if (x - last > 3) out.push(x);
  }
  if (line.s1 - out[out.length - 1] > 3) out.push(line.s1);
  else out[out.length - 1] = line.s1;
  return out;
}

/** Pieces lying on (nearly) the same row and following each other along x. */
function groupBarPieces(lines) {
  const sorted = lines.slice().sort((a, b) => a.s0 - b.s0),
    groups = [];
  for (const l of sorted) {
    // Extend every chain this piece continues (a nearby label may start a competing
    // chain), and let the piece start its own.
    const extended = groups
      .filter((grp) => {
        const last = grp[grp.length - 1],
          // Alternating blocks are offset by about one block thickness, and each
          // starts where the previous one ends.
          step = Math.max(last.t, l.t) * 1.5 + 2;
        return Math.abs(last.c - l.c) <= step && Math.abs(l.s0 - last.s1) <= step;
      })
      .map((grp) => [...grp, l]);
    groups.push(...extended, [l]);
    if (groups.length > 5000) break;
  }
  return groups;
}

/**
 * An alternating bar's blocks sit alternately above and below (top, bottom, top…)
 * and have similar thickness; a run of text or hatching does not.
 */
function isAlternating(group) {
  const ts = group.map((l) => l.t);
  if (Math.max(...ts) > 2.5 * Math.min(...ts)) return false;
  for (let i = 1; i < group.length; i++) {
    const d = group[i].c - group[i - 1].c;
    if (Math.abs(d) < 1) return false;
    if (i > 1 && Math.sign(d) === Math.sign(group[i - 1].c - group[i - 2].c)) return false;
  }
  return true;
}

/**
 * Division positions of an alternating bar seen as one dark strip: for each column,
 * is the ink in the upper or the lower half? The bar's divisions are where it flips.
 */
function flipDivisions(mask, w, h, band) {
  const mid = (band.y0 + band.y1 + 1) / 2,
    states = [];
  for (let x = Math.round(band.s0); x <= Math.round(band.s1); x++) {
    let up = 0,
      down = 0;
    for (let y = band.y0; y <= band.y1; y++) {
      const v = at(mask, w, h, x, y);
      if (y < mid) up += v;
      else down += v;
    }
    states.push(up > down * 1.5 ? 1 : down > up * 1.5 ? -1 : 0);
  }
  const out = [band.s0];
  let last = 0,
    lastAt = 0;
  states.forEach((st, i) => {
    if (!st) return;
    if (last && st !== last) out.push(band.s0 + (lastAt + i) / 2);
    last = st;
    lastAt = i;
  });
  out.push(band.s1);
  return out;
}

/** Division positions of an alternating bar: piece ends, merged when close. */
function clusterEnds(group) {
  const ends = group.flatMap((l) => [l.s0, l.s1]).sort((a, b) => a - b),
    out = [];
  for (const x of ends) {
    const last = out[out.length - 1];
    if (last && x - last.x <= 8) {
      last.sum += x;
      last.n++;
      last.x = last.sum / last.n;
    } else out.push({ x, sum: x, n: 1 });
  }
  return out.map((c) => c.x);
}

function matchBar(positions) {
  const span = positions[positions.length - 1] - positions[0];
  if (span <= 0) return null;
  const r = positions.map((x) => (x - positions[0]) / span);
  const candidates = [];
  for (const bar of BARS) {
    if (bar.length !== r.length) continue;
    const L = bar[bar.length - 1],
      err = Math.max(...bar.map((v, i) => Math.abs(v / L - r[i])));
    if (err < 0.04) candidates.push({ metres: [L], err, uniform: false });
  }
  // Evenly spaced ticks: 0, u, 2u, …
  const n = r.length - 1,
    uniformErr = Math.max(...r.map((v, i) => Math.abs(v - i / n)));
  if (n >= 2 && uniformErr < 0.04)
    candidates.push({ metres: UNIFORM_UNITS.map((u) => u * n), err: uniformErr, uniform: true });
  return candidates.sort((a, b) => a.uniform - b.uniform || a.err - b.err)[0] || null;
}

/**
 * @param sources [{ lines, mask }]: candidate segments and the mask to read ticks from
 * @param walls   detected walls (the bar is drawn outside the building)
 * @returns { metresPerPx, source: 'bar', barMetres, … } or null
 */
export function scaleFromBar(sources, walls, w, h, wallWidth) {
  if (!walls.length) return null;
  const bx0 = Math.min(...walls.map((q) => (q.o === 'h' ? q.s0 : q.c))),
    bx1 = Math.max(...walls.map((q) => (q.o === 'h' ? q.s1 : q.c))),
    by0 = Math.min(...walls.map((q) => (q.o === 'h' ? q.c : q.s0))),
    by1 = Math.max(...walls.map((q) => (q.o === 'h' ? q.c : q.s1))),
    outside = (b) => !(b.c > by0 && b.c < by1 && b.s1 > bx0 && b.s0 < bx1),
    minSpan = Math.max(40, w * 0.03);
  let best = null;
  const consider = (pos, s0, s1) => {
    if (pos.length < 3 || pos.length > 8) return;
    const match = matchBar(pos);
    if (!match) return;
    for (const metres of match.metres) {
      const metresPerPx = metres / (s1 - s0),
        wall = wallWidth * metresPerPx;
      if (wall < WALL_MIN_M || wall > WALL_MAX_M) continue;
      // A distinctive (non-uniform) pattern beats evenly spaced ticks, which paving
      // or grid lines can imitate; ties (fits within 1 %) go to the longer bar.
      const span = s1 - s0,
        better =
          !best ||
          (best.uniform && !match.uniform) ||
          (best.uniform === match.uniform &&
            (match.err < best.err - 0.01 || (match.err <= best.err + 0.01 && span > best.span)));
      if (better)
        best = {
          metresPerPx,
          source: 'bar',
          err: match.err,
          uniform: match.uniform,
          barMetres: metres,
          span,
        };
      break;
    }
  };
  // Bars are drawn in many ways (dark blocks, light lines with dark dots…), so each
  // source pairs candidate lines with the mask their ticks are read from.
  for (const { lines, mask: detail } of sources) {
    // Bar candidates: a single ruled line with ticks, or an alternating bar drawn as
    // staggered pieces (filled/empty blocks) whose ends mark the divisions.
    const groups = groupBarPieces(lines.filter((l) => l.o === 'h' && outside(l)));
    // Alternating bars as single dark strips (blocks touching above/below).
    for (const band of extractBands(detail, w, h, minSpan, Infinity))
      if (outside(band) && band.t >= 3 && band.t <= 4 * Math.max(4, wallWidth * 0.5))
        consider(flipDivisions(detail, w, h, band), band.s0, band.s1);
    // Ruled lines with ticks, and alternating bars drawn as separate blocks.
    for (const group of groups) {
      const s0 = Math.min(...group.map((l) => l.s0)),
        s1 = Math.max(...group.map((l) => l.s1));
      if (s1 - s0 < minSpan) continue;
      if (group.length > 1 && !isAlternating(group)) continue;
      consider(group.length > 1 ? clusterEnds(group) : ticks(detail, w, h, group[0]), s0, s1);
    }
  }
  return best;
}

/** Scale from doors with a drawn swing; needs at least two to be trusted. */
export function scaleFromDoors(openings, wallWidth) {
  const widths = openings
    .filter((op) => op.kind === 'door' && op.swing)
    .map((op) => op.s1 - op.s0)
    .sort((a, b) => a - b);
  if (widths.length < 2) return null;
  const metresPerPx = DOOR_WIDTH_M / widths[widths.length >> 1],
    wall = wallWidth * metresPerPx;
  if (wall < WALL_MIN_M || wall > WALL_MAX_M) return null;
  return { metresPerPx, source: 'doors', doors: widths.length };
}
