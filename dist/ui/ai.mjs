// AI design (Cloudflare Workers AI through our Worker): rebuild the interior from photos or
// a video, create a home from a description, change a room by text or voice, and a
// realistic photo of the 3D view. Photos leave the device only after the user agrees.
import { CATALOG } from '../furniture3d.mjs';
import {
  STYLES,
  FLOORS,
  furnishRoom,
  placeExtra,
  styleFinishes,
  layoutProgram,
  restyle,
  obstaclesFrom,
  withoutRecognizedFurniture,
} from '../interior.mjs';
import { inRoom, roomName, roomTitle } from '../pro.mjs';
import { findRooms } from '../geometry.mjs';
import { $, W, D, T, say, state, viewer, checkpoint, uid, addWall } from './core.mjs';
import { rebuild, setView, clearProject } from './model.mjs';
import { resetPlan } from './plan.mjs';
import { setStyle } from './interior.mjs';
import { track } from './stats.mjs';

const HOSTED = 'https://plantea-3d.fleremiasflemin.workers.dev';
const API =
  (location.origin === HOSTED || /^http:\/\/localhost:8788$/.test(location.origin) ? '' : HOSTED) +
  '/api/ia/';
const CONSENT = 'pv-ia-ok';
const FLOOR_BY_NAME = {
  'madera clara': FLOORS['Madera clara'],
  'madera media': FLOORS['Madera media'],
  'madera oscura': FLOORS['Madera oscura'],
  porcelanato: FLOORS.Porcelanato,
  ceramica: FLOORS['Cerámica'],
  marmol: FLOORS['Mármol'],
  cemento: FLOORS.Cemento,
};

async function call(name, body) {
  const r = await fetch(API + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw Error(j.error || 'La IA no respondió. Inténtalo de nuevo.');
  return j;
}

/** Ask once before sending anything to the AI service. */
function consent() {
  try {
    if (localStorage.getItem(CONSENT)) return Promise.resolve(true);
  } catch {
    // ask every time
  }
  return new Promise((resolve) => {
    const d = $('aiConsent');
    d.returnValue = '';
    d.onclose = () => {
      const ok = d.returnValue === 'ok';
      if (ok)
        try {
          localStorage.setItem(CONSENT, '1');
        } catch {
          // fine
        }
      resolve(ok);
    };
    d.showModal();
  });
}

// --- Progress dialog ------------------------------------------------------------------------
const STEPS = ['aiStep1', 'aiStep2', 'aiStep3'];
let cancelled = false;
function progress(title, labels, thumbs = []) {
  cancelled = false;
  $('aiTitle').textContent = title;
  STEPS.forEach((id, i) => {
    $(id).textContent = labels[i];
    $(id).className = i === 0 ? 'run' : '';
  });
  $('aiThumbs').replaceChildren(
    ...thumbs.map((src) => {
      const im = new Image();
      im.src = src;
      return im;
    }),
  );
  $('aiError').textContent = '';
  $('aiProgress').showModal();
}
function step(i) {
  STEPS.forEach((id, k) => ($(id).className = k < i ? 'done' : k === i ? 'run' : ''));
}
function fail(msg) {
  $('aiError').textContent = msg;
  STEPS.forEach((id) => $(id).classList.remove('run'));
}
$('aiCancel').onclick = () => {
  cancelled = true;
  $('aiProgress').close();
};

// --- Images: downscale photos, pull frames from a video ---------------------------------------
function toJpeg(source, w, h, max = 768) {
  const k = Math.min(1, max / Math.max(w, h)),
    c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
async function photoData(file) {
  const bmp = await createImageBitmap(file);
  const url = toJpeg(bmp, bmp.width, bmp.height);
  bmp.close?.();
  return url;
}
async function videoFrames(file, n) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.src = URL.createObjectURL(file);
  await new Promise((ok, ko) => {
    v.onloadeddata = ok;
    v.onerror = () => ko(Error('No se pudo leer el video.'));
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    v.currentTime = (v.duration * (i + 0.5)) / n;
    await new Promise((ok) => (v.onseeked = ok));
    out.push(toJpeg(v, v.videoWidth, v.videoHeight));
  }
  URL.revokeObjectURL(v.src);
  return out;
}

// --- Apply an AI scene to the project ------------------------------------------------------------
/** Plan from a list of rooms when the sheet has no walls yet. */
function makePlan(ambientes) {
  const L = layoutProgram(ambientes.map((a) => ({ tipo: a.tipo, area: a.area || 12 })));
  if (!L) return false;
  clearProject();
  $('width').value = L.W.toFixed(2);
  $('depth').value = L.D.toFixed(2);
  for (const w of L.walls) addWall(w.a, w.b, w.type);
  state.roomTags = L.tags;
  $('filename').textContent =
    'Casa creada con IA · ' + L.W.toFixed(1) + ' × ' + L.D.toFixed(1) + ' m';
  resetPlan();
  state.rooms = findRooms(state.walls, W(), D(), T());
  return true;
}

/** Pair the AI rooms with the plan rooms: same type first, then by area. */
function pairRooms(ambientes) {
  const free = ambientes.map((a, i) => ({ ...a, i })),
    pairs = [];
  const rooms = state.rooms
    .map((r, i) => ({ r, i, name: roomName(r, state.roomTags) }))
    .sort((p, q) => q.r.area - p.r.area);
  for (const pr of rooms) {
    let k = pr.name ? free.findIndex((a) => a.tipo === pr.name) : -1;
    if (k < 0 && free.length) {
      k = 0;
      let best = Infinity;
      free.forEach((a, j) => {
        const d = Math.abs((a.area || pr.r.area) - pr.r.area);
        if (d < best) {
          best = d;
          k = j;
        }
      });
    }
    if (k >= 0) pairs.push([pr.r, free.splice(k, 1)[0]]);
  }
  return pairs;
}

function applyScene(scene) {
  checkpoint();
  if (!state.rooms.length && !makePlan(scene.ambientes)) throw Error('No se pudo crear el plano.');
  const style = STYLES[scene.estilo] ? scene.estilo : 'calido',
    st = STYLES[style];
  state.interiorStyle = style;
  // Real furniture replaces the plan's recognised furniture blocks (never both).
  if (!scene.vacio) state.features = withoutRecognizedFurniture(state.features, state.rooms);
  const items = [],
    finishes = [];
  for (const [room, a] of pairRooms(scene.ambientes)) {
    if (!roomName(room, state.roomTags)) {
      const r = room.runs[Math.floor(room.runs.length / 2)];
      state.roomTags.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, name: a.tipo });
    }
    const p = room.runs[Math.floor(room.runs.length / 2)];
    finishes.push({
      x: p.x + p.w / 2,
      y: p.y + p.h / 2,
      floor: FLOOR_BY_NAME[a.piso] || st.floor,
      wall: a.pared || st.wall,
    });
    if (scene.vacio) continue;
    const wanted = a.muebles?.length ? [...new Set(a.muebles.map((m) => m.tipo))] : null;
    const obstacles = obstaclesFrom(state.features, state.columns, W(), D());
    let placed = furnishRoom(room, a.tipo, state.walls, W(), D(), style, null, 0, obstacles);
    if (wanted) {
      // Keep the layout's pieces the photo shows, then add the ones the layout did not include.
      const extra = wanted.filter((k) => !placed.some((it) => it.kind === k));
      placed = placed.filter((it) => wanted.includes(it.kind) || it.kind === 'rug');
      for (const k of extra) {
        const it = placeExtra(k, room, placed, W(), D(), undefined, {
          walls: state.walls,
          obstacles,
        });
        if (it) placed.push(it);
      }
      for (const m of a.muebles)
        if (m.color)
          placed.filter((it) => it.kind === m.tipo).forEach((it) => (it.color = m.color));
    }
    items.push(...placed);
  }
  state.items = items;
  state.finishes = finishes.length ? finishes : styleFinishes(state.rooms, style);
  state.selectedItem = null;
  rebuild();
  setView('model');
  viewer.reset();
}

// --- From photos or a video -------------------------------------------------------------------------
$('aiPhotos').onclick = () => $('aiFiles').click();
$('aiFiles').onchange = async () => {
  const files = [...$('aiFiles').files];
  $('aiFiles').value = '';
  if (!files.length || !(await consent())) return;
  try {
    const images = [];
    for (const f of files) {
      if (images.length >= 8) break;
      if (f.type.startsWith('video/'))
        images.push(...(await videoFrames(f, Math.min(6, 8 - images.length))));
      else if (f.type.startsWith('image/')) images.push(await photoData(f));
    }
    if (!images.length) throw Error('Elige fotos (JPG, PNG, WEBP) o un video.');
    const videos = files.filter((f) => f.type.startsWith('video/')).length,
      photos = files.length - videos;
    progress(
      'Leyendo ' +
        [
          videos ? (videos === 1 ? 'tu video' : videos + ' videos') : '',
          photos ? photos + (photos === 1 ? ' foto' : ' fotos') : '',
        ]
          .filter(Boolean)
          .join(' y '),
      ['Extrayendo imágenes', 'Encontrando ambientes y muebles', 'Reconstruyendo en 3D'],
      images,
    );
    step(1);
    const scene = await call('fotos', {
      imagenes: images,
      ambientes: state.rooms.map((r, i) => ({
        i,
        tipo: roomName(r, state.roomTags),
        area: Math.round(r.area),
      })),
    });
    if (cancelled) return;
    step(2);
    applyScene(scene);
    step(3);
    track('ia_fotos');
    setTimeout(() => $('aiProgress').close(), 500);
    say(
      `Listo: ${scene.ambientes.length} ambientes reconstruidos en estilo ${STYLES[scene.estilo]?.name || ''}. Cámbialos con la barra de abajo.`,
    );
  } catch (e) {
    if ($('aiProgress').open) fail(e.message);
    else say(e.message);
  }
};

// --- Describe a home ---------------------------------------------------------------------------------
$('aiDescribe').onclick = () => {
  $('aiDescribeText').value ||=
    'Departamento de dos dormitorios de 82 m², vacío, estilo cálido minimalista';
  $('aiDescribeDialog').showModal();
};
$('aiDescribeDialog').addEventListener('close', async () => {
  if ($('aiDescribeDialog').returnValue !== 'ok') return;
  const text = $('aiDescribeText').value.trim();
  if (!text || !(await consent())) return;
  try {
    progress('Creando tu casa', [
      'Entendiendo la descripción',
      'Distribuyendo ambientes',
      'Construyendo en 3D',
    ]);
    const p = await call('describir', { texto: text });
    if (cancelled) return;
    step(1);
    // Fit the areas to the total written in the text (e.g. «82 m²») and avoid two masters.
    const total = Number((text.match(/(\d{2,4})\s*m(2|²)/i) || [])[1]);
    let masters = 0;
    p.ambientes = p.ambientes.map((a) =>
      a.tipo === 'Dormitorio principal' && masters++ ? { ...a, tipo: 'Dormitorio' } : a,
    );
    const sum = p.ambientes.reduce((n, a) => n + a.area, 0);
    if (total > 15 && sum > 0)
      p.ambientes = p.ambientes.map((a) => ({ ...a, area: (a.area * total * 0.9) / sum }));
    clearProject();
    state.rooms = [];
    step(2);
    applyScene(p);
    track('ia_describir');
    setTimeout(() => $('aiProgress').close(), 500);
    say(
      `Casa creada: ${p.ambientes.length} ambientes${p.vacio ? ', vacía' : ' amueblados'}. Edita muros en el plano o pide cambios abajo.`,
    );
  } catch (e) {
    if ($('aiProgress').open) fail(e.message);
    else say(e.message);
  }
});

// --- «Cambia este cuarto» bar -----------------------------------------------------------------------
function barRooms() {
  const sel = $('aiRoom'),
    keep = sel.value;
  sel.replaceChildren(new Option('Toda la casa', 'all'));
  state.rooms.forEach((r, i) => sel.appendChild(new Option(roomTitle(r, i, state.roomTags), i)));
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  placeholder();
}
function placeholder() {
  const v = $('aiRoom').value;
  $('aiText').placeholder =
    v === 'all' || !v
      ? 'Cambia toda la casa…'
      : 'Cambia ' +
        ($('aiRoom')
          .selectedOptions[0]?.text.replace(/^R\d+ · /, '')
          .toLowerCase() || 'el ambiente') +
        '…';
}
new MutationObserver(barRooms).observe($('roomList'), { childList: true });
barRooms();

async function applyChange(text) {
  const all = $('aiRoom').value === 'all',
    rooms = all ? state.rooms : [state.rooms[Number($('aiRoom').value)]].filter(Boolean);
  if (!rooms.length) {
    say('Primero necesitas un ambiente: sube un plano, dibújalo o crea la casa con IA.');
    return;
  }
  const first = rooms[0],
    inside = (it) => rooms.some((r) => inRoom(it, r));
  $('aiSend').disabled = true;
  $('aiBar').classList.add('busy');
  try {
    const c = await call('cambiar', {
      texto: text,
      ambiente: {
        tipo: all ? 'Toda la casa' : roomName(first, state.roomTags) || 'Ambiente',
        estilo: state.interiorStyle,
        muebles: [...new Set(state.items.filter(inside).map((it) => it.kind))],
      },
    });
    checkpoint();
    if (c.estilo && all) setStyle(c.estilo, { quiet: true });
    for (const room of rooms) {
      const i = state.rooms.indexOf(room),
        type = roomName(room, state.roomTags) || 'Sala',
        st = STYLES[c.estilo || state.interiorStyle];
      if (c.vaciar) state.items = state.items.filter((it) => !inRoom(it, room));
      if (c.reacomodar) {
        state.features = withoutRecognizedFurniture(state.features, [room]);
        const kinds = [
            ...new Set(state.items.filter((it) => inRoom(it, room)).map((it) => it.kind)),
          ],
          colors = Object.fromEntries(
            state.items
              .filter((it) => inRoom(it, room) && it.color)
              .map((it) => [it.kind, it.color]),
          );
        const variant = (Number(room.variant) || 0) + 1;
        room.variant = variant;
        const next = furnishRoom(
          room,
          type,
          state.walls,
          W(),
          D(),
          c.estilo || state.interiorStyle,
          kinds.length ? kinds : null,
          variant,
          obstaclesFrom(state.features, state.columns, W(), D()),
        ).map((it) => ({ ...it, ...(colors[it.kind] ? { color: colors[it.kind] } : {}) }));
        state.items = state.items.filter((it) => !inRoom(it, room)).concat(next);
      }
      if (c.estilo && !all)
        state.items = state.items.map((it) => (inRoom(it, room) ? restyle([it], c.estilo)[0] : it));
      for (const k of c.quitar)
        state.items = state.items.filter((it) => !(inRoom(it, room) && it.kind === k));
      for (const m of c.recolorear)
        state.items.forEach((it) => inRoom(it, room) && it.kind === m.tipo && (it.color = m.color));
      for (const m of c.agregar) {
        const it = placeExtra(m.tipo, room, state.items, W(), D(), m.color, {
          walls: state.walls,
          obstacles: obstaclesFrom(state.features, state.columns, W(), D()),
        });
        if (it) state.items.push(it);
      }
      if (c.pared || c.piso || c.estilo) {
        const old = state.finishes.find((f) => inRoom(f, room)),
          p = room.runs[Math.floor(room.runs.length / 2)];
        state.finishes = state.finishes.filter((f) => !inRoom(f, room));
        state.finishes.push({
          x: p.x + p.w / 2,
          y: p.y + p.h / 2,
          floor: FLOOR_BY_NAME[c.piso] || (c.estilo ? st.floor : old?.floor || st.floor),
          wall: c.pared || (c.estilo ? st.wall : old?.wall || st.wall),
        });
      }
      void i;
    }
    rebuild();
    $('aiText').value = '';
    say('✓ ' + c.respuesta);
    track('ia_cambiar');
  } catch (e) {
    say(e.message);
  } finally {
    $('aiSend').disabled = false;
    $('aiBar').classList.remove('busy');
  }
}
$('aiBar').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('aiText').value.trim();
  if (text && (await consent())) applyChange(text);
};
for (const b of document.querySelectorAll('#aiSuggest button'))
  b.onclick = async () => {
    if (await consent()) applyChange(b.textContent);
  };
$('aiRoom').onchange = placeholder;

// Voice (Web Speech API, Spanish).
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Speech) $('aiMic').hidden = true;
else
  $('aiMic').onclick = () => {
    const rec = new Speech();
    rec.lang = 'es-EC';
    rec.interimResults = false;
    $('aiMic').classList.add('on');
    rec.onresult = (e) => {
      $('aiText').value = e.results[0][0].transcript;
      $('aiBar').requestSubmit();
    };
    rec.onend = () => $('aiMic').classList.remove('on');
    rec.start();
  };

// --- Realistic photo of the 3D view --------------------------------------------------------------------
$('aiRender').onclick = async () => {
  if (!state.walls.length || !(await consent())) return;
  let shot;
  try {
    const src = new Image();
    src.src = viewer.png();
    await src.decode();
    shot = toJpeg(src, src.width, src.height, 1024);
  } catch {
    say('No se pudo capturar la vista 3D.');
    return;
  }
  $('renderBefore').src = shot;
  $('renderAfter').removeAttribute('src');
  $('renderStatus').textContent = 'Generando la foto realista… (unos segundos)';
  $('renderDownload').hidden = true;
  $('renderDialog').showModal();
  try {
    const sel = $('aiRoom').value;
    const r = await call('foto', {
      imagen: shot,
      estilo: state.interiorStyle,
      ambiente:
        sel === 'all' ? 'apartment' : roomName(state.rooms[Number(sel)], state.roomTags) || 'room',
    });
    $('renderAfter').src = r.imagen;
    $('renderStatus').textContent = 'Desliza para comparar el 3D con la foto.';
    $('renderDownload').href = r.imagen;
    $('renderDownload').hidden = false;
    track('ia_foto');
  } catch (e) {
    $('renderStatus').textContent = e.message;
  }
};
$('renderSlider').oninput = () =>
  ($('renderAfterWrap').style.clipPath = `inset(0 0 0 ${$('renderSlider').value}%)`);
$('renderClose').onclick = () => $('renderDialog').close();

export { applyScene, uid, CATALOG };
