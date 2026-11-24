export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const length = (w, W, D) => Math.hypot((w.b.x - w.a.x) * W, (w.b.y - w.a.y) * D);
export function nearest(p, w, W = 1, D = 1) {
  const dx = (w.b.x - w.a.x) * W,
    dy = (w.b.y - w.a.y) * D,
    den = dx * dx + dy * dy,
    t = den ? clamp(((p.x - w.a.x) * W * dx + (p.y - w.a.y) * D * dy) / den, 0, 1) : 0;
  return {
    t,
    d: Math.hypot((p.x - w.a.x) * W - t * dx, (p.y - w.a.y) * D - t * dy),
    p: { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t },
  };
}
export function quantities(walls, W, D, H, T) {
  let linear = 0,
    gross = 0,
    open = 0,
    volume = 0,
    doors = 0,
    windows = 0;
  for (const w of walls) {
    const l = length(w, W, D),
      h = w.height || H,
      t = w.thickness || T;
    linear += l;
    gross += l * h;
    let hole = 0;
    if (w.type === 'door') {
      hole = l * Math.min(h, w.openHeight || 2.1);
      doors++;
    }
    if (w.type === 'window') {
      hole = l * Math.min(Math.max(0, h - (w.sill ?? 0.9)), w.openHeight || 1.2);
      windows++;
    }
    open += hole;
    volume += (l * h - hole) * t;
  }
  return { linear, gross, open, net: Math.max(0, gross - open), volume, doors, windows };
}
// Approximate enclosed clear floor areas; openings close the boundary for room finding.
export function findRooms(walls, W, D, T, resolution = 200) {
  if (!walls.length) return [];
  const cell = Math.max(W, D) / resolution,
    nx = Math.ceil(W / cell),
    ny = Math.ceil(D / cell),
    blocked = new Uint8Array(nx * ny);
  for (const w of walls) {
    const r = (w.thickness || T) / 2 + cell * 0.15,
      x0 = Math.max(0, Math.floor((Math.min(w.a.x, w.b.x) * W - r) / cell)),
      x1 = Math.min(nx - 1, Math.ceil((Math.max(w.a.x, w.b.x) * W + r) / cell)),
      y0 = Math.max(0, Math.floor((Math.min(w.a.y, w.b.y) * D - r) / cell)),
      y1 = Math.min(ny - 1, Math.ceil((Math.max(w.a.y, w.b.y) * D + r) / cell));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (nearest({ x: ((x + 0.5) * cell) / W, y: ((y + 0.5) * cell) / D }, w, W, D).d <= r)
          blocked[y * nx + x] = 1;
      }
  }
  const seen = blocked.slice(),
    queue = new Int32Array(nx * ny),
    rooms = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i]) continue;
    let head = 0,
      tail = 1,
      touches = false,
      sx = 0,
      sy = 0;
    queue[0] = i;
    seen[i] = 1;
    while (head < tail) {
      const k = queue[head++],
        x = k % nx,
        y = Math.floor(k / nx);
      sx += x + 0.5;
      sy += y + 0.5;
      if (x === 0 || y === 0 || x === nx - 1 || y === ny - 1) touches = true;
      const ns = [];
      if (x > 0) ns.push(k - 1);
      if (x < nx - 1) ns.push(k + 1);
      if (y > 0) ns.push(k - nx);
      if (y < ny - 1) ns.push(k + nx);
      for (const n of ns)
        if (!seen[n]) {
          seen[n] = 1;
          queue[tail++] = n;
        }
    }
    const area = tail * cell * cell;
    if (!touches && area > 0.45) {
      const cells = Array.from(queue.subarray(0, tail)).sort((a, b) => a - b),
        runs = [];
      let from = cells[0],
        prev = from;
      for (let c = 1; c <= cells.length; c++) {
        const k = cells[c];
        if (k !== prev + 1 || Math.floor(k / nx) !== Math.floor(prev / nx)) {
          runs.push({
            x: ((from % nx) * cell) / W,
            y: (Math.floor(from / nx) * cell) / D,
            w: ((prev - from + 1) * cell) / W,
            h: cell / D,
          });
          from = k;
        }
        prev = k;
      }
      rooms.push({
        area,
        center: { x: ((sx / tail) * cell) / W, y: ((sy / tail) * cell) / D },
        runs,
      });
    }
  }
  return rooms.sort((a, b) => b.area - a.area).slice(0, 80);
}
export function validateProject(d) {
  if (!d || ![1, 2].includes(d.version) || !Array.isArray(d.walls) || d.walls.length > 2000)
    throw Error('Formato de proyecto no válido');
  if (!(
    d.width >= 1 &&
    d.width <= 300 &&
    d.height >= 2 &&
    d.height <= 12 &&
    d.thickness >= 0.05 &&
    d.thickness <= 1 &&
    d.ratio > 0.02 &&
    d.ratio < 50
  ))
    throw Error('Dimensiones no válidas');
  if (!/^#[0-9a-f]{6}$/i.test(d.material)) throw Error('Material no válido');
  for (const w of d.walls) {
    if (
      !['wall', 'door', 'window'].includes(w.type) ||
      ![w.a?.x, w.a?.y, w.b?.x, w.b?.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
      length(w, 1, 1) < 0.000001
    )
      throw Error('Geometría no válida');
    for (const [k, min, max] of [
      ['height', 2, 12],
      ['thickness', 0.05, 1],
      ['openHeight', 0.1, 10],
      ['sill', 0, 10],
    ])
      if (w[k] != null && (!Number.isFinite(w[k]) || w[k] < min || w[k] > max))
        throw Error('Propiedad no válida');
    if (w.swing != null && w.swing !== 1 && w.swing !== -1) throw Error('Propiedad no válida');
    if (w.passage != null && typeof w.passage !== 'boolean') throw Error('Propiedad no válida');
  }
  validateFeatures(d.features);
  if (d.image && !/^data:image\/png;base64,/.test(d.image)) throw Error('Imagen no válida');
  return d;
}
export const FEATURE_TYPES = ['stair', 'terrace', 'furniture', 'label'];

/** Furniture kinds: name shown to the user and height of the 3D block (m). */
export const FURNITURE = {
  bed: { name: 'Cama', height: 0.5 },
  sofa: { name: 'Sofá', height: 0.8 },
  table: { name: 'Mesa', height: 0.75 },
  counter: { name: 'Encimera', height: 0.9 },
  bathtub: { name: 'Bañera', height: 0.55 },
  small: { name: 'Mueble pequeño', height: 0.45 },
  generic: { name: 'Mueble', height: 0.75 },
};

/**
 * Plan features: normalised rectangles on the sheet. Stairs and terraces; furniture
 * ({ kind, back? }); text labels ({ text? }: without text, the plan's own pixels).
 */
export function validateFeatures(features) {
  if (features == null) return;
  if (!Array.isArray(features) || features.length > 300) throw Error('Elementos no válidos');
  for (const f of features) {
    const inSheet = [f?.x, f?.y, f?.w, f?.h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
    if (
      !FEATURE_TYPES.includes(f?.type) ||
      !inSheet ||
      f.w <= 0 ||
      f.h <= 0 ||
      f.x + f.w > 1.0001 ||
      f.y + f.h > 1.0001
    )
      throw Error('Elementos no válidos');
    if (f.type === 'stair') {
      if (!Number.isInteger(f.steps) || f.steps < 2 || f.steps > 60 || !['x', 'y'].includes(f.axis))
        throw Error('Escalera no válida');
    }
    if (
      f.type === 'furniture' &&
      (!Object.hasOwn(FURNITURE, f.kind) ||
        (f.back != null && !['n', 's', 'w', 'e'].includes(f.back)))
    )
      throw Error('Mueble no válido');
    if (f.type === 'label' && f.text != null && (typeof f.text !== 'string' || f.text.length > 150))
      throw Error('Texto no válido');
  }
}

/**
 * DXF in metres (y up). `extra` adds the professional layers: EJES (axes with their names),
 * COLUMNAS (section outlines) and AMBIENTES (room names and areas).
 */
export function toDXF(walls, W, D, features = [], extra = {}) {
  let lines = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    '6',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  for (const w of walls) {
    lines.push(
      '0',
      'LINE',
      '8',
      w.type === 'door' ? 'PUERTAS' : w.type === 'window' ? 'VENTANAS' : 'MUROS',
      '10',
      String(w.a.x * W),
      '20',
      String((1 - w.a.y) * D),
      '30',
      '0',
      '11',
      String(w.b.x * W),
      '21',
      String((1 - w.b.y) * D),
      '31',
      '0',
    );
  }
  const line = (layer, x1, y1, x2, y2) =>
    lines.push(
      '0',
      'LINE',
      '8',
      layer,
      '10',
      String(x1 * W),
      '20',
      String((1 - y1) * D),
      '30',
      '0',
      '11',
      String(x2 * W),
      '21',
      String((1 - y2) * D),
      '31',
      '0',
    );
  for (const f of features) {
    const [x0, y0, x1, y1] = [f.x, f.y, f.x + f.w, f.y + f.h];
    if (f.type === 'label') {
      // Only read text can be written; unread labels stay in the plan image.
      if (f.text)
        lines.push(
          '0',
          'TEXT',
          '8',
          'TEXTOS',
          '10',
          String(x0 * W),
          '20',
          String((1 - y1) * D),
          '30',
          '0',
          '40',
          String(Math.max(0.1, f.h * D * 0.8)),
          '1',
          f.text.replace(/\s+/g, ' '),
        );
      continue;
    }
    const layer = { stair: 'ESCALERAS', terrace: 'TERRAZAS', furniture: 'MUEBLES' }[f.type];
    line(layer, x0, y0, x1, y0);
    line(layer, x1, y0, x1, y1);
    line(layer, x1, y1, x0, y1);
    line(layer, x0, y1, x0, y0);
    if (f.type === 'stair')
      for (let i = 1; i < f.steps; i++) {
        const t = i / f.steps;
        if (f.axis === 'y') line(layer, x0, y0 + f.h * t, x1, y0 + f.h * t);
        else line(layer, x0 + f.w * t, y0, x0 + f.w * t, y1);
      }
  }
  const text = (layer, x, y, h, value) =>
    lines.push(
      '0',
      'TEXT',
      '8',
      layer,
      '10',
      String(x * W),
      '20',
      String((1 - y) * D),
      '30',
      '0',
      '40',
      String(h),
      '1',
      value,
    );
  const { grid, columns = [], rooms = [], names = [] } = extra;
  if (grid) {
    const letters = (i) => {
      let s = '',
        n = i;
      do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      return s;
    };
    grid.xs.forEach((m, i) => {
      line('EJES', m / W, 0, m / W, 1);
      text('EJES', m / W, -0.3 / D, 0.3, String(i + 1));
    });
    grid.ys.forEach((m, i) => {
      line('EJES', 0, m / D, 1, m / D);
      text('EJES', -0.5 / W, m / D, 0.3, letters(i));
    });
  }
  for (const c of columns) {
    const bx = c.b / 2 / W,
      hy = c.h / 2 / D;
    line('COLUMNAS', c.x - bx, c.y - hy, c.x + bx, c.y - hy);
    line('COLUMNAS', c.x + bx, c.y - hy, c.x + bx, c.y + hy);
    line('COLUMNAS', c.x + bx, c.y + hy, c.x - bx, c.y + hy);
    line('COLUMNAS', c.x - bx, c.y + hy, c.x - bx, c.y - hy);
  }
  rooms.forEach((r, i) =>
    text(
      'AMBIENTES',
      r.center.x,
      r.center.y,
      0.2,
      (names[i] || 'R' + (i + 1)) + ' ' + r.area.toFixed(2) + ' m2',
    ),
  );
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}
