import { clamp, nearest } from './geometry.mjs';
const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
// Half-width, in pixels, up to which a stroke is measured across. Filled walls and
// thick PDF strokes rendered at 4× easily exceed 30 px, so this must be generous.
const MAX_HALF_STROKE = 128;
// Pixel distance at which a parallel line counts as the same stroke. Thick strokes
// produce edges and shallow diagonals across their band, so the band's half-width
// is added once the stroke is thicker than the base tolerance.
const strokeBand = (stroke, tolerance) => (stroke > tolerance ? stroke / 2 + tolerance : tolerance);
/**
 * Measure the ink stroke across segment a–b (pixel coordinates) at several points.
 * Returns the median offset of the stroke's centre along the normal (nx, ny), the
 * median width, and how many points could be measured. Mirrors the measurement
 * done per tile in detectPlan, but on the full sheet.
 */
function measureStroke(a, b, inkAt) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return { offset: 0, width: 0, nx: 0, ny: 0, samples: 0 };
  const tx = (b.x - a.x) / length,
    ty = (b.y - a.y) / length,
    nx = -ty,
    ny = tx,
    widths = [],
    offsets = [];
  for (let u = 5; u < length - 4; u += Math.max(4, length / 12)) {
    const x = a.x + tx * u,
      y = a.y + ty * u;
    let center = null;
    for (let o = -3; o <= 3; o++)
      if (inkAt(x + nx * o, y + ny * o)) {
        center = o;
        break;
      }
    if (center === null) continue;
    let lo = center,
      hi = center;
    while (lo > -MAX_HALF_STROKE && inkAt(x + nx * (lo - 1), y + ny * (lo - 1))) lo--;
    while (hi < MAX_HALF_STROKE && inkAt(x + nx * (hi + 1), y + ny * (hi + 1))) hi++;
    widths.push(hi - lo + 1);
    offsets.push((hi + lo) / 2);
  }
  return { offset: median(offsets), width: median(widths), nx, ny, samples: offsets.length };
}
function recenter(line, inkAt) {
  const { offset, nx, ny, samples } = measureStroke(line.a, line.b, inkAt);
  if (samples < 3 || !offset) return;
  line.a = { x: line.a.x + nx * offset, y: line.a.y + ny * offset };
  line.b = { x: line.b.x + nx * offset, y: line.b.y + ny * offset };
}
// Analyze large sheets locally, then stitch overlapping observations in sheet
// coordinates. The original world scale applies to every tile.
export function detectLargePlan(image, W, H, worldWidth, progress = () => {}) {
  if (Math.max(W, H) <= 900) return detectPlan(image, W, H, worldWidth, progress);
  const origins = (n) => {
      const a = [];
      for (let p = 0; p < Math.max(1, n - 800); p += 640) a.push(p);
      a.push(Math.max(0, n - 800));
      return [...new Set(a)];
    },
    tiles = [];
  for (const y of origins(H))
    for (const x of origins(W))
      tiles.push({ x, y, w: Math.min(800, W - x), h: Math.min(800, H - y) });
  const candidates = [],
    openings = [],
    thresholds = [];
  for (let index = 0; index < tiles.length; index++) {
    const t = tiles[index],
      pixels = new Uint8ClampedArray(t.w * t.h * 4);
    for (let row = 0; row < t.h; row++)
      pixels.set(
        image.subarray(((t.y + row) * W + t.x) * 4, ((t.y + row) * W + t.x + t.w) * 4),
        row * t.w * 4,
      );
    progress(
      10 + Math.round((70 * index) / tiles.length),
      `Analizando zona ${index + 1} de ${tiles.length}…`,
    );
    const result = detectPlan(pixels, t.w, t.h, (worldWidth * t.w) / W);
    if (result.stats) thresholds.push(result.stats.threshold);
    result.walls.forEach((wall, i) => {
      const map = (p) => ({ x: p.x * t.w + t.x, y: p.y * t.h + t.y }),
        item = { ...wall, a: map(wall.a), b: map(wall.b), stroke: result.strokes?.[i] || 0 };
      (wall.type === 'wall' ? candidates : openings).push(item);
    });
  }
  progress(85, 'Uniendo las zonas del plano…');
  candidates.sort(
    (a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y),
  );
  const merged = [];
  for (const line of candidates) {
    let a = { ...line.a },
      b = { ...line.b },
      stroke = line.stroke;
    if (!Math.hypot(b.x - a.x, b.y - a.y)) continue;
    for (let i = merged.length - 1; i >= 0; i--) {
      const q = merged[i],
        length = Math.hypot(b.x - a.x, b.y - a.y),
        ux = (b.x - a.x) / length,
        uy = (b.y - a.y) / length,
        qx = q.b.x - q.a.x,
        qy = q.b.y - q.a.y,
        ql = Math.hypot(qx, qy);
      if (Math.abs((qx * ux + qy * uy) / ql) < 0.995) continue;
      // A tile that cuts through a thick stroke sees only part of it, so its centre
      // line can be offset by up to half the stroke width.
      const cross = (p) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
      if (Math.max(cross(q.a), cross(q.b)) > strokeBand(Math.max(q.stroke, stroke), 10)) continue;
      const dot = (p) => (p.x - a.x) * ux + (p.y - a.y) * uy,
        p = dot(q.a),
        r = dot(q.b),
        end = dot(b);
      if (Math.min(p, r) > end + 2 || Math.max(p, r) < -2) continue;
      // Extend along the longer piece's axis; centring is corrected afterwards on the
      // full image, since a tile that clipped the stroke reports an offset centre.
      const qLonger = ql >= length,
        [axis, other] = qLonger ? [q, { a, b }] : [{ a, b }, q],
        axisLength = qLonger ? ql : length,
        vx = (axis.b.x - axis.a.x) / axisLength,
        vy = (axis.b.y - axis.a.y) / axisLength,
        along = (pt) => (pt.x - axis.a.x) * vx + (pt.y - axis.a.y) * vy,
        ends = [0, along(axis.b), along(other.a), along(other.b)],
        low = Math.min(...ends),
        high = Math.max(...ends);
      a = { x: axis.a.x + low * vx, y: axis.a.y + low * vy };
      b = { x: axis.a.x + high * vx, y: axis.a.y + high * vy };
      stroke = Math.max(stroke, q.stroke);
      merged.splice(i, 1);
    }
    merged.push({ ...line, a, b, stroke });
  }
  const threshold = thresholds.length ? median(thresholds) : 120,
    inkAt = (x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const k = (y * W + x) * 4,
        alpha = image[k + 3] / 255;
      return (
        (image[k] * 0.299 + image[k + 1] * 0.587 + image[k + 2] * 0.114) * alpha +
          255 * (1 - alpha) <
        threshold
      );
    };
  for (const line of merged) recenter(line, inkAt);
  const normalized = ({ stroke, ...line }) => ({
      ...line,
      a: { x: line.a.x / W, y: line.a.y / H },
      b: { x: line.b.x / W, y: line.b.y / H },
    }),
    walls = merged.map(normalized),
    accepted = [];
  for (const line of openings) {
    const item = normalized(line),
      mid = { x: (item.a.x + item.b.x) / 2, y: (item.a.y + item.b.y) / 2 };
    if (
      walls.some((w) => nearest(mid, w, W, H).d < 6) ||
      accepted.some((w) => nearest(mid, w, W, H).d < 8)
    )
      continue;
    accepted.push(item);
  }
  return {
    walls: walls.concat(accepted),
    stats: { segments: walls.length, openings: accepted.length, tiles: tiles.length },
    notes: [
      `Plano analizado a ${W} × ${H} píxeles en ${tiles.length} zonas solapadas.`,
      'Reconstrucción geométrica aproximada: revisa muros, aberturas y escala. Los símbolos, muebles e instalaciones no tienen reconocimiento semántico.',
    ],
  };
}
// Local geometric detector. No semantic/furniture recognition is claimed.
export function detectPlan(image, W, H, worldWidth, progress = () => {}) {
  const gray = new Uint8Array(W * H),
    hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    const k = i * 4,
      alpha = image[k + 3] / 255,
      v = Math.round(
        (image[k] * 0.299 + image[k + 1] * 0.587 + image[k + 2] * 0.114) * alpha +
          255 * (1 - alpha),
      );
    gray[i] = v;
    hist[v]++;
  }
  let total = 0,
    sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let best = 0,
    threshold = 120,
    weight = 0;
  for (let i = 0; i < 255; i++) {
    weight += hist[i];
    total += i * hist[i];
    if (!weight || weight === gray.length) continue;
    const variance =
      weight *
      (gray.length - weight) *
      (total / weight - (sum - total) / (gray.length - weight)) ** 2;
    if (variance > best) {
      best = variance;
      threshold = i;
    }
  }
  threshold = clamp(threshold + 12, 65, 185);
  const mask = gray.map((v) => (v < threshold ? 1 : 0)),
    at = (x, y) =>
      x >= 0 && y >= 0 && x < W && y < H ? mask[Math.round(y) * W + Math.round(x)] || 0 : 0;
  const pts = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (mask[k] && (!mask[k - 1] || !mask[k + 1] || !mask[k - W] || !mask[k + W]))
        pts.push([x, y]);
    }
  if (pts.length < 30)
    return {
      walls: [],
      notes: ['No se encontraron líneas suficientes. Usa una imagen nítida del plano.'],
    };
  if (pts.length > W * H * 0.25)
    return {
      walls: [],
      notes: [
        'La imagen contiene demasiado ruido. Recorta el plano y usa una foto frontal con fondo claro.',
      ],
    };
  progress(20, 'Buscando paredes y orientaciones…');
  const diag = Math.ceil(Math.hypot(W, H)),
    stride = diag * 2 + 1,
    angles = 90,
    acc = new Uint16Array(angles * stride),
    sample = Math.max(1, Math.ceil(pts.length / 45000)),
    trig = [];
  for (let a = 0; a < angles; a++) {
    const th = (a * Math.PI) / angles,
      c = Math.cos(th),
      s = Math.sin(th);
    trig.push([c, s]);
    for (let i = 0; i < pts.length; i += sample) {
      const [x, y] = pts[i],
        r = Math.round(x * c + y * s) + diag;
      acc[a * stride + r]++;
    }
  }
  const peaks = [],
    minLen = Math.max(22, Math.min(W, H) * 0.055);
  for (let a = 0; a < angles; a++)
    for (let r = 0; r < stride; r++)
      if (acc[a * stride + r] > (minLen / sample) * 0.65)
        peaks.push({ a, r: r - diag, v: acc[a * stride + r] });
  peaks.sort((a, b) => b.v - a.v);
  const chosen = [];
  for (const p of peaks) {
    if (chosen.some((q) => Math.abs(q.a - p.a) <= 1 && Math.abs(q.r - p.r) < 5)) continue;
    chosen.push(p);
    if (chosen.length >= 150) break;
  }
  let lines = [];
  for (const peak of chosen) {
    const [nx, ny] = trig[peak.a],
      tx = -ny,
      ty = nx;
    let begin = null,
      gap = 0;
    const flush = (end) => {
      if (begin === null || end - begin < minLen) return;
      const widths = [],
        offsets = [];
      for (let u = begin + 5; u < end - 4; u += Math.max(4, (end - begin) / 12)) {
        const x = nx * peak.r + tx * u,
          y = ny * peak.r + ty * u;
        let center = null;
        for (let o = -3; o <= 3; o++)
          if (at(x + nx * o, y + ny * o)) {
            center = o;
            break;
          }
        if (center === null) continue;
        let lo = center,
          hi = center;
        while (lo > -MAX_HALF_STROKE && at(x + nx * (lo - 1), y + ny * (lo - 1))) lo--;
        while (hi < MAX_HALF_STROKE && at(x + nx * (hi + 1), y + ny * (hi + 1))) hi++;
        widths.push(hi - lo + 1);
        offsets.push((hi + lo) / 2);
      }
      const r = peak.r + median(offsets),
        a = {
          x: clamp((nx * r + tx * begin) / W, 0, 1),
          y: clamp((ny * r + ty * begin) / H, 0, 1),
        },
        b = { x: clamp((nx * r + tx * end) / W, 0, 1), y: clamp((ny * r + ty * end) / H, 0, 1) };
      lines.push({
        a,
        b,
        type: 'wall',
        pixels: median(widths),
        angle: peak.a,
        score: peak.v,
        inferred: true,
      });
    };
    for (let t = -diag; t <= diag; t++) {
      const x = nx * peak.r + tx * t,
        y = ny * peak.r + ty * t,
        hit = at(x, y) || at(x + nx, y + ny) || at(x - nx, y - ny);
      if (hit) {
        if (begin === null) begin = t;
        gap = 0;
      } else if (begin !== null && ++gap > 2) {
        flush(t - gap);
        begin = null;
        gap = 0;
      }
    }
    if (begin !== null) flush(diag - gap);
  }
  progress(55, 'Uniendo trazos y limpiando duplicados…');
  lines.sort(
    (a, b) =>
      Math.hypot((b.b.x - b.a.x) * W, (b.b.y - b.a.y) * H) * Math.sqrt(b.score) -
      Math.hypot((a.b.x - a.a.x) * W, (a.b.y - a.a.y) * H) * Math.sqrt(a.score),
  );
  const merged = [];
  const ratio = H / W,
    tolerance = Math.max(8, Math.min(16, W * 0.022));
  for (const l of lines) {
    const same = merged.find((q) => {
      const dot =
        ((q.b.x - q.a.x) * (l.b.x - l.a.x) + (q.b.y - q.a.y) * (l.b.y - l.a.y) * ratio * ratio) /
        (Math.hypot(q.b.x - q.a.x, (q.b.y - q.a.y) * ratio) *
          Math.hypot(l.b.x - l.a.x, (l.b.y - l.a.y) * ratio));
      if (Math.abs(dot) < 0.94) return false;
      const band = strokeBand(Math.max(q.pixels, l.pixels), tolerance);
      return nearest(l.a, q, W, H).d < band && nearest(l.b, q, W, H).d < band;
    });
    if (!same) merged.push(l);
    else same.pixels = Math.max(same.pixels, l.pixels);
  }
  // Drop short segments lying inside a thicker stroke's band, e.g. the edge of a
  // thick stroke's end cap, detected as a short perpendicular line.
  const segmentLength = (l) => Math.hypot((l.b.x - l.a.x) * W, (l.b.y - l.a.y) * H);
  for (let i = merged.length - 1; i >= 0; i--) {
    const l = merged[i];
    const inside = merged.some((q) => {
      if (q === l || q.pixels <= tolerance || segmentLength(l) > q.pixels * 1.5) return false;
      const band = strokeBand(q.pixels, tolerance);
      return nearest(l.a, q, W, H).d < band && nearest(l.b, q, W, H).d < band;
    });
    if (inside) merged.splice(i, 1);
  }
  // Remove isolated thin lines (dimension strings, text and furniture strokes).
  lines = merged.filter((l) => {
    if (l.pixels >= 3) return true;
    let connections = 0;
    for (const q of merged) {
      if (q === l) continue;
      if (nearest(l.a, q, W, H).d < 12 || nearest(l.b, q, W, H).d < 12) connections++;
    }
    return connections >= 2;
  });
  if (!lines.length && merged.length)
    lines = merged.filter(
      (l) => Math.hypot((l.b.x - l.a.x) * W, (l.b.y - l.a.y) * H) > minLen * 2.5,
    );
  lines = lines.slice(0, 260);
  for (const l of lines) {
    for (const key of ['a', 'b']) {
      let best = 8,
        target = null;
      for (const q of lines) {
        if (q === l) continue;
        for (const p of [q.a, q.b]) {
          const d = Math.hypot((l[key].x - p.x) * W, (l[key].y - p.y) * H);
          if (d > 0 && d < best) {
            best = d;
            target = p;
          }
        }
      }
      if (target) l[key] = { ...target };
    }
  }
  progress(75, 'Buscando aberturas entre paredes…');
  const openings = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j],
        dx = (a.b.x - a.a.x) * W,
        dy = (a.b.y - a.a.y) * H,
        L = Math.hypot(dx, dy);
      if (!L) continue;
      const cross = (p) => Math.abs((p.x - a.a.x) * W * dy - (p.y - a.a.y) * H * dx) / L;
      if (cross(b.a) > 5 || cross(b.b) > 5) continue;
      let pair = null,
        gap = Infinity;
      for (const p of [a.a, a.b])
        for (const q of [b.a, b.b]) {
          const d = Math.hypot((p.x - q.x) * W, (p.y - q.y) * H);
          if (d < gap) {
            gap = d;
            pair = [p, q];
          }
        }
      const meters = (gap / W) * worldWidth;
      if (meters < 0.55 || meters > 1.6) continue;
      const [p, q] = pair,
        mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      if (
        lines.some((l) => l !== a && l !== b && nearest(mid, l, W, H).d < 4) ||
        openings.some((o) => nearest(mid, o, W, H).d < 8)
      )
        continue;
      let ink = 0;
      for (let s = 2; s < 18; s++) {
        const t = s / 20;
        ink += at((p.x + (q.x - p.x) * t) * W, (p.y + (q.y - p.y) * t) * H);
      }
      openings.push({
        a: { ...p },
        b: { ...q },
        type: ink >= 10 ? 'window' : 'door',
        inferred: true,
      });
    }
  const result = lines
    .map(({ a, b, type, inferred }) => ({ a, b, type, inferred }))
    .concat(openings);
  return {
    walls: result,
    // Measured stroke width in pixels for each entry of `walls` (0 for openings);
    // used when stitching tiles. Kept out of the wall objects so it is not saved.
    strokes: lines.map((l) => l.pixels).concat(openings.map(() => 0)),
    notes: [
      'Construcción geométrica aproximada: revisa paredes y aberturas resaltadas.',
      'La escala y la altura usan tus ajustes; no se deducen de la foto.',
      'Los muebles, textos, símbolos e instalaciones no se convierten en objetos 3D.',
    ],
    stats: { segments: lines.length, openings: openings.length, threshold },
  };
}
