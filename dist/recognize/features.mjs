// Stairs and terraces from regular series of thin parallel lines.
//   stair:   one direction, ≥ 5 treads, short regular spacing.
//   terrace: paving/decking — a regular series crossed by a perpendicular series,
//            or a long series with wide spacing.

/**
 * Treat interrupted pieces on the same line (a joint hidden by furniture or text)
 * as one line when at least 60 % of the joined extent is inked.
 */
function joinInterrupted(lines) {
  const sorted = lines.slice().sort((a, b) => a.c - b.c || a.s0 - b.s0),
    out = [];
  for (const l of sorted) {
    const prev = out.find((q) => Math.abs(q.c - l.c) <= 1.5 && l.s0 >= q.s0);
    if (prev) {
      const ink = prev.ink + (l.s1 - l.s0),
        s1 = Math.max(prev.s1, l.s1);
      if (ink >= 0.6 * (s1 - prev.s0)) {
        prev.s1 = s1;
        prev.ink = ink;
        continue;
      }
    }
    out.push({ ...l, ink: l.s1 - l.s0 });
  }
  return out;
}

// Treads and paving joints are regular; furniture outlines are not.
const SPACING_TOLERANCE = 0.18;
// Maximum tread spacing, in wall thicknesses.
const STAIR_MAX_SPACING = 1.8;

/** Longest chains of evenly spaced, overlapping parallel lines. */
function series(lines, minCount, maxSpacing) {
  const sorted = joinInterrupted(lines).sort((a, b) => a.c - b.c),
    used = new Set(),
    out = [];
  for (const seed of sorted) {
    if (used.has(seed)) continue;
    const overlaps = (l) => {
      const ov = Math.min(l.s1, seed.s1) - Math.max(l.s0, seed.s0);
      // Similar extents: treads and paving joints run edge to edge of the same area.
      return ov >= 0.7 * Math.max(l.s1 - l.s0, seed.s1 - seed.s0);
    };
    let best = null;
    // Try each next line as the one defining the spacing.
    for (const first of sorted) {
      if (first.c <= seed.c + 2 || first.c - seed.c > maxSpacing) continue;
      if (used.has(first) || !overlaps(first)) continue;
      const spacing = first.c - seed.c,
        chain = [seed, first];
      let last = first;
      for (const l of sorted) {
        if (l.c <= last.c || used.has(l) || !overlaps(l)) continue;
        const d = l.c - last.c;
        if (Math.abs(d - spacing) <= spacing * SPACING_TOLERANCE) {
          chain.push(l);
          last = l;
        } else if (d > spacing * 1.3) break;
      }
      if (!best || chain.length > best.chain.length) best = { chain, spacing };
    }
    if (best && best.chain.length >= minCount) {
      best.chain.forEach((l) => used.add(l));
      const s0 = median(best.chain.map((l) => l.s0)),
        s1 = median(best.chain.map((l) => l.s1));
      out.push({
        o: seed.o,
        c0: best.chain[0].c,
        c1: best.chain[best.chain.length - 1].c,
        s0,
        s1,
        count: best.chain.length,
        spacing: best.spacing,
      });
    }
  }
  return out;
}

const median = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];

/** Series rectangle in image coordinates. */
const rect = (s) =>
  s.o === 'h'
    ? { x0: s.s0, y0: s.c0, x1: s.s1, y1: s.c1 }
    : { x0: s.c0, y0: s.s0, x1: s.c1, y1: s.s1 };

function overlapRatio(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
    h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
  return (w * h) / Math.min(area(a), area(b));
}

/** Join features of the same type that overlap or touch (e.g. paving split by a joint). */
function mergeTouching(features, gap) {
  const out = [];
  for (const f of features) {
    const same = out.find(
      (q) =>
        q.type === f.type &&
        f.type === 'terrace' &&
        f.x0 <= q.x1 + gap &&
        f.x1 >= q.x0 - gap &&
        f.y0 <= q.y1 + gap &&
        f.y1 >= q.y0 - gap,
    );
    if (!same) out.push({ ...f });
    else
      Object.assign(same, {
        x0: Math.min(same.x0, f.x0),
        y0: Math.min(same.y0, f.y0),
        x1: Math.max(same.x1, f.x1),
        y1: Math.max(same.y1, f.y1),
      });
  }
  return out;
}

/**
 * @param thinLines thin segments ({ o, c, s0, s1, t }) not belonging to walls
 * @param wallWidth typical wall thickness in pixels (scale reference)
 */
export function detectFeatures(thinLines, wallWidth) {
  const unit = Math.max(4, wallWidth),
    byO = (o) => thinLines.filter((l) => l.o === o),
    all = [];
  for (const o of ['h', 'v'])
    for (const s of series(byO(o), 3, 14 * unit)) all.push({ ...s, rect: rect(s) });
  const features = [],
    taken = new Set();
  // Grids (paving): a series crossed by a perpendicular one over the same area.
  for (const a of all)
    for (const b of all) {
      if (a === b || a.o !== 'h' || b.o !== 'v' || taken.has(a) || taken.has(b)) continue;
      if (overlapRatio(a.rect, b.rect) < 0.5 || Math.max(a.count, b.count) < 4) continue;
      taken.add(a);
      taken.add(b);
      features.push({
        type: 'terrace',
        x0: Math.min(a.rect.x0, b.rect.x0),
        y0: Math.min(a.rect.y0, b.rect.y0),
        x1: Math.max(a.rect.x1, b.rect.x1),
        y1: Math.max(a.rect.y1, b.rect.y1),
      });
    }
  for (const s of all) {
    if (taken.has(s)) continue;
    const treadLength = s.s1 - s.s0;
    // A tread (≈ 0.28 m) is about one wall thickness; paving joints are ≥ 2× that.
    if (s.count >= 5 && s.spacing <= STAIR_MAX_SPACING * unit && treadLength >= 2 * s.spacing)
      features.push({
        type: 'stair',
        ...s.rect,
        steps: s.count + 1,
        // Treads drawn horizontally ('h') mean the stair climbs along y.
        axis: s.o === 'h' ? 'y' : 'x',
      });
    else if (s.count >= 4 && treadLength >= 3 * unit) features.push({ type: 'terrace', ...s.rect });
  }
  return mergeTouching(features, unit);
}
