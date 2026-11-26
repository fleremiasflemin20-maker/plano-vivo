// Professional tools panel: structural grid, columns, slab, room names, technical review,
// quantity take-off, area table, glossary and geometry fixes.
import {
  ROOM_TYPES,
  inRoom,
  roomName,
  parseSpans,
  axisPositions,
  axisName,
  columnsAtGrid,
  takeoff,
  areaTable,
  review,
  closeJoints,
  straighten,
  FACTORS,
  GLOSSARY,
} from '../pro.mjs';
import { $, num, W, D, H, T, fmt, say, state, checkpoint, download } from './core.mjs';
import { rebuild, setView } from './model.mjs';
import { draw } from './plan.mjs';

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const csvCell = (v) =>
  /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
let csvRows = null,
  csvName = 'plantea-3d.csv';

export function openDialog(title, hint, html, rows, name) {
  $('proTitle').textContent = title;
  $('proHint').textContent = hint;
  $('proBody').innerHTML = html;
  csvRows = rows;
  csvName = name;
  $('proCSV').hidden = !rows;
  $('proDialog').showModal();
}
$('proClose').onclick = () => $('proDialog').close();
$('proCSV').onclick = () => {
  if (!csvRows) return;
  // BOM so Excel opens the accents; ';' as separator for Spanish locales.
  download(
    new Blob(['﻿' + csvRows.map((r) => r.map(csvCell).join(';')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
    csvName,
  );
  say('CSV exportado: ' + csvName + '.');
};

// --- Structural grid and columns -------------------------------------------------------
$('gridMake').onclick = () => {
  const sx = parseSpans($('gridSx').value),
    sy = parseSpans($('gridSy').value),
    ox = num('gridOx'),
    oy = num('gridOy');
  if (!sx || !sy || (!sx.length && !sy.length) || !Number.isFinite(ox) || !Number.isFinite(oy)) {
    say('Escribe las luces entre ejes en metros, separadas por comas. Ejemplo: 4, 3.5, 4');
    return;
  }
  const xs = axisPositions(ox, sx),
    ys = axisPositions(oy, sy);
  if (xs.at(-1) > W() + 0.001 || ys.at(-1) > D() + 0.001) {
    say(
      `Los ejes se salen de la hoja (${fmt(W(), 1)} × ${fmt(D(), 1)} m). Reduce el origen o las luces.`,
    );
    return;
  }
  checkpoint();
  state.grid = { xs, ys };
  rebuild();
  setView('plan');
  say(
    `Ejes trazados: ${xs.length} en X (1 a ${axisName('x', xs.length - 1)}) y ${ys.length} en Y (A a ${axisName('y', ys.length - 1)}).`,
  );
};
$('gridClear').onclick = () => {
  if (!state.grid) return;
  checkpoint();
  state.grid = null;
  rebuild();
};
$('colMake').onclick = () => {
  const b = num('colB'),
    h = num('colH');
  if (!state.grid) {
    say('Primero traza los ejes: las columnas se colocan en sus cruces.');
    return;
  }
  if (!(b >= 0.1 && b <= 3 && h >= 0.1 && h <= 3)) {
    say('La sección de la columna debe estar entre 0,10 y 3 m.');
    return;
  }
  const cols = columnsAtGrid(state.grid, b, h, W(), D());
  if (!cols.length) {
    say('Ningún cruce de ejes queda dentro de la hoja.');
    return;
  }
  checkpoint();
  state.columns = cols;
  rebuild();
  say(`${cols.length} columnas de ${fmt(b)} × ${fmt(h)} m en los cruces de ejes.`);
};
$('colClear').onclick = () => {
  if (!state.columns.length) return;
  checkpoint();
  state.columns = [];
  rebuild();
};

// --- Slab -----------------------------------------------------------------------------
function syncSlab() {
  $('slabT').value = state.slab.thickness;
  $('slabShow').checked = state.slab.show;
}
$('slabT').onchange = () => {
  const t = num('slabT');
  if (!(t >= 0.05 && t <= 0.6)) {
    say('El espesor de la losa debe estar entre 0,05 y 0,60 m.');
    syncSlab();
    return;
  }
  state.slab = { ...state.slab, thickness: t };
  rebuild();
};
$('slabShow').onchange = () => {
  state.slab = { ...state.slab, show: $('slabShow').checked };
  rebuild();
};
document.getElementById('proPanel').addEventListener('toggle', () => {
  syncSlab();
  if (state.grid) {
    $('gridOx').value = state.grid.xs[0] ?? 1;
    $('gridOy').value = state.grid.ys[0] ?? 1;
    $('gridSx').value = state.grid.xs
      .slice(1)
      .map((v, i) => +(v - state.grid.xs[i]).toFixed(3))
      .join(', ');
    $('gridSy').value = state.grid.ys
      .slice(1)
      .map((v, i) => +(v - state.grid.ys[i]).toFixed(3))
      .join(', ');
  }
});

// --- Room names -------------------------------------------------------------------------
for (const t of ROOM_TYPES) $('roomType').appendChild(new Option(t.name, t.name));
$('roomType').appendChild(new Option('Otro (escribe el nombre)', ''));
$('roomType').onchange = () => {
  if ($('roomType').value) $('roomNameInput').value = $('roomType').value;
};
let picked = null;
$('plan').addEventListener('roompick', (e) => {
  const p = e.detail,
    i = state.rooms.findIndex((r) => inRoom(p, r));
  if (i < 0) {
    say('Haz clic dentro de un recinto cerrado. Si no aparece, cierra las uniones de sus muros.');
    return;
  }
  const room = state.rooms[i],
    current = roomName(room, state.roomTags);
  picked = { room, point: p };
  $('roomDialogInfo').textContent = `Recinto R${i + 1} · ${fmt(room.area)} m²`;
  $('roomType').value = ROOM_TYPES.some((t) => t.name === current)
    ? current
    : current
      ? ''
      : 'Dormitorio';
  $('roomNameInput').value = current || 'Dormitorio';
  $('roomDialog').showModal();
  $('roomNameInput').select();
});
$('roomDialog').addEventListener('close', () => {
  const v = $('roomDialog').returnValue;
  if (!picked || v === 'cancel' || !v) return;
  const name = $('roomNameInput').value.trim().slice(0, 40);
  checkpoint();
  state.roomTags = state.roomTags.filter((t) => !inRoom(t, picked.room));
  if (v === 'ok' && name) state.roomTags.push({ x: picked.point.x, y: picked.point.y, name });
  picked = null;
  rebuild();
});

// --- Geometry fixes ---------------------------------------------------------------------
$('fixJoints').onclick = () => {
  const r = closeJoints(state.walls, W(), D());
  if (!r.fixed) {
    say('No hay uniones abiertas de menos de 15 cm.');
    return;
  }
  checkpoint();
  state.walls = r.walls;
  rebuild();
  say(`${r.fixed} uniones cerradas. Revisa el resultado; puedes deshacer con Ctrl Z.`);
};
$('fixStraight').onclick = () => {
  const r = straighten(state.walls, W(), D());
  if (!r.fixed) {
    say('Todos los muros casi rectos ya están a escuadra.');
    return;
  }
  checkpoint();
  state.walls = r.walls;
  rebuild();
  say(`${r.fixed} muros enderezados, sin romper sus uniones. Puedes deshacer con Ctrl Z.`);
};

// --- Technical review -------------------------------------------------------------------
const LEVEL = { error: 'Error', aviso: 'Aviso', info: 'Nota' };
$('proReview').onclick = () => {
  const found = review({
    walls: state.walls,
    rooms: state.rooms,
    tags: state.roomTags,
    features: state.features,
    W: W(),
    D: D(),
    H: H(),
    T: T(),
  });
  const list = $('reviewList');
  list.hidden = false;
  list.replaceChildren();
  if (!found.length) {
    list.textContent = 'Sin observaciones. Recuerda verificar la normativa local.';
    say('Revisión técnica: sin observaciones.');
    return;
  }
  for (const f of found) {
    const b = document.createElement('button');
    b.className = f.level;
    b.textContent = `${LEVEL[f.level]} · ${f.topic}: ${f.text}`;
    b.onclick = () => {
      state.flash = f.at || null;
      setView('plan');
      draw();
    };
    list.appendChild(b);
  }
  const n = (l) => found.filter((f) => f.level === l).length;
  say(
    `Revisión técnica: ${n('error')} errores, ${n('aviso')} avisos y ${n('info')} notas. Haz clic en una para verla en el plano.`,
  );
};

// --- Quantity take-off ------------------------------------------------------------------
const FACTOR_LABELS = {
  blocksPerM2: ['Bloques por m²', 'u/m²'],
  layMortar: ['Mortero de pega', 'm³/m²'],
  plaster: ['Espesor del enlucido', 'm'],
  subfloor: ['Espesor del contrapiso', 'm'],
  steelColumns: ['Cuantía de acero en columnas', 'kg/m³'],
  steelSlab: ['Cuantía de acero en losa', 'kg/m³'],
};
const factors = { ...FACTORS };
function renderTakeoff() {
  const rows = takeoff({
    walls: state.walls,
    rooms: state.rooms,
    columns: state.columns,
    slab: state.slab.show ? state.slab : null,
    W: W(),
    D: D(),
    H: H(),
    T: T(),
    factors,
  });
  const num2 = (r) => (r.unit === 'u' ? String(Math.round(r.qty)) : fmt(r.qty));
  let html =
    '<table><thead><tr><th>Grupo</th><th>Concepto</th><th class="n">Cantidad</th><th>Unidad</th></tr></thead><tbody>';
  for (const r of rows)
    html += `<tr><td>${esc(r.group)}</td><td>${esc(r.item)}</td><td class="n">${num2(r)}</td><td>${esc(r.unit)}</td></tr>`;
  html += '</tbody></table><h3 class="pro-h">Rendimientos (puedes cambiarlos)</h3><table><tbody>';
  for (const [k, [label, unit]] of Object.entries(FACTOR_LABELS))
    html += `<tr><td>${label}</td><td class="n"><input class="field factor" data-k="${k}" type="number" step="any" min="0" value="${factors[k]}"></td><td>${unit}</td></tr>`;
  html += '</tbody></table>';
  return { html, rows };
}
function showTakeoff() {
  const { html, rows } = renderTakeoff();
  openDialog(
    'Cómputos métricos preliminares',
    'Cantidades geométricas con rendimientos referenciales. No incluyen desperdicio ni sustituyen el cálculo estructural. Losa: activa «Ver en 3D» para incluirla.',
    html,
    [
      ['Grupo', 'Concepto', 'Cantidad', 'Unidad'],
      ...rows.map((r) => [
        r.group,
        r.item,
        r.unit === 'u' ? Math.round(r.qty) : r.qty.toFixed(3),
        r.unit,
      ]),
    ],
    'computos-plantea-3d.csv',
  );
  for (const input of $('proBody').querySelectorAll('input.factor'))
    input.onchange = () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v >= 0) factors[input.dataset.k] = v;
      showTakeoff();
    };
}
$('proTakeoff').onclick = showTakeoff;

// --- Area table ---------------------------------------------------------------------------
$('proAreas').onclick = () => {
  const rows = areaTable(state.rooms, state.roomTags),
    total = rows.reduce((n, r) => n + r.area, 0);
  if (!rows.length) {
    say('No hay recintos cerrados todavía.');
    return;
  }
  let html =
    '<table><thead><tr><th>Recinto</th><th>Ambiente</th><th class="n">Área (m²)</th><th class="n">%</th></tr></thead><tbody>';
  for (const r of rows)
    html += `<tr><td>${r.id}</td><td>${esc(r.name)}</td><td class="n">${fmt(r.area)}</td><td class="n">${fmt((100 * r.area) / total, 1)}</td></tr>`;
  html += `<tr><th colspan="2">Total área útil</th><th class="n">${fmt(total)}</th><th class="n">100</th></tr></tbody></table>`;
  openDialog(
    'Cuadro de áreas',
    'Área útil interior de cada recinto. Usa la herramienta Ambiente del plano para nombrarlos.',
    html,
    [
      ['Recinto', 'Ambiente', 'Area m2'],
      ...rows.map((r) => [r.id, r.name, r.area.toFixed(2)]),
      ['', 'Total', total.toFixed(2)],
    ],
    'cuadro-de-areas-plantea-3d.csv',
  );
};

// --- Glossary ---------------------------------------------------------------------------
$('proGlossary').onclick = () => {
  let html = '<table><tbody>';
  for (const [term, def] of GLOSSARY) html += `<tr><th>${esc(term)}</th><td>${esc(def)}</td></tr>`;
  openDialog(
    'Glosario de obra',
    'Términos que usa Plantea 3D.',
    html + '</tbody></table>',
    null,
    '',
  );
};
