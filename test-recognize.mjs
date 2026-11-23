// Plan recognition against synthetic architectural plans with known ground truth.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { recognizePlan } from './dist/recognize/index.mjs';
import { findRooms, nearest, validateFeatures } from './dist/geometry.mjs';

/**
 * Rasterise a 14 × 10 m sheet at `ppm` pixels per metre. Everything is specified in
 * metres; the returned `truth` lists what the recogniser should find.
 */
export function syntheticPlan(ppm) {
  const W = Math.round(14 * ppm),
    H = Math.round(10 * ppm),
    gray = new Uint8Array(W * H).fill(255),
    px = (m) => m * ppm;
  const fillRect = (x0, y0, x1, y1, v) => {
    for (let y = Math.max(0, Math.round(px(y0))); y < Math.min(H, Math.round(px(y1))); y++)
      for (let x = Math.max(0, Math.round(px(x0))); x < Math.min(W, Math.round(px(x1))); x++)
        gray[y * W + x] = Math.min(gray[y * W + x], v);
  };
  // Thin line, `width` in pixels (linework is drawn at a fixed pen width).
  const line = (x0, y0, x1, y1, v = 70, width = Math.max(1, ppm / 50)) => {
    const n = Math.ceil(Math.hypot(px(x1 - x0), px(y1 - y0)) * 2) + 1,
      r = width / 2;
    for (let i = 0; i <= n; i++) {
      const cx = px(x0 + ((x1 - x0) * i) / n),
        cy = px(y0 + ((y1 - y0) * i) / n);
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r - 1); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r - 1); x++)
          if (x >= 0 && y >= 0 && x < W && y < H) gray[y * W + x] = Math.min(gray[y * W + x], v);
    }
  };
  const arc = (cx, cy, r, a0, a1) => {
    const n = 40;
    for (let i = 0; i < n; i++) {
      const p = a0 + ((a1 - a0) * i) / n,
        q = a0 + ((a1 - a0) * (i + 1)) / n;
      line(cx + r * Math.cos(p), cy + r * Math.sin(p), cx + r * Math.cos(q), cy + r * Math.sin(q));
    }
  };

  // Floor tint inside the building.
  fillRect(3, 1, 13, 8.5, 232);
  // Exterior walls, 0.30 m, with a window gap in the top and bottom walls.
  const T = 0.3,
    hT = T / 2;
  fillRect(3 - hT, 1 - hT, 5, 1 + hT, 0); // top, left of window
  fillRect(6.5, 1 - hT, 13 + hT, 1 + hT, 0); // top, right of window
  fillRect(3 - hT, 8.5 - hT, 9.5, 8.5 + hT, 0); // bottom, left of window
  fillRect(11.5, 8.5 - hT, 13 + hT, 8.5 + hT, 0); // bottom, right of window
  fillRect(3 - hT, 1 - hT, 3 + hT, 8.5 + hT, 0); // left
  fillRect(13 - hT, 1 - hT, 13 + hT, 8.5 + hT, 0); // right
  // Glazing: two thin lines across each window gap.
  for (const [x0, x1, y] of [
    [5, 6.5, 1],
    [9.5, 11.5, 8.5],
  ]) {
    line(x0, y - 0.04, x1, y - 0.04);
    line(x0, y + 0.04, x1, y + 0.04);
  }
  // Partitions, 0.12 m, with 0.85 m doors and their swings.
  const P = 0.06;
  fillRect(7 - P, 1, 7 + P, 4, 30);
  fillRect(7 - P, 4.85, 7 + P, 8.5, 30);
  arc(7, 4, 0.85, 0, Math.PI / 2); // hinge at (7, 4), opens to +x
  line(7, 4, 7 + 0.85, 4);
  fillRect(7, 5 - P, 9, 5 + P, 30);
  fillRect(9.85, 5 - P, 13, 5 + P, 30);
  arc(9, 5, 0.85, -Math.PI / 2, 0); // hinge at (9, 5), opens to -y
  line(9, 5, 9, 5 - 0.85);
  // Stair: treads every 0.28 m, 1.1 m wide, inside the left room.
  const stairY0 = 5.8,
    treads = 8;
  for (let i = 0; i <= treads; i++)
    line(3.4, stairY0 + i * 0.28, 4.5, stairY0 + i * 0.28, 110, Math.max(1, ppm / 60));
  line(3.4, stairY0, 3.4, stairY0 + treads * 0.28, 110);
  line(4.5, stairY0, 4.5, stairY0 + treads * 0.28, 110);
  // Furniture (bed and table): thin outlines that must not become walls or stairs.
  for (const [x0, y0, x1, y1] of [
    [9.5, 1.6, 11.1, 3.6],
    [9.6, 6, 11.2, 7.2],
  ]) {
    line(x0, y0, x1, y0, 140);
    line(x1, y0, x1, y1, 140);
    line(x1, y1, x0, y1, 140);
    line(x0, y1, x0, y0, 140);
  }
  // Terrace outside the left wall: 0.6 m paving grid.
  for (let y = 2; y <= 6.01; y += 0.6) line(0.4, y, 2.6, y, 150);
  for (let x = 0.4; x <= 2.61; x += 0.55) line(x, 2, x, 5.6, 150);
  // Alternating graphic scale 0 – 1 – 2.5 – 5 m.
  const bar = (a, b, top) => fillRect(0.5 + a, top ? 9.4 : 9.47, 0.5 + b, top ? 9.47 : 9.54, 20);
  bar(0, 1, true);
  bar(1, 2.5, false);
  bar(2.5, 5, true);

  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < gray.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i];
    rgba[i * 4 + 3] = 255;
  }
  return {
    rgba,
    W,
    H,
    truth: {
      sheetWidth: 14,
      wallThickness: T,
      exterior: [
        { x: 8, y: 1 },
        { x: 8, y: 8.5 },
        { x: 3, y: 4.75 },
        { x: 13, y: 4.75 },
      ],
      doors: [
        { x: 7, y: 4.425 },
        { x: 9.425, y: 5 },
      ],
      windows: [
        { x: 5.75, y: 1 },
        { x: 10.5, y: 8.5 },
      ],
      stair: { x: 3.95, y: stairY0 + (treads * 0.28) / 2, steps: treads + 1 },
      terrace: { x: 1.5, y: 4 },
      rooms: 3,
    },
  };
}

function check(ppm) {
  const { rgba, W, H, truth } = syntheticPlan(ppm),
    r = recognizePlan(rgba, W, H);
  const label = `synthetic plan at ${ppm} px/m`;
  assert.ok(r, `${label}: not recognised`);
  assert.equal(r.stats.mode, 'solid', `${label}: walls not seen as solid`);

  // Scale from the bar, within 3 %.
  assert.equal(r.scale?.source, 'bar', `${label}: scale bar not read`);
  const sheet = r.scale.sheetWidth;
  assert.ok(
    Math.abs(sheet - truth.sheetWidth) / truth.sheetWidth < 0.03,
    `${label}: scale ${sheet}`,
  );
  const toM = (p) => ({ x: p.x * sheet, y: p.y * ((sheet * H) / W) }),
    norm = (m) => ({ x: m.x / truth.sheetWidth, y: m.y / 10 }),
    near = (items, m, tol) =>
      items.find((it) => nearest(norm(m), it, truth.sheetWidth, 10).d < tol);

  const walls = r.walls.filter((w) => w.type === 'wall'),
    doors = r.walls.filter((w) => w.type === 'door' && !w.passage),
    windows = r.walls.filter((w) => w.type === 'window');
  for (const p of truth.exterior) {
    const w = near(walls, p, 0.2);
    assert.ok(w, `${label}: missing exterior wall at ${p.x},${p.y}`);
    const t = w.thicknessRatio * sheet;
    assert.ok(Math.abs(t - truth.wallThickness) < 0.07, `${label}: wall thickness ${t.toFixed(3)}`);
  }
  for (const p of truth.doors) {
    const d = near(doors, p, 0.25);
    assert.ok(d, `${label}: missing door at ${p.x},${p.y}`);
    assert.ok(d.swing === 1 || d.swing === -1, `${label}: door without swing side`);
  }
  for (const p of truth.windows)
    assert.ok(near(windows, p, 0.25), `${label}: missing window at ${p.x},${p.y}`);
  // Furniture and treads must not turn into walls inside the rooms.
  assert.ok(walls.length <= 14, `${label}: ${walls.length} walls (furniture or treads as walls?)`);

  validateFeatures(r.features);
  const inside = (f, m) => {
    const a = toM({ x: f.x, y: f.y }),
      b = toM({ x: f.x + f.w, y: f.y + f.h });
    return m.x >= a.x - 0.2 && m.x <= b.x + 0.2 && m.y >= a.y - 0.2 && m.y <= b.y + 0.2;
  };
  const stairs = r.features.filter((f) => f.type === 'stair'),
    terraces = r.features.filter((f) => f.type === 'terrace');
  assert.equal(stairs.length, 1, `${label}: ${stairs.length} stairs`);
  assert.ok(inside(stairs[0], truth.stair), `${label}: stair misplaced`);
  assert.ok(
    Math.abs(stairs[0].steps - truth.stair.steps) <= 2,
    `${label}: ${stairs[0].steps} steps`,
  );
  assert.equal(terraces.length, 1, `${label}: ${terraces.length} terraces`);
  assert.ok(inside(terraces[0], truth.terrace), `${label}: terrace misplaced`);

  // Rooms close: walls and openings form a connected graph.
  const T = 0.2,
    rooms = findRooms(
      r.walls.map((w) => ({ ...w, thickness: w.thicknessRatio * sheet })),
      truth.sheetWidth,
      10,
      T,
    );
  assert.equal(rooms.length, truth.rooms, `${label}: ${rooms.length} rooms`);
  console.log(`Recognition ${ppm} px/m:`, r.stats);
}

// 35 px/m ≈ a 490 px wide web thumbnail (upscaled internally); 140 px/m ≈ a scan.
export function runRecognitionTests() {
  for (const ppm of [35, 140]) check(ppm);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runRecognitionTests();
