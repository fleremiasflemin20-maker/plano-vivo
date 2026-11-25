// Plano Vivo studio entry point: wires the UI modules together and restores the last project.
//
//   ui/core.mjs   shared state, DOM helpers, undo history, autosave
//   ui/plan.mjs   2D canvas, drawing tools, inspector, scale calibration
//   ui/model.mjs  rebuild (rooms, quantities, 3D), restore, demo project
//   ui/build.mjs  image/PDF import and reconstruction (browser worker or Python engine)
//   ui/files.mjs  save/open/new, local versions, exports
//   ui/feedback.mjs  suggestions form (sent to the Cloudflare Worker)
import * as storage from './storage.mjs';
import {
  $,
  W,
  say,
  localEngine,
  state,
  viewer,
  project,
  checkpoint,
  syncHistory,
  autosave,
} from './ui/core.mjs';
import {
  draw,
  resetPlan,
  setTool,
  removeSelected,
  cancelPending,
  insertOpening,
  typeKey,
} from './ui/plan.mjs';
import { rebuild, restore, renderModel, setView, demo } from './ui/model.mjs';
import './ui/build.mjs';
import './ui/files.mjs';
import './ui/feedback.mjs';
import './ui/pro.mjs';
import './ui/interior.mjs';
import './ui/ai.mjs';
import { openShared } from './ui/share.mjs';
import './ui/stats.mjs';
import './ui/guide.mjs';

$('pythonPanel').hidden = !localEngine;
$('exportIFC').hidden = !localEngine;

// --- Undo / redo ---------------------------------------------------------

$('undo').onclick = async () => {
  if (!state.undo.length || state.busy) return;
  state.redo.push(project());
  await restore(state.undo.pop());
  syncHistory();
  say('Cambio deshecho.');
};
$('redo').onclick = async () => {
  if (!state.redo.length || state.busy) return;
  state.undo.push(project());
  await restore(state.redo.pop());
  syncHistory();
  say('Cambio rehecho.');
};

// --- Keyboard shortcuts --------------------------------------------------

const TOOL_KEYS = { v: 'select', p: 'wall', r: 'rectangle' };

window.addEventListener('keydown', (e) => {
  if (
    e.target.matches('input,select,textarea') ||
    document.querySelector('dialog[open]') ||
    state.busy
  )
    return;
  if (typeKey(e)) return;
  const key = e.key.toLowerCase();
  // In the walk, P and V add a door or window (handled by the viewer), not tools.
  if (viewer.isWalking() && !e.ctrlKey && !e.metaKey && (key === 'p' || key === 'v')) return;
  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    $(e.shiftKey ? 'redo' : 'undo').click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === 's') {
    e.preventDefault();
    $('save').click();
    return;
  }
  if (e.key === 'Escape') {
    cancelPending();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removeSelected();
  }
  if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
});

// --- View and camera buttons ---------------------------------------------

$('fitPlan').onclick = resetPlan;
$('resetcam').onclick = () => viewer.reset();
$('topcam').onclick = () => viewer.top();
$('exitwalk').onclick = () => viewer.reset();
$('walk').onclick = () => {
  if (viewer.walk()) {
    setView('model');
    say('Recorrido activo. Usa WASD o las flechas; arrastra para mirar.');
  }
};

// --- Openings and navigation in 3D ----------------------------------------

const OPENING = { door: 'Puerta', window: 'Ventana' };
viewer.setOnPlace((type, id, point) => {
  const wall = state.walls.find((w) => w.id === id);
  if (!insertOpening(point, type, wall)) return false;
  say(
    OPENING[type] +
      ' añadida. Ajusta su ancho y altura con Seleccionar en el plano, o deshaz con Ctrl Z.',
  );
  return true;
});
document.querySelectorAll('[data-place]').forEach((b) => {
  b.onclick = () => {
    const type = b.classList.contains('active') ? null : b.dataset.place;
    viewer.setPlacing(type);
    if (type) say('Haz clic sobre una pared del modelo 3D. Esc para terminar.');
  };
});
$('walkDoor').onclick = () => viewer.placeAhead('door');
$('walkWindow').onclick = () => viewer.placeAhead('window');
$('ghost').onchange = (e) => {
  viewer.setGhost(e.target.checked);
  say(
    e.target.checked
      ? 'Atraviesas las paredes. Desactívalo para volver a chocar con ellas.'
      : 'Vuelves a chocar con las paredes.',
  );
};
$('goRoom').onchange = (e) => {
  const i = e.target.value;
  e.target.value = '';
  if (i === '') return;
  if (viewer.goTo(Number(i))) setView('model');
  else say('No encontré un lugar libre en ese recinto.');
  e.target.blur();
};
$('calibrate').onclick = () => {
  setView('plan');
  setTool('scale');
  say('Marca una distancia conocida en el plano.');
};

// --- Project settings ----------------------------------------------------

for (const id of ['width', 'depth', 'height', 'thickness']) {
  let previous;
  $(id).addEventListener('focus', () => (previous = project()));
  $(id).addEventListener('change', () => {
    const el = $(id);
    if (!el.checkValidity() || !el.value) {
      say('Introduce una medida dentro del rango permitido.');
      if (previous) restore(previous);
      return;
    }
    if (id === 'width' || id === 'depth') state.scaleAssumed = false;
    if (previous) {
      checkpoint(previous);
      // With a background image, keep its aspect ratio when the width changes.
      if (id === 'width' && state.bg)
        $('depth').value = ((W() * state.bg.height) / state.bg.width).toFixed(4);
    }
    rebuild();
    viewer.reset();
  });
}
for (const id of ['material', 'floorMaterial']) $(id).onchange = () => rebuild();
for (const id of ['dims', 'showRooms', 'snap', 'ortho', 'chain', 'grid', 'review'])
  $(id).onchange = draw;
$('imageFloor').onchange = renderModel;
$('projectName').onchange = autosave;

new ResizeObserver(() => {
  viewer.resize();
  draw();
}).observe($('workspace'));

// --- Startup -------------------------------------------------------------

try {
  const saved = await storage.read('current');
  if (saved) {
    await restore(saved, false);
    say('Recuperamos tu último proyecto de este navegador.');
  } else demo();
} catch {
  demo();
}
syncHistory();
openShared();
