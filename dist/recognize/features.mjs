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

/**
 * A faint line blurred by upscaling can come out as two or three adjacent bands:
 * merge parallel overlapping lines closer than `gap`.
 */
function dedupe(lines, gap) {
  const sorted = lines.slice().sort((a, b) => a.c - b.c),
    out = [];
  for (const l of sorted) {
    const q = out.find((q) => {
      const ov = Math.min(q.s1, l.s1) - Math.max(q.s0, l.s0);
      return l.c - q.c <= gap && ov >= 0.5 * Math.min(q.s1 - q.s0, l.s1 - l.s0);
    });
    if (!q) out.push({ ...l });
    else {
      q.c = (q.c + l.c) / 2;
      q.s0 = Math.min(q.s0, l.s0);
      q.s1 = Math.max(q.s1, l.s1);
    }
  }
  return out;
}

// Treads and paving joints are regular; furniture outlines are not.
const SPACING_TOLERANCE = 0.18;
// Maximum tread spacing, in wall thicknesses.
const STAIR_MAX_SPACING = 1.8;
// Paving joints and deck boards are at most a few wall thicknesses apart; wider
// "series" are unrelated lines that happen to align (furniture, room outlines).
const MAX_SPACING = 8;

/** Longest chains of evenly spaced, overlapping parallel lines. */
function series(lines, minCount, maxSpacing, dedupeGap, maxGapSpacing) {
  const sorted = joinInterrupted(dedupe(lines, dedupeGap)).sort((a, b) => a.c - b.c),
    candidates = [];
  for (const seed of sorted) {
    const overlaps = (l) => {
      const ov = Math.min(l.s1, seed.s1) - Math.max(l.s0, seed.s0);
      // Similar extents: treads and paving joints run edge to edge of the same area.
      return ov >= 0.7 * Math.max(l.s1 - l.s0, seed.s1 - seed.s0);
    };
    let best = null;
    // Try each next line as the one defining the spacing.
    for (const first of sorted) {
      if (first.c <= seed.c + 2 || first.c - seed.c > maxSpacing) continue;
      if (!overlaps(first)) continue;
      const spacing = first.c - seed.c,
        chain = [seed, first];
      let last = first,
        missing = 0;
      for (const l of sorted) {
        if (l.c <= last.c || !overlaps(l)) continue;
        const d = l.c - last.c;
        if (Math.abs(d - spacing) <= spacing * SPACING_TOLERANCE) {
          chain.push(l);
          last = l;
        } else if (
          spacing <= maxGapSpacing &&
          Math.abs(d - 2 * spacing) <= spacing * SPACING_TOLERANCE * 1.5
        ) {
          // One line lost in a faint or low-resolution drawing: keep the series going.
          chain.push(l);
          last = l;
          missing++;
        } else if (d > spacing * 2.4) break;
      }
      const count = chain.length + missing;
      if (!best || count > best.count) best = { chain, spacing, count };
    }
    if (best && best.count >= minCount) candidates.push({ ...best, o: seed.o });
  }
  // Longest series first, each line in one series only: a stray line before the
  // first joint must not steal the series from its true start.
  const used = new Set(),
    out = [];
  candidates.sort((a, b) => b.count - a.count || a.spacing - b.spacing);
  for (const { chain, spacing, count, o } of candidates) {
    if (chain.some((l) => used.has(l))) continue;
    chain.forEach((l) => used.add(l));
    out.push({
      o,
      c0: chain[0].c,
      c1: chain[chain.length - 1].c,
      s0: median(chain.map((l) => l.s0)),
      s1: median(chain.map((l) => l.s1)),
      count,
      spacing,
    });
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
    for (const s of series(
      byO(o),
      3,
      MAX_SPACING * unit,
      Math.max(2, Math.round(unit * 0.25)),
      STAIR_MAX_SPACING * unit,
    ))
      all.push({ ...s, rect: rect(s) });
  const features = [],
    taken = new Set();
  const isStair = (s) =>
    s.count >= 5 && s.spacing <= STAIR_MAX_SPACING * unit && s.s1 - s.s0 >= 2 * s.spacing;
  // Stairs first: the landing and flight-division lines crossing the treads would
  // otherwise make them look like a paving grid. Those crossing lines are absorbed.
  for (const s of all) {
    if (!isStair(s)) continue;
    taken.add(s);
    for (const q of all)
      if (q.o !== s.o && !taken.has(q) && q.count <= 4 && overlapRatio(q.rect, s.rect) >= 0.5)
        taken.add(q);
    features.push({
      type: 'stair',
      ...s.rect,
      steps: s.count + 1,
      // Treads drawn horizontally ('h') mean the stair climbs along y.
      axis: s.o === 'h' ? 'y' : 'x',
    });
  }
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
  // A tread (≈ 0.28 m) is about one wall thickness; paving joints are ≥ 2× that.
  for (const s of all)
    if (!taken.has(s) && s.count >= 4 && s.s1 - s.s0 >= 3 * unit)
      features.push({ type: 'terrace', ...s.rect });
  // Short tick rows along a terrace edge are its border pattern (decking ends,
  // railing), not a stair: they join the terrace.
  const terraces = features.filter((f) => f.type === 'terrace'),
    touches = (a, b, gap) =>
      a.x0 <= b.x1 + gap && a.x1 >= b.x0 - gap && a.y0 <= b.y1 + gap && a.y1 >= b.y0 - gap;
  for (const st of features.filter((f) => f.type === 'stair')) {
    const t = terraces.find((t) => touches(st, t, unit));
    if (!t) continue;
    Object.assign(t, {
      x0: Math.min(t.x0, st.x0),
      y0: Math.min(t.y0, st.y0),
      x1: Math.max(t.x1, st.x1),
      y1: Math.max(t.y1, st.y1),
    });
    features.splice(features.indexOf(st), 1);
  }
  return mergeTouching(features, unit);
}
