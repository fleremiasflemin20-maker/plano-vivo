// Project files (save/open/new/demo), local versions and exports.
import { quantities, validateProject, toDXF } from '../geometry.mjs';
import * as storage from '../storage.mjs';
import {
  $,
  W,
  D,
  H,
  T,
  say,
  state,
  viewer,
  project,
  checkpoint,
  snapshot,
  confirmChange,
  download,
} from './core.mjs';
import { rebuild, restore, setView, clearProject, demo } from './model.mjs';
import { resetPlan, setTool } from './plan.mjs';

const MAX_PROJECT = 30 * 1024 * 1024;

// --- Project files -------------------------------------------------------

$('save').onclick = async () => {
  download(new Blob([JSON.stringify(project())], { type: 'application/json' }), 'plano-vivo.json');
  await snapshot();
  say('Proyecto descargado. Incluye imagen, medidas y geometría.');
};

$('load').onclick = () => $('json').click();
$('json').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_PROJECT) throw Error();
    const data = validateProject(JSON.parse(await file.text()));
    if (
      state.walls.length &&
      !(await confirmChange(
        'Abrir proyecto',
        'Se guardará una versión local del proyecto actual antes de reemplazarlo.',
      ))
    )
      return;
    await snapshot();
    checkpoint();
    await restore(data);
    say('Proyecto restaurado. También se admiten proyectos de la versión original.');
  } catch {
    say('El archivo no es un proyecto válido de Plano Vivo.');
  } finally {
    $('json').value = '';
  }
};

$('new').onclick = async () => {
  if (
    !(await confirmChange(
      'Crear un plano vacío',
      'Se guardará una versión del proyecto actual. Podrás recuperarla en Versiones locales.',
    ))
  )
    return;
  await snapshot();
  checkpoint();
  clearProject();
  $('projectName').value = 'Nuevo proyecto';
  $('filename').textContent = 'Plano vacío · dibuja tu primera pared';
  $('width').value = 12;
  $('depth').value = 9;
  resetPlan();
  rebuild();
  viewer.reset();
  setTool('wall');
  setView('split');
  say('Plano vacío listo. Usa Rectángulo para dibujar un recinto o Pared para comenzar.');
};

$('demo').onclick = async () => {
  if (
    !(await confirmChange(
      'Cargar el ejemplo',
      'Se guardará una versión local de tu proyecto antes de cargar la vivienda de ejemplo.',
    ))
  )
    return;
  await snapshot();
  checkpoint();
  demo();
};

// --- Local versions ------------------------------------------------------

function versionButton(v) {
  const b = document.createElement('button');
  b.textContent =
    new Date(v.date).toLocaleString('es') +
    ' · ' +
    (v.project.name || 'Proyecto') +
    ' · ' +
    v.project.walls.length +
    ' elementos';
  b.onclick = async () => {
    try {
      await snapshot();
      checkpoint();
      await restore(v.project);
      $('versionsDialog').close();
      say('Versión recuperada.');
    } catch {
      say('No se pudo recuperar esta versión.');
    }
  };
  return b;
}

$('versions').onclick = async () => {
  const list = $('versionList');
  list.replaceChildren();
  try {
    const versions = (await storage.read('versions')) || [];
    if (!versions.length)
      list.textContent = 'Todavía no hay versiones. Se crean al guardar, importar o reconstruir.';
    for (const v of versions) list.appendChild(versionButton(v));
    $('versionsDialog').showModal();
  } catch {
    say('El almacenamiento local no está disponible en este navegador.');
  }
};
$('closeVersions').onclick = () => $('versionsDialog').close();

// --- Exports -------------------------------------------------------------

const SVG_COLORS = { wall: '#416b59', door: '#ae8550', window: '#5295ac' };

function toSVG() {
  const lines = state.walls.map(
    (w) =>
      `<line x1="${w.a.x * W()}" y1="${w.a.y * D()}" x2="${w.b.x * W()}" y2="${w.b.y * D()}"` +
      ` stroke="${SVG_COLORS[w.type] || SVG_COLORS.window}"` +
      ` stroke-width="${w.type === 'wall' ? w.thickness || T() : 0.04}"/>`,
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W()} ${D()}">` +
    '<rect width="100%" height="100%" fill="white"/>' +
    lines.join('') +
    '</svg>'
  );
}

function quantitiesCSV() {
  const q = quantities(state.walls, W(), D(), H(), T()),
    rows = [
      ['Concepto', 'Cantidad', 'Unidad'],
      ['Longitud de muros incluidos vanos', q.linear.toFixed(3), 'm'],
      ['Area bruta de muro una cara', q.gross.toFixed(3), 'm2'],
      ['Area de aberturas', q.open.toFixed(3), 'm2'],
      ['Area neta de muro una cara', q.net.toFixed(3), 'm2'],
      ['Volumen geometrico sin deduplicar encuentros', q.volume.toFixed(3), 'm3'],
      ['Puertas', q.doors, 'ud'],
      ['Ventanas', q.windows, 'ud'],
      ...state.rooms.map((r, i) => ['Area aproximada recinto ' + (i + 1), r.area.toFixed(3), 'm2']),
      ['NOTA', 'Computo preliminar. No incluye desperdicios, estructura ni normativa.', ''],
    ];
  // BOM so Excel opens the accents correctly; ';' as separator for Spanish locales.
  return '﻿' + rows.map((row) => row.join(';')).join('\r\n');
}

$('exportDXF').onclick = () => {
  download(
    new Blob([toDXF(state.walls, W(), D(), state.features)], { type: 'application/dxf' }),
    'plano-vivo.dxf',
  );
  say(
    'DXF exportado en metros: capas MUROS, PUERTAS, VENTANAS, ESCALERAS, TERRAZAS, MUEBLES y TEXTOS.',
  );
};

$('exportSVG').onclick = () => {
  download(new Blob([toSVG()], { type: 'image/svg+xml' }), 'plano-vivo.svg');
};

$('exportCSV').onclick = () => {
  download(
    new Blob([quantitiesCSV()], { type: 'text/csv;charset=utf-8' }),
    'cantidades-plano-vivo.csv',
  );
  say(
    'Cantidades geométricas exportadas. Los encuentros pueden duplicar volumen; no son un presupuesto de obra.',
  );
};

$('exportGLB').onclick = async () => {
  try {
    $('exportGLB').disabled = true;
    const buffer = await viewer.export();
    download(new Blob([buffer], { type: 'model/gltf-binary' }), 'plano-vivo.glb');
    say('Modelo GLB exportado en metros.');
  } catch {
    say('No se pudo exportar el modelo GLB.');
  } finally {
    $('exportGLB').disabled = false;
  }
};

$('exportPNG').onclick = () => {
  try {
    const a = document.createElement('a');
    a.href = viewer.png();
    a.download = 'plano-vivo-3d.png';
    a.click();
  } catch {
    say('No se pudo capturar el modelo.');
  }
};

$('exportIFC').onclick = async () => {
  try {
    $('exportIFC').disabled = true;
    const data = project();
    delete data.image; // the server only needs geometry
    const response = await fetch('/api/export/ifc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw Error();
    download(await response.blob(), 'plano-vivo.ifc');
    say('IFC4 exportado: muros, aberturas y relaciones de puertas y ventanas. Modelo conceptual.');
  } catch {
    say('No se pudo exportar IFC. Comprueba que el motor local está activo.');
  } finally {
    $('exportIFC').disabled = false;
  }
};
