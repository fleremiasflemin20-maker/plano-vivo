// Furniture and text from the linework left once walls, openings, stairs and
// terraces are accounted for.
//
//   1. Linework strokes are grouped (strokes closer than a fraction of a wall belong
//      to the same object).
//   2. Text: rows of small marks about one wall thick (letters, room numbers).
//   3. Furniture: outlines with furniture dimensions, classified by size in metres
//      (bed, sofa, table, counter, bathtub, small fixture); the scale comes from the
//      scale bar or the doors, or a typical wall thickness when neither was found.
//
// Everything is a heuristic on dimensions and shape; elements are marked for review.

/** 8-connected component labels. Returns { labels (1-based, 0 = background), count }. */
export function components(mask, w, h) {
  const labels = new Int32Array(mask.length),
    stack = new Int32Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    count++;
    let top = 0;
    stack[top++] = start;
    labels[start] = count;
    while (top) {
      const k = stack[--top],
        x = k % w,
        y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !labels[j]) {
            labels[j] = count;
            stack[top++] = j;
          }
        }
    }
  }
  return { labels, count };
}

// Furniture dimensions in metres: [kind, short side range, long side range].
// First match wins, so the more specific shapes come first.
const KINDS = [
  ['bed', [0.8, 2.1], [1.8, 2.3]],
  ['bathtub', [0.6, 0.85], [1.4, 1.85]],
  ['sofa', [0.7, 1.1], [1.4, 3.2]],
  ['counter', [0.45, 0.72], [0.9, 4.5]],
  ['table', [0.6, 1.6], [0.6, 2.6]],
  ['small', [0.3, 0.7], [0.3, 0.9]],
];

const inRange = (v, [lo, hi]) => v >= lo && v <= hi;

function classify(a, b) {
  for (const [kind, short, long] of KINDS) if (inRange(a, short) && inRange(b, long)) return kind;
  return a >= 0.35 && b <= 3.6 ? 'generic' : null;
}

/** Distance from each side of a box to the nearest parallel wall facing it. */
function sideClearance(box, walls) {
  const out = { n: Infinity, s: Infinity, w: Infinity, e: Infinity };
  for (const q of walls) {
    if (q.o === 'd') continue;
    const half = q.t / 2;
    if (q.o === 'h' && q.s1 > box.x0 && q.s0 < box.x1) {
      if (q.c <= box.y0 + half) out.n = Math.min(out.n, box.y0 - (q.c + half));
      if (q.c >= box.y1 - half) out.s = Math.min(out.s, q.c - half - box.y1);
    }
    if (q.o === 'v' && q.s1 > box.y0 && q.s0 < box.y1) {
      if (q.c <= box.x0 + half) out.w = Math.min(out.w, box.x0 - (q.c + half));
      if (q.c >= box.x1 - half) out.e = Math.min(out.e, q.c - half - box.x1);
    }
  }
  return out;
}

/** Share of the box border (a band `band` px wide) covered by ink, per side. */
function borderInk(mask, w, box, band) {
  const side = (x0, y0, x1, y1) => {
    let ink = 0,
      n = 0;
    for (let y = Math.max(0, y0); y <= y1; y++)
      for (let x = Math.max(0, x0); x <= x1; x++, n++) ink += mask[y * w + x];
    return n ? ink / n : 0;
  };
  // A side counts when some line along it is inked: check rows/columns in the band.
  const along = (horizontal, from, to) => {
    let best = 0;
    for (let c = from; c <= to; c++)
      best = Math.max(best, horizontal ? side(box.x0, c, box.x1, c) : side(c, box.y0, c, box.y1));
    return best;
  };
  return [
    along(true, box.y0, box.y0 + band),
    along(true, box.y1 - band, box.y1),
    along(false, box.x0, box.x0 + band),
    along(false, box.x1 - band, box.x1),
  ];
}

/**
 * Glazing drawn between wall blocks looks like a short word; it is bounded by wall
 * ink at both ends (left and right, or above and below). Text is not.
 */
function bridgesWalls(wallMask, w, h, box, reach) {
  const any = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++)
        if (wallMask[y * w + x]) return true;
    return false;
  };
  return (
    (any(box.x0 - reach, box.y0, box.x0 - 1, box.y1) &&
      any(box.x1 + 1, box.y0, box.x1 + reach, box.y1)) ||
    (any(box.x0, box.y0 - reach, box.x1, box.y0 - 1) &&
      any(box.x0, box.y1 + 1, box.x1, box.y1 + reach))
  );
}

/**
 * @param linework  thin-stroke mask (walls already removed)
 * @param exclude   rectangles (pixels) already explained: openings, stairs, terraces
 * @param walls     axis walls ({ o, c, s0, s1, t }) and diagonals ({ o: 'd' })
 * @param wallMask  heavy strokes
 * @param metresPerPx scale (estimated when the plan gave none)
 * @returns { furniture: [{ kind, x0, y0, x1, y1, back? }], labels: [{ x0, y0, x1, y1 }] }
 */
export function detectObjects(
  linework,
  w,
  h,
  { exclude, walls, wallMask, wallWidth, metresPerPx },
) {
  // Only inside the building outline.
  let bx0 = Infinity,
    by0 = Infinity,
    bx1 = -Infinity,
    by1 = -Infinity;
  for (const q of walls) {
    const [x0, y0, x1, y1] =
      q.o === 'h'
        ? [q.s0, q.c, q.s1, q.c]
        : q.o === 'v'
          ? [q.c, q.s0, q.c, q.s1]
          : [
              Math.min(q.x0, q.x1),
              Math.min(q.y0, q.y1),
              Math.max(q.x0, q.x1),
              Math.max(q.y0, q.y1),
            ];
    bx0 = Math.min(bx0, x0);
    by0 = Math.min(by0, y0);
    bx1 = Math.max(bx1, x1);
    by1 = Math.max(by1, y1);
  }
  const mask = new Uint8Array(linework.length);
  for (let y = Math.max(0, Math.ceil(by0)); y <= Math.min(h - 1, by1); y++)
    for (let x = Math.max(0, Math.ceil(bx0)); x <= Math.min(w - 1, bx1); x++)
      mask[y * w + x] = linework[y * w + x];
  for (const r of exclude)
    for (let y = Math.max(0, Math.floor(r.y0)); y <= Math.min(h - 1, Math.ceil(r.y1)); y++)
      mask.fill(
        0,
        y * w + Math.max(0, Math.floor(r.x0)),
        y * w + Math.min(w - 1, Math.ceil(r.x1)) + 1,
      );

  // Group strokes: a gap of a third of a wall joins pieces of one object (a bed's
  // pillows and its outline; the letters of a word).
  const g = Math.max(2, Math.round(wallWidth * 0.35)),
    grown = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let yy = Math.max(0, y - g); yy <= Math.min(h - 1, y + g); yy++)
        grown.fill(1, yy * w + Math.max(0, x - g), yy * w + Math.min(w - 1, x + g) + 1);
    }
  const groups = components(grown, w, h),
    strokes = components(mask, w, h),
    info = new Map();
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const id = groups.labels[k],
      x = k % w,
      y = (k - x) / w;
    let s = info.get(id);
    if (!s) info.set(id, (s = { x0: x, y0: y, x1: x, y1: y, ink: 0, strokes: new Set() }));
    if (x < s.x0) s.x0 = x;
    if (x > s.x1) s.x1 = x;
    if (y < s.y0) s.y0 = y;
    if (y > s.y1) s.y1 = y;
    s.ink++;
    s.strokes.add(strokes.labels[k]);
  }

  const furniture = [],
    labels = [];
  for (const s of info.values()) {
    const bw = s.x1 - s.x0 + 1,
      bh = s.y1 - s.y0 + 1,
      shortPx = Math.min(bw, bh),
      longPx = Math.max(bw, bh),
      fill = s.ink / (bw * bh);
    if (longPx < 3) continue;
    // Text: room numbers and short labels are a few wall thicknesses wide; longer
    // words are rows of marks about one wall high. Low-resolution letters break into
    // many specks, so the number of marks is not a criterion.
    const small = longPx <= 2.6 * wallWidth && shortPx >= 0.4 * wallWidth && bh >= 0.5 * wallWidth,
      word =
        bw >= 1.2 * bh && bh <= 1.8 * wallWidth && bh >= 0.4 * wallWidth && s.strokes.size >= 2;
    if ((small || word) && fill >= 0.08 && fill <= 0.7 && !bridgesWalls(wallMask, w, h, s, g + 2)) {
      labels.push({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 });
      continue;
    }
    const a = shortPx * metresPerPx,
      b = longPx * metresPerPx;
    const kind = classify(a, b);
    if (!kind || fill > 0.6 || shortPx < wallWidth) continue;
    // Small pieces wedged between two wall blocks are glazing or jambs.
    if (kind === 'small' && bridgesWalls(wallMask, w, h, s, g + 2)) continue;
    // An outline: at least three sides drawn (beds, tables, counters), or a compact
    // closed shape for round tables and fixtures.
    const sides = borderInk(mask, w, s, Math.max(2, Math.round(wallWidth * 0.3))).filter(
      (v) => v >= 0.55,
    ).length;
    if (sides < 3 && !(sides >= 2 && (kind === 'small' || kind === 'table'))) continue;
    // Spanning a room from wall to wall is floor pattern (tiles), not furniture.
    const gap = sideClearance(s, walls),
      touch = wallWidth * 1.2;
    if ((gap.n < touch && gap.s < touch) || (gap.w < touch && gap.e < touch)) continue;
    const item = { kind, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 };
    // Beds stand with the head against a wall (short side); sofas with the back
    // against one (long side). Record which side, for the 3D model.
    if (kind === 'bed' || kind === 'sofa') {
      const upright = bw < bh,
        sides =
          kind === 'bed' ? (upright ? ['n', 's'] : ['w', 'e']) : upright ? ['w', 'e'] : ['n', 's'];
      item.back = gap[sides[0]] <= gap[sides[1]] ? sides[0] : sides[1];
    }
    furniture.push(item);
  }
  return { furniture: furniture.slice(0, 120), labels: labels.slice(0, 60) };
}
