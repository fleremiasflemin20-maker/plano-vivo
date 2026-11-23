// Architectural plan recognition: walls with thickness, doors, windows, passages,
// stairs, terraces and an estimated scale, from a raster plan.
//
//   1. Prepare: luminance, resize to a working resolution, separate ink from paper
//      and floor tints.
//   2. Strokes: distance-transform ridges give the drawing's line weights; walls are
//      the heavy weight, linework (furniture, text, hatching, glazing) the light one.
//   3. Walls: morphological opening keeps heavy strokes; long horizontal/vertical runs
//      become bands with their real thickness. Line drawings use double lines.
//   4. Openings: gaps along wall lines, classified by the linework inside/around them.
//   5. Graph: junction snapping so corners meet and rooms close.
//   6. Features: stairs and terraces from regular series of thin lines.
//   7. Scale: from door widths, sanity-checked against wall thickness.
import {
  toGray,
  resizeGray,
  minPool,
  histogram,
  inkThreshold,
  threshold,
  dilate,
  andNot,
  blackHat,
} from './raster.mjs';
import {
  analyseStrokes,
  detectWalls,
  thinSegments,
  lineDrawingWalls,
  snapJunctions,
  mergeCollinear,
  diagonalWalls,
  diagonalOpenings,
} from './walls.mjs';
import { detectOpenings, DOOR_WIDTH_M } from './openings.mjs';
import { scaleFromBar, scaleFromDoors } from './scale.mjs';
import { detectFeatures } from './features.mjs';
import { detectObjects } from './objects.mjs';

// Minimum local contrast (grey levels) for a pixel to count as linework.
const LINE_CONTRAST = 18;
const FAINT_CONTRAST = 12;
const FAINT_CONTRAST_UPSCALED = 8;
const MIN_SIDE = 1400; // small images are upscaled: thin details need a few pixels
const MAX_SIDE = 2400; // large ones are reduced (keeping the darkest pixel)

function prepare(rgba, W, H) {
  let gray = toGray(rgba, W, H),
    w = W,
    h = H;
  const longest = Math.max(W, H);
  if (longest < MIN_SIDE) {
    const f = Math.min(4, MIN_SIDE / longest);
    w = Math.round(W * f);
    h = Math.round(H * f);
    gray = resizeGray(gray, W, H, w, h);
  } else if (longest > MAX_SIDE) {
    const pooled = minPool(gray, W, H, Math.ceil(longest / MAX_SIDE));
    ({ gray, width: w, height: h } = pooled);
  }
  return { gray, w, h };
}

/** Convert an axis-aligned element to the editor's normalised segment. */
function segment(e, w, h) {
  const p = (s, c) => (e.o === 'h' ? { x: s / w, y: c / h } : { x: c / w, y: s / h });
  return { a: p(e.s0, e.c), b: p(e.s1, e.c) };
}

/**
 * @returns null when the image does not look like a plan this recogniser handles
 *          (caller falls back to the line detector), otherwise
 *          { walls, features, scale, stats, notes }. Wall `thicknessRatio` is the
 *          thickness as a fraction of the sheet width; multiply by the sheet width
 *          in metres.
 */
export function recognizePlan(rgba, W, H, progress = () => {}) {
  progress(8, 'Preparando la imagen…');
  const { gray, w, h } = prepare(rgba, W, H),
    upscaled = w > W,
    hist = histogram(gray),
    inkLevel = inkThreshold(hist, gray.length),
    marks = threshold(gray, inkLevel);
  let ink = 0;
  for (const v of marks) ink += v;
  if (ink < 50 || ink > marks.length * 0.35) return null;

  progress(18, 'Midiendo el grosor de los trazos…');
  const strokes = analyseStrokes(marks, w, h);

  progress(32, 'Buscando muros y tabiques…');
  let { walls, wallMask, slanted, tensor, wallWidth, mode } = detectWalls(marks, w, h, strokes);
  // Linework = local contrast away from the walls (glazing, door swings, stairs,
  // hatching). Black-hat finds faint lines drawn over floor tints too.
  const contrast = blackHat(gray, w, h, Math.max(7, strokes.thin * 2 + 5)),
    lines = threshold(
      contrast.map((v) => 255 - v),
      255 - LINE_CONTRAST,
    ),
    detail = andNot(lines, dilate(wallMask, w, h, 3, 3)),
    thinMax = Math.max(3, strokes.thin * 2 + 1),
    // Pieces of one line split by a crossing line are joined back.
    thinLines = mergeCollinear(
      thinSegments(detail, w, h, Math.max(12, Math.round(1.2 * (wallWidth || 8))), thinMax),
      Math.max(6, Math.round((wallWidth || 8) * 0.5)),
    );
  if (mode === 'lines') {
    ({ walls, wallWidth } = lineDrawingWalls(thinLines, w, h, strokes.thin));
  }
  if (walls.length < 3) return null;

  // Scale bars are dark and often heavier than linework: look for them in all the
  // ink (a chunky bar can pass the wall filter; bars inside the building outline are
  // rejected later), allowing strokes up to half a wall thick.
  const barMax = Math.max(thinMax, Math.round(wallWidth * 0.5)),
    // Both banding modes: strict keeps touching blocks apart in clean drawings,
    // tolerant survives the ragged edges of low-resolution images.
    // (not merged: merging would fuse the staggered blocks of an alternating bar).
    barCandidates = (mask) => [
      ...thinSegments(mask, w, h, 12, barMax, 5, true),
      ...thinSegments(mask, w, h, 12, barMax, 5, false),
    ];

  progress(55, 'Buscando puertas y ventanas…');
  // Gaps contain no walls by definition, so classify them with all the ink: at low
  // resolution glazing lines blur into one block that the wall mask would swallow.
  const found = detectOpenings(walls, marks, marks, w, h, wallWidth);
  walls = mergeCollinear(found.walls, 1);
  const openings = found.openings;

  progress(70, 'Uniendo esquinas y cruces…');
  snapJunctions(walls, Math.max(2, wallWidth * 0.5));
  // Walls at an angle: what is left of the heavy strokes once the axis walls are out.
  const slantedFound = diagonalOpenings(
      mode === 'solid' ? diagonalWalls(slanted, tensor, walls, w, h, wallWidth) : [],
      marks,
      w,
      h,
      wallWidth,
    ),
    diagonals = slantedFound.diagonals;

  progress(80, 'Buscando escaleras y terrazas…');
  // Treads and paving joints are often drawn very light, and upscaling a small image
  // blurs them further. Regular series cannot come from noise, so they are searched
  // in fainter linework than the rest of the recogniser uses.
  const featureLines =
    mode === 'solid'
      ? mergeCollinear(
          thinSegments(
            andNot(
              threshold(
                contrast.map((v) => 255 - v),
                255 - (upscaled ? FAINT_CONTRAST_UPSCALED : FAINT_CONTRAST),
              ),
              dilate(wallMask, w, h, 3, 3),
            ),
            w,
            h,
            Math.max(12, Math.round(1.2 * wallWidth)),
            thinMax,
          ),
          Math.max(6, Math.round(wallWidth * 0.5)),
        )
      : [];
  const features = mode === 'solid' ? detectFeatures(featureLines, wallWidth) : [];

  progress(90, 'Calculando la escala…');
  const foundScale =
      scaleFromBar(
        [
          { lines: barCandidates(marks), mask: marks },
          { lines: barCandidates(lines), mask: lines },
        ],
        walls,
        w,
        h,
        wallWidth,
      ) || scaleFromDoors(openings, wallWidth),
    scale = foundScale && { ...foundScale, sheetWidth: w * foundScale.metresPerPx };
  // Wide openings with nothing drawn in them are glazed (sliding doors, curtain walls)
  // more often than empty passages.
  const wideGap = scale ? WIDE_OPENING_M / scale.metresPerPx : 8 * wallWidth;
  for (const op of openings)
    if (op.kind === 'passage' && op.s1 - op.s0 > wideGap) op.kind = 'glazed';

  progress(94, 'Buscando muebles y textos…');
  // Everything already explained is left out: door swings, glazing, stairs, terraces.
  const exclude = [];
  for (const op of openings) {
    const reach = op.kind === 'door' ? op.s1 - op.s0 + 2 : wallWidth,
      [x0, x1, y0, y1] = [op.s0 - 2, op.s1 + 2, op.c - reach, op.c + reach];
    exclude.push(op.o === 'h' ? { x0, y0, x1, y1 } : { x0: y0, y0: x0, x1: y1, y1: x1 });
  }
  for (const op of slantedFound.openings) {
    const r = Math.hypot(op.x1 - op.x0, op.y1 - op.y0) + 2;
    exclude.push({
      x0: Math.min(op.x0, op.x1) - r,
      y0: Math.min(op.y0, op.y1) - r,
      x1: Math.max(op.x0, op.x1) + r,
      y1: Math.max(op.y0, op.y1) + r,
    });
  }
  for (const f of features)
    exclude.push({
      x0: f.x0 - wallWidth,
      y0: f.y0 - wallWidth,
      x1: f.x1 + wallWidth,
      y1: f.y1 + wallWidth,
    });
  const objects =
    mode === 'solid'
      ? detectObjects(detail, w, h, {
          exclude,
          walls: [...walls, ...diagonals],
          wallMask,
          wallWidth,
          // Without a scale, assume a typical 0.25 m wall to size furniture.
          metresPerPx: scale ? scale.metresPerPx : 0.25 / wallWidth,
        })
      : { furniture: [], labels: [] };

  const out = [];
  for (const wall of walls)
    out.push({
      ...segment(wall, w, h),
      type: 'wall',
      inferred: true,
      thicknessRatio: wall.t / w,
    });
  for (const d of diagonals)
    out.push({
      a: { x: d.x0 / w, y: d.y0 / h },
      b: { x: d.x1 / w, y: d.y1 / h },
      type: 'wall',
      inferred: true,
      thicknessRatio: d.t / w,
    });
  for (const op of slantedFound.openings)
    out.push({
      a: { x: op.x0 / w, y: op.y0 / h },
      b: { x: op.x1 / w, y: op.y1 / h },
      type: op.kind,
      inferred: true,
      thicknessRatio: op.t / w,
    });
  for (const op of openings) {
    const seg = segment(op, w, h);
    const item = {
      ...seg,
      type: op.kind === 'window' || op.kind === 'glazed' ? 'window' : 'door',
      inferred: true,
      thicknessRatio: op.t / w,
    };
    if (op.kind === 'passage') item.passage = true;
    // Floor-to-head glazing (window-door): no sill, door height.
    if (op.kind === 'glazed') Object.assign(item, { sill: 0, openHeight: 2.1 });
    if (op.swing) {
      // The editor draws the leaf hinged at `a`, swinging to the left of a→b in
      // screen coordinates; put the hinge first and record the side.
      if (op.swing.hinge === 's1') [item.a, item.b] = [item.b, item.a];
      const dx = item.b.x - item.a.x,
        dy = item.b.y - item.a.y,
        // Left of a→b in screen space is (dy, -dx); compare with the swing side.
        leftAcross = op.o === 'h' ? -dx : dy;
      item.swing = Math.sign(leftAcross) === op.swing.side ? 1 : -1;
    }
    out.push(item);
  }
  const plan = features.map((f) => ({
    type: f.type,
    x: f.x0 / w,
    y: f.y0 / h,
    w: (f.x1 - f.x0) / w,
    h: (f.y1 - f.y0) / h,
    ...(f.type === 'stair' ? { steps: f.steps, axis: f.axis } : {}),
  }));
  const box = (r) => ({
    x: r.x0 / w,
    y: r.y0 / h,
    w: (r.x1 - r.x0 + 1) / w,
    h: (r.y1 - r.y0 + 1) / h,
  });
  for (const f of objects.furniture)
    plan.push({ type: 'furniture', kind: f.kind, ...box(f), ...(f.back ? { back: f.back } : {}) });
  // Text is kept as the picture of its area (it is laid on the floor in 3D); the local
  // Python engine can read it (OCR).
  for (const l of objects.labels) {
    const m = Math.max(1, Math.round(wallWidth * 0.2));
    plan.push({
      type: 'label',
      ...box({
        x0: Math.max(0, l.x0 - m),
        y0: Math.max(0, l.y0 - m),
        x1: Math.min(w - 1, l.x1 + m),
        y1: Math.min(h - 1, l.y1 + m),
      }),
    });
  }

  const counts = {
    walls: walls.length + diagonals.length,
    diagonals: diagonals.length,
    doors:
      openings.filter((o) => o.kind === 'door').length +
      slantedFound.openings.filter((o) => o.kind === 'door').length,
    passages: openings.filter((o) => o.kind === 'passage').length,
    windows:
      openings.filter((o) => o.kind === 'window' || o.kind === 'glazed').length +
      slantedFound.openings.filter((o) => o.kind === 'window').length,
    stairs: plan.filter((f) => f.type === 'stair').length,
    terraces: plan.filter((f) => f.type === 'terrace').length,
    furniture: objects.furniture.length,
    labels: objects.labels.length,
  };
  const notes = [
    mode === 'solid'
      ? `Muros detectados por su grosor de trazo (≈ ${Math.round((wallWidth * W) / w)} px en la imagen original).`
      : 'Plano de líneas: muros detectados por líneas dobles o ejes.',
    !scale
      ? 'No se pudo estimar la escala: introduce el ancho real o calibra con dos puntos.'
      : scale.source === 'bar'
        ? `Escala leída de la barra gráfica (${fmtM(scale.barMetres)} m): ancho de lámina ≈ ${fmtM(scale.sheetWidth)} m.`
        : `Escala estimada con ${scale.doors} puertas de ${fmtM(DOOR_WIDTH_M)} m: ancho de lámina ≈ ${fmtM(scale.sheetWidth)} m. Confírmala o calibra con una medida conocida.`,
    diagonals.length
      ? `${diagonals.length} ${diagonals.length === 1 ? 'muro en diagonal' : 'muros en diagonal'}.`
      : '',
    objects.furniture.length ? 'Muebles propuestos por su contorno y medidas: revisa su tipo.' : '',
    'Revisa los elementos resaltados.',
  ];
  return {
    walls: out,
    features: plan,
    scale,
    notes: notes.filter(Boolean),
    stats: {
      ...counts,
      segments: walls.length + diagonals.length,
      openings: openings.length,
      mode,
      size: [w, h],
    },
  };
}

const WIDE_OPENING_M = 1.6;
const fmtM = (v) => v.toLocaleString('es', { maximumFractionDigits: 2 });
