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
  }
  if (d.image && !/^data:image\/png;base64,/.test(d.image)) throw Error('Imagen no válida');
  return d;
}
export function toDXF(walls, W, D) {
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
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}
