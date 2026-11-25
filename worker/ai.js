// AI endpoints (Cloudflare Workers AI). Photos and text are sent only to Workers AI for
// this request and are never stored. Every answer is validated against our catalogue.
//   POST /api/ia/fotos      { imagenes: [dataURL…], ambientes?: [{ i, tipo, area }] }
//   POST /api/ia/describir  { texto }
//   POST /api/ia/cambiar    { texto, ambiente: { tipo, muebles: [kind], piso, pared, estilo } }
//   POST /api/ia/foto       { imagen: dataURL, estilo, ambiente }

export const VISION = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const IMAGE = '@cf/black-forest-labs/flux-2-klein-4b';
export const TEXT = '@cf/mistralai/mistral-small-3.1-24b-instruct';

export const KINDS = [
  'sofa',
  'sofa_l',
  'armchair',
  'coffee_table',
  'coffee_round',
  'tv_unit',
  'bookshelf',
  'rug',
  'floor_lamp',
  'plant',
  'dining_table',
  'dining_round',
  'chair',
  'bed_double',
  'bed_single',
  'nightstand',
  'wardrobe',
  'dresser',
  'desk',
  'office_chair',
  'kitchen_counter',
  'upper_cabinets',
  'fridge',
  'stove',
  'island',
  'toilet',
  'vanity',
  'shower',
  'bathtub',
  'washer',
];
export const ROOM_TYPES = [
  'Sala',
  'Comedor',
  'Sala-comedor',
  'Cocina',
  'Dormitorio principal',
  'Dormitorio',
  'Estudio',
  'Baño',
  'Medio baño',
  'Lavandería',
  'Circulación',
  'Oficina',
  'Balcón',
];
export const STYLE_KEYS = ['calido', 'nordico', 'moderno', 'industrial', 'midcentury', 'verde'];
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_IMAGES = 8,
  MAX_IMAGE_CHARS = 700_000; // ~500 KB per photo once decoded

const COLOR = { type: 'string', description: 'Color hexadecimal #rrggbb' };
const ROOM = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ROOM_TYPES },
    area: { type: 'number', description: 'Área estimada en m²' },
    piso: {
      type: 'string',
      enum: [
        'madera clara',
        'madera media',
        'madera oscura',
        'porcelanato',
        'ceramica',
        'marmol',
        'cemento',
      ],
    },
    pared: COLOR,
    muebles: {
      type: 'array',
      items: {
        type: 'object',
        properties: { tipo: { type: 'string', enum: KINDS }, color: COLOR },
        required: ['tipo'],
      },
    },
  },
  required: ['tipo', 'muebles'],
};
const SCENE = {
  type: 'object',
  properties: {
    estilo: { type: 'string', enum: STYLE_KEYS },
    ambientes: { type: 'array', items: ROOM },
  },
  required: ['estilo', 'ambientes'],
};
const PROGRAM = {
  type: 'object',
  properties: {
    estilo: { type: 'string', enum: STYLE_KEYS },
    vacio: { type: 'boolean', description: 'true si la casa debe quedar sin muebles' },
    ambientes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { tipo: { type: 'string', enum: ROOM_TYPES }, area: { type: 'number' } },
        required: ['tipo', 'area'],
      },
    },
  },
  required: ['estilo', 'ambientes'],
};
const CHANGE = {
  type: 'object',
  properties: {
    estilo: { type: 'string', enum: STYLE_KEYS },
    piso: ROOM.properties.piso,
    pared: COLOR,
    agregar: ROOM.properties.muebles,
    quitar: { type: 'array', items: { type: 'string', enum: KINDS } },
    recolorear: ROOM.properties.muebles,
    reacomodar: { type: 'boolean' },
    vaciar: { type: 'boolean' },
    respuesta: { type: 'string', description: 'Frase breve en español que resume el cambio' },
  },
  required: ['respuesta'],
};

const CATALOG_TEXT =
  'Muebles disponibles (usa estos identificadores): ' +
  KINDS.join(', ') +
  '. sofa_l = sofá en L; coffee_round = mesa de centro redonda; tv_unit = mueble de TV; kitchen_counter = mesón; upper_cabinets = alacenas; vanity = lavamanos con mueble.';
const COLOR_TEXT =
  'Colores útiles: naranja #c8742c, terracota #c98a6a, verde oscuro #4f6b55, verde salvia #9fb39a, azul #3f6c9a, azul suave #b9cad6, gris #8a8f94, negro #2b2b2b, blanco #f4f3ef, beige #e6d6bd, mostaza #d4a24c, rosa #e3a6a6, morado #7a5c8f, café #6e4a2f.';
const STYLE_TEXT =
  'Estilos: calido (cálido minimalista), nordico, moderno, industrial, midcentury (mid-century), verde (natural con paredes verdes).';

/** Keep only what our catalogue understands; drop anything malformed. */
function cleanFurniture(list, max = 25) {
  return (Array.isArray(list) ? list : [])
    .filter((m) => KINDS.includes(m?.tipo))
    .slice(0, max)
    .map((m) => ({
      tipo: m.tipo,
      ...(HEX.test(m.color || '') ? { color: m.color.toLowerCase() } : {}),
    }));
}
const floorOk = (p) => (ROOM.properties.piso.enum.includes(p) ? p : undefined);
export function cleanScene(s) {
  if (!s || typeof s !== 'object') return null;
  const ambientes = (Array.isArray(s.ambientes) ? s.ambientes : [])
    .filter((a) => ROOM_TYPES.includes(a?.tipo))
    .slice(0, 16)
    .map((a) => ({
      tipo: a.tipo,
      ...(Number.isFinite(a.area) && a.area > 1 && a.area < 200
        ? { area: Math.round(a.area * 10) / 10 }
        : {}),
      ...(floorOk(a.piso) ? { piso: a.piso } : {}),
      ...(HEX.test(a.pared || '') ? { pared: a.pared.toLowerCase() } : {}),
      muebles: cleanFurniture(a.muebles),
    }));
  return {
    estilo: STYLE_KEYS.includes(s.estilo) ? s.estilo : 'calido',
    ambientes,
    ...(s.vacio === true ? { vacio: true } : {}),
  };
}
// Spanish words for each piece, to double-check what the model says the user asked for.
const WORDS = [
  [/plantas?/, 'plant'],
  [/l[aá]mparas?/, 'floor_lamp'],
  [/alfombras?/, 'rug'],
  [/sill[oó]n|butaca/, 'armchair'],
  [/librero|estanter[ií]a|biblioteca/, 'bookshelf'],
  [/mesa de centro|mesita/, 'coffee_table'],
  [/tele|tv|televis/, 'tv_unit'],
  [/sof[aá] en l|seccional/, 'sofa_l'],
  [/sof[aá]/, 'sofa'],
  [/sillas?/, 'chair'],
  [/escritorio/, 'desk'],
  [/cama doble|matrimonial/, 'bed_double'],
  [/cama/, 'bed_single'],
  [/velador|mesa de noche/, 'nightstand'],
  [/cl[oó]set|armario|ropero/, 'wardrobe'],
  [/c[oó]moda/, 'dresser'],
  [/mesa de comedor|comedor/, 'dining_table'],
  [/isla/, 'island'],
  [/refri|nevera|refrigerador/, 'fridge'],
  [/lavadora/, 'washer'],
];
/** Pieces the text asks to add («agrega una planta y una lámpara»). */
function askedToAdd(text) {
  const t = text.toLowerCase();
  if (!/(agrega|añade|a[nñ]ade|pon|coloca|incluye|quiero|suma|mete)/.test(t)) return [];
  const out = [];
  for (const [re, kind] of WORDS)
    if (
      re.test(t) &&
      !out.includes(kind) &&
      !(kind === 'sofa' && out.includes('sofa_l')) &&
      !(kind === 'bed_single' && out.includes('bed_double'))
    )
      out.push(kind);
  return out;
}
export function cleanChange(c, text = '', present = []) {
  if (!c || typeof c !== 'object') return null;
  const t = String(text).toLowerCase();
  const recolor = cleanFurniture(c.recolorear, 10).filter((m) => m.color);
  const add = cleanFurniture(c.agregar, 8);
  // Pieces named after «agrega/pon…» that are not there yet and not just being recoloured.
  for (const kind of askedToAdd(t))
    if (
      !add.some((m) => m.tipo === kind) &&
      !present.includes(kind) &&
      !recolor.some((m) => m.tipo === kind)
    )
      add.push({ tipo: kind });
  return {
    ...(STYLE_KEYS.includes(c.estilo) ? { estilo: c.estilo } : {}),
    ...(floorOk(c.piso) ? { piso: c.piso } : {}),
    ...(HEX.test(c.pared || '') ? { pared: c.pared.toLowerCase() } : {}),
    agregar: add.slice(0, 8),
    quitar: (Array.isArray(c.quitar) ? c.quitar : []).filter((k) => KINDS.includes(k)).slice(0, 10),
    recolorear: recolor,
    // Only when the words are there: the model sometimes sets these flags on its own.
    reacomodar:
      c.reacomodar === true &&
      (!t || /reacomod|reorganiz|reorden|redistribu|mueve|cambia (el )?orden/.test(t)),
    vaciar:
      (c.vacio === true || c.vaciar === true) &&
      (!t || /vac[ií]a|sin muebles|quita todo|saca todo/.test(t)),
    respuesta: typeof c.respuesta === 'string' ? c.respuesta.slice(0, 200) : 'Listo.',
  };
}

/** The model's JSON answer (it may come as an object or as text). */
function answer(res) {
  const r = res?.response ?? res;
  if (r && typeof r === 'object') return r;
  if (typeof r !== 'string') return null;
  const m = r.match(/\{[\s\S]*\}/);
  try {
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

async function vision(env, system, text, images, schema, maxTokens = 1500) {
  const content = [
    { type: 'text', text },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
  const res = await env.AI.run(VISION, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
    response_format: { type: 'json_schema', json_schema: schema },
    max_tokens: maxTokens,
    temperature: 0.2,
  });
  return answer(res);
}

export async function photos(env, body) {
  const imgs = (Array.isArray(body?.imagenes) ? body.imagenes : []).filter(
    (u) =>
      typeof u === 'string' &&
      /^data:image\/(jpeg|png|webp);base64,/.test(u) &&
      u.length <= MAX_IMAGE_CHARS,
  );
  if (!imgs.length) return { error: 'Sube al menos una foto (JPG, PNG o WEBP).' };
  if (imgs.length > MAX_IMAGES) return { error: `Máximo ${MAX_IMAGES} fotos por vez.` };
  const known = Array.isArray(body.ambientes)
    ? body.ambientes
        .slice(0, 16)
        .map((a) => `${a.tipo || 'sin nombre'} (${Number(a.area) || '?'} m²)`)
        .join(', ')
    : '';
  const system =
    'Eres un diseñador de interiores. Miras fotos de una vivienda y describes cada ambiente para reconstruirlo en 3D. ' +
    CATALOG_TEXT +
    ' ' +
    STYLE_TEXT +
    ' Responde solo con el JSON pedido.';
  const text =
    'Identifica cada ambiente que aparece en las fotos (sin repetirlos), su tipo, área aproximada, tipo de piso, color de paredes y los muebles que se ven, con su color dominante. Elige el estilo general más parecido.' +
    (known ? ` El plano tiene estos ambientes: ${known}. Usa esos tipos cuando correspondan.` : '');
  const scene = cleanScene(await vision(env, system, text, imgs, SCENE, 1800));
  return scene && scene.ambientes.length
    ? scene
    : {
        error:
          'No pude reconocer ambientes en esas fotos. Prueba con fotos más claras de cada cuarto.',
      };
}

export async function describe(env, body) {
  const t = typeof body?.texto === 'string' ? body.texto.trim().slice(0, 600) : '';
  if (t.length < 5) return { error: 'Describe tu casa en una frase.' };
  const system =
    'Eres un arquitecto. Conviertes una descripción en el programa de una vivienda: lista de ambientes con su área en m². ' +
    'Incluye siempre sala o sala-comedor, cocina y al menos un baño. Las áreas deben sumar el total pedido (o uno razonable). ' +
    STYLE_TEXT +
    ' Responde solo con el JSON pedido.';
  const res = await env.AI.run(VISION, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: t },
    ],
    response_format: { type: 'json_schema', json_schema: PROGRAM },
    max_tokens: 700,
    temperature: 0.2,
  });
  const p = cleanScene(answer(res));
  if (!p || !p.ambientes.length)
    return {
      error:
        'No entendí la descripción. Ejemplo: «departamento de 2 dormitorios de 80 m², estilo nórdico».',
    };
  p.ambientes = p.ambientes.map((a) => ({ ...a, area: a.area || 10 }));
  return p;
}

export async function change(env, body) {
  const t = typeof body?.texto === 'string' ? body.texto.trim().slice(0, 400) : '';
  if (t.length < 3) return { error: 'Escribe qué quieres cambiar.' };
  const a = body.ambiente || {};
  const ctx = `Ambiente: ${String(a.tipo || 'sin nombre').slice(0, 40)}. Estilo actual: ${String(a.estilo || 'calido').slice(0, 20)}. Muebles: ${(Array.isArray(a.muebles) ? a.muebles : []).filter((k) => KINDS.includes(k)).join(', ') || 'ninguno'}.`;
  const system =
    'Eres un diseñador de interiores que edita un ambiente en 3D. Traduce el pedido a cambios concretos en JSON. Reglas: ' +
    '«pared» es el color de las paredes en hexadecimal; «agregar» son muebles nuevos (con color si lo piden); ' +
    '«recolorear» cambia el color de muebles que ya existen; «quitar» los elimina; «estilo» solo si piden un estilo; ' +
    '«piso» solo si piden cambiar el piso; «reacomodar» si piden reorganizar; «vaciar» si piden vaciar. Cambia solo lo pedido. ' +
    CATALOG_TEXT +
    ' ' +
    COLOR_TEXT +
    ' ' +
    STYLE_TEXT +
    ' Ejemplo: pedido «paredes verde oscuro, sofá naranja y una planta» -> {"pared":"#4f6b55","recolorear":[{"tipo":"sofa","color":"#c8742c"}],"agregar":[{"tipo":"plant"}],"respuesta":"Paredes verde oscuro, sofá naranja y una planta nueva."}';
  const res = await env.AI.run(TEXT, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: ctx + '\nPedido: ' + t },
    ],
    response_format: { type: 'json_schema', json_schema: CHANGE },
    max_tokens: 600,
    temperature: 0.1,
  });
  const present = (Array.isArray(a.muebles) ? a.muebles : []).filter((k) => KINDS.includes(k));
  return (
    cleanChange(answer(res), t, present) || {
      error: 'No pude interpretar el pedido. Prueba: «paredes verde oscuro y sofá naranja».',
    }
  );
}

const STYLE_WORDS = {
  calido: 'warm minimalist, natural oak wood, beige linen',
  nordico: 'scandinavian, light wood, white walls, soft textiles',
  moderno: 'modern, clean lines, grey tones, matte black accents',
  industrial: 'industrial loft, concrete, dark metal, leather',
  midcentury: 'mid-century modern, walnut wood, teal and burnt orange',
  verde: 'natural, sage green walls, warm wood, plants',
};
export async function render(env, body) {
  const img = typeof body?.imagen === 'string' ? body.imagen : '';
  const m = img.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!m || img.length > 3_000_000) return { error: 'No se pudo leer la vista 3D.' };
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const style = STYLE_WORDS[body.estilo] || STYLE_WORDS.calido,
    room = String(body.ambiente || 'home interior').slice(0, 40);
  const prompt = `Photorealistic interior design photograph of the same ${room} as the reference 3D view: keep exactly the same layout, walls, windows, furniture positions and colors. ${style}. Natural daylight, realistic materials and textures, soft shadows, professional architectural photography, 35mm, high detail.`;
  const form = new FormData();
  form.append('prompt', prompt);
  form.append(
    'input_image_0',
    new Blob([bytes], { type: 'image/' + m[1] }),
    'vista.' + (m[1] === 'png' ? 'png' : 'jpg'),
  );
  form.append('width', '1024');
  form.append('height', '768');
  const req = new Response(form);
  const res = await env.AI.run(IMAGE, {
    multipart: { body: req.body, contentType: req.headers.get('content-type') },
  });
  return res?.image
    ? { imagen: 'data:image/jpeg;base64,' + res.image }
    : { error: 'No se pudo generar la foto. Inténtalo en un momento.' };
}

export const ROUTES = { fotos: photos, describir: describe, cambiar: change, foto: render };
