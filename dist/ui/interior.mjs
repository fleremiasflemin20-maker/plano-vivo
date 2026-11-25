// Interior design panel: styles, automatic furnishing, finishes per room, furniture
// catalogue and the editor of the selected piece (also selectable in 3D and in the plan).
import { CATALOG, defaultSize } from '../furniture3d.mjs';
import {
  STYLES,
  FLOORS,
  WALL_COLORS,
  furnishAll,
  furnishRoom,
  styleFinishes,
  restyle,
  itemList,
  guessType,
} from '../interior.mjs';
import { inRoom, roomName, roomTitle } from '../pro.mjs';
import { $, W, D, fmt, say, state, viewer, checkpoint, uid } from './core.mjs';
import { openDialog } from './pro.mjs';
import { rebuild, renderModel, setView } from './model.mjs';
import { draw } from './plan.mjs';

const roomOf = (p) => state.rooms.findIndex((r) => inRoom(p, r));
const roomPoint = (room) => {
  const r = room.runs[Math.floor(room.runs.length / 2)];
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const selRoom = () => state.rooms[Number($('intRoom').value)] || null;
const typeOf = (room, i) =>
  roomName(room, state.roomTags) || (i === 0 ? 'Sala-comedor' : guessType(room, W(), D()));

// --- Style chips -----------------------------------------------------------------------
for (const [key, st] of Object.entries(STYLES)) {
  const b = document.createElement('button');
  b.textContent = st.name;
  b.dataset.style = key;
  b.onclick = () => setStyle(key);
  $('styleChips').appendChild(b);
}
function paintChips() {
  for (const b of $('styleChips').children)
    b.classList.toggle('active', b.dataset.style === state.interiorStyle);
}
export function setStyle(key, { quiet = false } = {}) {
  if (!STYLES[key]) return;
  checkpoint();
  state.interiorStyle = key;
  if (state.rooms.length) state.finishes = styleFinishes(state.rooms, key);
  state.items = restyle(state.items, key);
  rebuild();
  paintChips();
  if (!quiet) say('Estilo ' + STYLES[key].name + ' aplicado a pisos, paredes y muebles.');
}

// --- Whole house -------------------------------------------------------------------------
$('furnishAll').onclick = () => {
  if (!state.rooms.length) {
    say('Primero necesitas recintos cerrados: dibuja o construye el plano.');
    return;
  }
  checkpoint();
  state.items = furnishAll(state.rooms, state.roomTags, state.walls, W(), D(), state.interiorStyle);
  state.finishes = styleFinishes(state.rooms, state.interiorStyle);
  state.selectedItem = null;
  rebuild();
  setView('model');
  say(
    `${state.items.length} muebles colocados en ${state.rooms.length} ambientes. Nómbralos con «Ambiente» para afinar.`,
  );
};
$('emptyAll').onclick = () => {
  if (!state.items.length) return;
  checkpoint();
  state.items = [];
  state.selectedItem = null;
  rebuild();
  say('Casa vacía: se quitaron todos los muebles (puedes deshacer con Ctrl Z).');
};
$('cutaway').onchange = () => {
  state.cutaway = $('cutaway').checked;
  renderModel();
};

// --- One room ----------------------------------------------------------------------------
for (const [name, hex] of Object.entries(FLOORS)) $('intFloor').appendChild(new Option(name, hex));
for (const [name, hex] of Object.entries(WALL_COLORS))
  $('intWall').appendChild(new Option(name, hex));
function fillRooms() {
  const sel = $('intRoom'),
    keep = sel.value;
  sel.replaceChildren();
  state.rooms.forEach((r, i) =>
    sel.appendChild(new Option(roomTitle(r, i, state.roomTags) + ' · ' + fmt(r.area) + ' m²', i)),
  );
  if (keep && Number(keep) < state.rooms.length) sel.value = keep;
  syncRoomFinish();
}
function syncRoomFinish() {
  const room = selRoom(),
    f = room && state.finishes.find((f) => inRoom(f, room));
  if (f) {
    if ([...$('intFloor').options].some((o) => o.value === f.floor)) $('intFloor').value = f.floor;
    if ([...$('intWall').options].some((o) => o.value === f.wall)) $('intWall').value = f.wall;
  }
}
$('intRoom').onchange = syncRoomFinish;
function setFinish(key, value) {
  const room = selRoom();
  if (!room) return;
  checkpoint();
  const old = state.finishes.find((f) => inRoom(f, room)),
    st = STYLES[state.interiorStyle] || STYLES.calido;
  state.finishes = state.finishes.filter((f) => !inRoom(f, room));
  state.finishes.push({
    ...roomPoint(room),
    floor: old?.floor || st.floor,
    wall: old?.wall || st.wall,
    [key]: value,
  });
  rebuild();
}
$('intFloor').onchange = () => setFinish('floor', $('intFloor').value);
$('intWall').onchange = () => setFinish('wall', $('intWall').value);
$('furnishRoom').onclick = () => {
  const room = selRoom(),
    i = Number($('intRoom').value);
  if (!room) return;
  checkpoint();
  state.items = state.items
    .filter((it) => !inRoom(it, room))
    .concat(furnishRoom(room, typeOf(room, i), state.walls, W(), D(), state.interiorStyle));
  if (!state.finishes.some((f) => inRoom(f, room))) {
    const st = STYLES[state.interiorStyle];
    state.finishes.push({ ...roomPoint(room), floor: st.floor, wall: st.wall });
  }
  rebuild();
  say(`${typeOf(room, i)} amueblado. Cambia su tipo con la herramienta «Ambiente» del plano.`);
};
$('emptyRoom').onclick = () => {
  const room = selRoom();
  if (!room) return;
  checkpoint();
  state.items = state.items.filter((it) => !inRoom(it, room));
  rebuild();
};

// --- Catalogue ---------------------------------------------------------------------------
const cats = {};
for (const [kind, c] of Object.entries(CATALOG)) (cats[c.cat] ||= []).push([kind, c]);
for (const [cat, list] of Object.entries(cats)) {
  const h = document.createElement('h4');
  h.textContent = cat;
  $('catalog').appendChild(h);
  for (const [kind, c] of list) {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.onclick = () => addItem(kind);
    $('catalog').appendChild(b);
  }
}
export function addItem(kind, at = null) {
  const room = selRoom();
  const p = at || (room ? roomPoint(room) : { x: 0.5, y: 0.5 });
  checkpoint();
  const it = { id: uid(), kind, x: p.x, y: p.y, rot: 0, ...defaultSize(kind) };
  state.items.push(it);
  state.selectedItem = it.id;
  rebuild();
  syncEditor();
  say(CATALOG[kind].name + ' agregado. Arrástralo en el plano con Seleccionar, o gíralo con R.');
}

// --- Selected piece ------------------------------------------------------------------------
const selected = () => state.items.find((it) => it.id === state.selectedItem) || null;
export function selectItem(id) {
  state.selectedItem = id;
  if (id) state.selected = null;
  syncEditor();
  renderModel();
  draw();
}
function syncEditor() {
  const it = selected();
  $('itemEditor').hidden = !it;
  if (!it) return;
  $('interiorPanel').open = true;
  $('itemName').textContent = CATALOG[it.kind]?.name || 'Mueble';
  $('itemW').value = it.w;
  $('itemD').value = it.d;
  $('itemH').value = it.h;
  $('itemColor').value = it.color || CATALOG[it.kind]?.main || '#cccccc';
  const i = roomOf(it);
  if (i >= 0) $('intRoom').value = i;
}
function updateItem(change, save = true) {
  const it = selected();
  if (!it) return;
  if (save) checkpoint();
  Object.assign(it, change);
  rebuild();
  syncEditor();
}
for (const [id, key, min, max] of [
  ['itemW', 'w', 0.1, 8],
  ['itemD', 'd', 0.1, 8],
  ['itemH', 'h', 0.01, 4],
])
  $(id).onchange = () => {
    const v = Number($(id).value);
    if (Number.isFinite(v) && v >= min && v <= max) updateItem({ [key]: v });
    else syncEditor();
  };
$('itemColor').onchange = () => updateItem({ color: $('itemColor').value });
const rotate = () => {
  const it = selected();
  if (it) updateItem({ rot: ((it.rot || 0) + 90) % 360 });
};
$('itemRotate').onclick = rotate;
$('itemCopy').onclick = () => {
  const it = selected();
  if (!it) return;
  checkpoint();
  const copy = {
    ...structuredClone(it),
    id: uid(),
    x: Math.min(1, it.x + 0.4 / W()),
    y: Math.min(1, it.y + 0.4 / D()),
  };
  state.items.push(copy);
  state.selectedItem = copy.id;
  rebuild();
  syncEditor();
};
const remove = () => {
  const it = selected();
  if (!it) return;
  checkpoint();
  state.items = state.items.filter((x) => x !== it);
  state.selectedItem = null;
  rebuild();
  syncEditor();
};
$('itemDelete').onclick = remove;

$('plan').addEventListener('itemselect', () => syncEditor());
viewer.setOnSelect((id) => selectItem(id));

// Keys for the selected piece: R rotates, Supr/Retroceso deletes, Esc deselects.
// Registered before app.mjs's own handler (this module is imported first).
window.addEventListener('keydown', (e) => {
  if (
    !state.selectedItem ||
    e.target.matches?.('input,select,textarea') ||
    document.querySelector('dialog[open]')
  )
    return;
  const k = e.key.toLowerCase();
  if (k === 'r' && !e.ctrlKey && !e.metaKey) rotate();
  else if (k === 'delete' || k === 'backspace') remove();
  else if (k === 'escape') selectItem(null);
  else return;
  e.preventDefault();
  e.stopImmediatePropagation();
});

// --- Furniture list -----------------------------------------------------------------------
$('itemListBtn').onclick = () => {
  const rows = itemList(state.items, state.rooms, state.roomTags);
  if (!rows.length) {
    say('Todavía no hay muebles. Pulsa «Amueblar todo» o agrega del catálogo.');
    return;
  }
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  let html =
    '<table><thead><tr><th>Mueble</th><th>Ambiente</th><th>Medidas</th><th>Color</th></tr></thead><tbody>';
  for (const r of rows)
    html += `<tr><td>${esc(r.name)}</td><td>${esc(r.room)}</td><td>${esc(r.size)}</td><td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${esc(r.color)};vertical-align:middle"></span> ${esc(r.color)}</td></tr>`;
  openDialog(
    'Lista de muebles',
    `${rows.length} piezas. Medidas de catálogo (ancho × fondo × alto).`,
    html + '</tbody></table>',
    [
      ['Mueble', 'Ambiente', 'Medidas', 'Color'],
      ...rows.map((r) => [r.name, r.room, r.size, r.color]),
    ],
    'muebles-plano-vivo.csv',
  );
};

// Keep the room list fresh when the panel opens and after every rebuild of the summary.
$('interiorPanel').addEventListener('toggle', () => {
  if ($('interiorPanel').open) {
    fillRooms();
    paintChips();
  }
});
new MutationObserver(() => $('interiorPanel').open && fillRooms()).observe($('roomList'), {
  childList: true,
});
paintChips();
