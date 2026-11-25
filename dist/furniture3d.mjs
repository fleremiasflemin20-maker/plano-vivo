// Interior furniture library: parametric low-poly models (soft cushions, legs, books,
// plants…) built with three.js primitives, in metres. Every model is centred on its
// footprint, sits on y = 0 and faces +z (its "front"); the caller rotates and places it.
import * as THREE from './vendor/three.js';

/**
 * Catalogue: Spanish name, category, default size (w × d × h, m) and default colours.
 * `main` is the fabric / body colour the user can change; `wood` the legs or frame.
 */
export const CATALOG = {
  sofa: { name: 'Sofá', cat: 'Sala', size: [2.1, 0.9, 0.85], main: '#8a9bab', wood: '#6b4e32' },
  sofa_l: {
    name: 'Sofá en L',
    cat: 'Sala',
    size: [2.6, 1.7, 0.85],
    main: '#b9b1a3',
    wood: '#6b4e32',
  },
  armchair: {
    name: 'Sillón',
    cat: 'Sala',
    size: [0.85, 0.85, 0.85],
    main: '#e9e4da',
    wood: '#8a6a48',
  },
  coffee_table: {
    name: 'Mesa de centro',
    cat: 'Sala',
    size: [1.1, 0.6, 0.42],
    main: '#c9a77c',
    wood: '#8a6a48',
  },
  coffee_round: {
    name: 'Mesa de centro redonda',
    cat: 'Sala',
    size: [0.9, 0.9, 0.4],
    main: '#ece6dc',
    wood: '#8a6a48',
  },
  tv_unit: {
    name: 'Mueble de TV',
    cat: 'Sala',
    size: [1.8, 0.42, 0.5],
    main: '#d9c3a3',
    wood: '#8a6a48',
  },
  bookshelf: {
    name: 'Librero',
    cat: 'Sala',
    size: [0.9, 0.35, 2.0],
    main: '#d2b48c',
    wood: '#d2b48c',
  },
  rug: { name: 'Alfombra', cat: 'Sala', size: [2.0, 1.4, 0.015], main: '#efe9df', wood: '#efe9df' },
  floor_lamp: {
    name: 'Lámpara de pie',
    cat: 'Sala',
    size: [0.45, 0.45, 1.6],
    main: '#f3ead8',
    wood: '#222222',
  },
  plant: { name: 'Planta', cat: 'Sala', size: [0.55, 0.55, 1.3], main: '#4f8a4a', wood: '#d8d2c8' },
  dining_table: {
    name: 'Mesa de comedor',
    cat: 'Comedor',
    size: [1.6, 0.9, 0.75],
    main: '#e3c494',
    wood: '#b38b5a',
  },
  dining_round: {
    name: 'Mesa redonda',
    cat: 'Comedor',
    size: [1.1, 1.1, 0.75],
    main: '#e3c494',
    wood: '#b38b5a',
  },
  chair: {
    name: 'Silla',
    cat: 'Comedor',
    size: [0.46, 0.5, 0.88],
    main: '#a9b7c6',
    wood: '#b38b5a',
  },
  bed_double: {
    name: 'Cama doble',
    cat: 'Dormitorio',
    size: [1.6, 2.05, 0.95],
    main: '#f5f3ee',
    wood: '#c7a57a',
  },
  bed_single: {
    name: 'Cama individual',
    cat: 'Dormitorio',
    size: [1.0, 2.0, 0.9],
    main: '#f5f3ee',
    wood: '#c7a57a',
  },
  nightstand: {
    name: 'Velador',
    cat: 'Dormitorio',
    size: [0.48, 0.4, 0.55],
    main: '#d9bd94',
    wood: '#d9bd94',
  },
  wardrobe: {
    name: 'Clóset',
    cat: 'Dormitorio',
    size: [1.6, 0.6, 2.2],
    main: '#eeeae3',
    wood: '#9b7b55',
  },
  dresser: {
    name: 'Cómoda',
    cat: 'Dormitorio',
    size: [1.2, 0.5, 0.85],
    main: '#d9bd94',
    wood: '#d9bd94',
  },
  desk: {
    name: 'Escritorio',
    cat: 'Estudio',
    size: [1.2, 0.6, 0.75],
    main: '#e8dcc8',
    wood: '#5e5e5e',
  },
  office_chair: {
    name: 'Silla de oficina',
    cat: 'Estudio',
    size: [0.6, 0.6, 1.0],
    main: '#3f4a55',
    wood: '#2b2b2b',
  },
  kitchen_counter: {
    name: 'Mesón de cocina',
    cat: 'Cocina',
    size: [2.4, 0.6, 0.9],
    main: '#f2f0ec',
    wood: '#c9c4bb',
  },
  upper_cabinets: {
    name: 'Alacenas',
    cat: 'Cocina',
    size: [2.4, 0.35, 0.7],
    main: '#f2f0ec',
    wood: '#c9c4bb',
  },
  fridge: {
    name: 'Refrigeradora',
    cat: 'Cocina',
    size: [0.75, 0.7, 1.8],
    main: '#d7dbde',
    wood: '#9aa1a6',
  },
  stove: {
    name: 'Cocina (estufa)',
    cat: 'Cocina',
    size: [0.6, 0.6, 0.9],
    main: '#e6e7e8',
    wood: '#2b2b2b',
  },
  island: {
    name: 'Isla de cocina',
    cat: 'Cocina',
    size: [1.6, 0.9, 0.9],
    main: '#2f3b45',
    wood: '#e9e5de',
  },
  toilet: {
    name: 'Inodoro',
    cat: 'Baño',
    size: [0.4, 0.68, 0.78],
    main: '#ffffff',
    wood: '#ffffff',
  },
  vanity: {
    name: 'Lavamanos con mueble',
    cat: 'Baño',
    size: [0.8, 0.48, 0.85],
    main: '#d9c3a3',
    wood: '#ffffff',
  },
  shower: { name: 'Ducha', cat: 'Baño', size: [0.9, 0.9, 2.0], main: '#cfe3ea', wood: '#b7bec2' },
  bathtub: { name: 'Tina', cat: 'Baño', size: [1.7, 0.75, 0.55], main: '#ffffff', wood: '#ffffff' },
  washer: {
    name: 'Lavadora',
    cat: 'Lavandería',
    size: [0.6, 0.6, 0.85],
    main: '#eef0f1',
    wood: '#9aa1a6',
  },
};

const mats = new Map();
function mat(color, rough = 0.78, extra = {}) {
  const key = color + rough + JSON.stringify(extra);
  if (!mats.has(key))
    mats.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }),
    );
  return mats.get(key);
}
const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
};

function mesh(geo, material, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
/** Box from its bottom centre. */
const box = (g, w, h, d, x, y, z, material) =>
  g.add(mesh(new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z));
/** Soft box: rounded footprint and bevelled edges (cushions, mattresses). */
function soft(g, w, h, d, x, y, z, material, r = 0.06) {
  r = Math.min(r, w / 2 - 0.005, d / 2 - 0.005, h / 2 - 0.005);
  const iw = w - 2 * r,
    id = d - 2 * r,
    c = Math.min(r, iw / 2, id / 2);
  const s = new THREE.Shape();
  s.moveTo(-iw / 2 + c, -id / 2);
  s.lineTo(iw / 2 - c, -id / 2);
  s.quadraticCurveTo(iw / 2, -id / 2, iw / 2, -id / 2 + c);
  s.lineTo(iw / 2, id / 2 - c);
  s.quadraticCurveTo(iw / 2, id / 2, iw / 2 - c, id / 2);
  s.lineTo(-iw / 2 + c, id / 2);
  s.quadraticCurveTo(-iw / 2, id / 2, -iw / 2, id / 2 - c);
  s.lineTo(-iw / 2, -id / 2 + c);
  s.quadraticCurveTo(-iw / 2, -id / 2, -iw / 2 + c, -id / 2);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, h - 2 * r),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  g.add(mesh(geo, material, x, y + r, z));
}
const cyl = (g, rt, rb, h, x, y, z, material, seg = 24) =>
  g.add(mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y + h / 2, z));
const ball = (g, r, x, y, z, material) =>
  g.add(mesh(new THREE.SphereGeometry(r, 16, 12), material, x, y, z));
function legs(g, w, d, h, inset, r, material) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      cyl(g, r, r * 0.8, h, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), material, 10);
}

const BOOKS = [
  '#c0392b',
  '#2c6e8f',
  '#e1b12c',
  '#27ae60',
  '#ecf0f1',
  '#34495e',
  '#d35400',
  '#8e44ad',
];

/** Build one item: { kind, w, d, h, color?, color2? } -> THREE.Group (front = +z). */
export function buildItem(item) {
  const spec = CATALOG[item.kind] || CATALOG.sofa;
  const [dw, dd, dh] = spec.size,
    w = item.w || dw,
    d = item.d || dd,
    h = item.h || dh,
    main = mat(item.color || spec.main, 0.9),
    wood = mat(item.color2 || spec.wood, 0.6),
    g = new THREE.Group();
  g.name = spec.name;
  switch (item.kind) {
    case 'sofa':
    case 'armchair': {
      const arm = Math.min(0.2, w * 0.14),
        seatH = 0.42;
      legs(g, w - 0.1, d - 0.1, 0.1, 0.04, 0.025, wood);
      soft(g, w, 0.18, d, 0, 0.1, 0, main, 0.04); // base
      const seats = item.kind === 'sofa' ? Math.max(2, Math.round((w - 2 * arm) / 0.75)) : 1,
        sw = (w - 2 * arm) / seats;
      for (let i = 0; i < seats; i++) {
        const x = -w / 2 + arm + sw * (i + 0.5);
        soft(g, sw - 0.02, 0.16, d - 0.28, x, 0.27, 0.1, main, 0.06); // seat cushion
        soft(g, sw - 0.04, h - seatH - 0.05, 0.2, x, seatH - 0.05, -d / 2 + 0.16, main, 0.07); // back cushion
      }
      soft(
        g,
        w,
        h - 0.15,
        0.16,
        0,
        0.12,
        -d / 2 + 0.08,
        mat(shade(item.color || spec.main, 0.92), 0.9),
        0.05,
      ); // back
      for (const s of [-1, 1])
        soft(
          g,
          arm,
          0.62 - 0.12,
          d,
          s * (w / 2 - arm / 2),
          0.12,
          0,
          mat(shade(item.color || spec.main, 0.95), 0.9),
          0.06,
        );
      break;
    }
    case 'sofa_l': {
      const c = mat(item.color || spec.main, 0.9);
      legs(g, w - 0.1, 0.8, 0.1, 0.04, 0.025, wood);
      soft(g, w, 0.32, 0.9, 0, 0.1, -d / 2 + 0.45, c, 0.05);
      soft(g, 0.9, 0.32, d - 0.9, w / 2 - 0.45, 0.1, 0.45, c, 0.05);
      soft(
        g,
        w,
        h - 0.15,
        0.18,
        0,
        0.12,
        -d / 2 + 0.09,
        mat(shade(item.color || spec.main, 0.9), 0.9),
        0.06,
      );
      soft(g, 0.18, 0.5, d, -w / 2 + 0.09, 0.12, 0, c, 0.06);
      for (let i = 0; i < 3; i++)
        soft(
          g,
          (w - 0.3) / 3 - 0.03,
          0.3,
          0.2,
          -w / 2 + 0.2 + ((w - 0.3) / 3) * (i + 0.5),
          0.38,
          -d / 2 + 0.27,
          c,
          0.08,
        );
      break;
    }
    case 'coffee_table':
    case 'dining_table':
    case 'desk': {
      const top = 0.04;
      soft(g, w, top, d, 0, h - top, 0, item.kind === 'coffee_table' ? wood : main, 0.012);
      legs(
        g,
        w,
        d,
        h - top,
        0.06,
        0.025,
        item.kind === 'desk' ? wood : mat(shade(item.color2 || spec.wood, 0.9), 0.6),
      );
      if (item.kind === 'desk') box(g, 0.4, 0.5, d - 0.06, w / 2 - 0.25, h - top - 0.52, 0, main);
      break;
    }
    case 'coffee_round':
    case 'dining_round': {
      cyl(g, w / 2, w / 2, 0.05, 0, h - 0.05, 0, main, 40);
      cyl(g, 0.05, 0.06, h - 0.05, 0, 0, 0, wood, 16);
      cyl(g, w * 0.22, w * 0.25, 0.03, 0, 0, 0, wood, 24);
      break;
    }
    case 'chair':
    case 'office_chair': {
      const seatH = 0.46;
      if (item.kind === 'office_chair') {
        cyl(g, 0.03, 0.03, seatH - 0.08, 0, 0.06, 0, wood, 10);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          box(g, 0.05, 0.04, 0.3, Math.sin(a) * 0.15, 0.03, Math.cos(a) * 0.15, wood);
        }
      } else legs(g, w - 0.04, d - 0.04, seatH - 0.05, 0.03, 0.018, wood);
      soft(g, w, 0.07, d, 0, seatH - 0.05, 0, main, 0.03);
      soft(g, w, h - seatH, 0.06, 0, seatH, -d / 2 + 0.04, main, 0.025);
      break;
    }
    case 'bed_double':
    case 'bed_single': {
      box(g, w, 0.3, d, 0, 0.05, 0, wood); // frame
      legs(g, w - 0.04, d - 0.04, 0.06, 0.03, 0.03, wood);
      soft(g, w - 0.04, 0.22, d - 0.06, 0, 0.33, 0.01, mat('#ffffff', 0.95), 0.05); // mattress
      soft(g, w - 0.02, 0.06, d * 0.68, 0, 0.53, d * 0.15, main, 0.04); // duvet
      soft(
        g,
        w + 0.02,
        0.12,
        0.3,
        0,
        0.5,
        d * 0.5 - 0.2,
        mat(shade(item.color || spec.main, 0.88), 0.95),
        0.05,
      ); // throw
      const pillows = item.kind === 'bed_double' ? 2 : 1;
      for (let i = 0; i < pillows; i++)
        soft(
          g,
          (w - 0.2) / pillows - 0.06,
          0.14,
          0.38,
          -w / 2 + 0.1 + ((w - 0.2) / pillows) * (i + 0.5),
          0.54,
          -d / 2 + 0.3,
          mat('#fbfaf7', 0.95),
          0.06,
        );
      soft(g, w + 0.06, h, 0.08, 0, 0, -d / 2 - 0.02, wood, 0.03); // headboard
      break;
    }
    case 'nightstand':
    case 'dresser':
    case 'tv_unit':
    case 'vanity': {
      legs(g, w - 0.04, d - 0.04, 0.1, 0.04, 0.02, mat(shade(spec.wood, 0.7), 0.6));
      soft(g, w, h - 0.1, d, 0, 0.1, 0, main, 0.015);
      const rows = item.kind === 'dresser' ? 3 : item.kind === 'nightstand' ? 2 : 1;
      for (let i = 0; i < rows; i++)
        box(
          g,
          w * 0.3,
          0.02,
          0.02,
          0,
          0.1 + ((h - 0.1) * (i + 0.5)) / rows,
          d / 2 + 0.005,
          mat('#bfa27a', 0.4),
        );
      if (item.kind === 'tv_unit') {
        box(g, Math.min(1.4, w * 0.8), 0.04, 0.2, 0, h, -0.05, mat('#222222', 0.5));
        box(g, Math.min(1.45, w * 0.82), 0.82, 0.04, 0, h + 0.05, -0.05, mat('#151515', 0.25));
      }
      if (item.kind === 'vanity') {
        soft(g, w * 0.55, 0.1, d * 0.6, 0, h, 0.02, mat('#ffffff', 0.3), 0.04);
        box(
          g,
          w * 0.7,
          0.7,
          0.03,
          0,
          h + 0.35,
          -d / 2 + 0.02,
          mat('#cfdde3', 0.1, { metalness: 0.4 }),
        );
      }
      if (item.kind === 'nightstand') {
        cyl(g, 0.07, 0.09, 0.2, 0.08, h, 0, mat('#ece4d6', 0.6));
        cyl(g, 0.12, 0.08, 0.16, 0.08, h + 0.2, 0, mat('#fbf3e2', 0.9, { emissive: '#3a3020' }));
      }
      break;
    }
    case 'wardrobe':
    case 'upper_cabinets':
    case 'kitchen_counter':
    case 'island': {
      const y0 = item.kind === 'upper_cabinets' ? 1.45 : 0;
      box(g, w, h, d, 0, y0, 0, main);
      const doors = Math.max(1, Math.round(w / 0.6));
      for (let i = 1; i < doors; i++)
        box(
          g,
          0.01,
          h - 0.04,
          0.01,
          -w / 2 + (w / doors) * i,
          y0 + 0.02,
          d / 2 + 0.005,
          mat(shade(item.color || spec.main, 0.8)),
        );
      for (let i = 0; i < doors; i++)
        box(
          g,
          0.02,
          0.18,
          0.02,
          -w / 2 + (w / doors) * (i + 0.5) + 0.08,
          y0 + h * 0.5,
          d / 2 + 0.015,
          mat('#9d9d9d', 0.3, { metalness: 0.6 }),
        );
      if (item.kind === 'kitchen_counter' || item.kind === 'island')
        box(g, w + 0.02, 0.04, d + 0.03, 0, h, 0, wood);
      if (item.kind === 'kitchen_counter') {
        soft(
          g,
          0.5,
          0.02,
          0.36,
          -w / 4,
          h + 0.02,
          0,
          mat('#b9bec2', 0.25, { metalness: 0.5 }),
          0.03,
        );
        cyl(
          g,
          0.015,
          0.015,
          0.28,
          -w / 4,
          h + 0.02,
          -0.2,
          mat('#b9bec2', 0.2, { metalness: 0.7 }),
          8,
        );
      }
      break;
    }
    case 'fridge':
    case 'washer':
    case 'stove': {
      soft(g, w, h, d, 0, 0, 0, main, 0.03);
      if (item.kind === 'fridge')
        box(g, w - 0.04, 0.01, 0.01, 0, h * 0.62, d / 2 + 0.005, mat('#8f969b'));
      if (item.kind === 'washer') {
        const door = mesh(
          new THREE.CylinderGeometry(w * 0.3, w * 0.3, 0.03, 32),
          mat('#5d6a73', 0.2),
          0,
          0.4,
          d / 2,
        );
        door.rotation.x = Math.PI / 2;
        g.add(door);
      }
      if (item.kind === 'stove')
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          cyl(g, 0.08, 0.08, 0.012, sx * w * 0.22, h, sz * d * 0.22, mat('#1d1d1d', 0.4), 20);
      break;
    }
    case 'toilet': {
      soft(g, w * 0.7, 0.4, d * 0.55, 0, 0, 0.06, main, 0.1);
      soft(g, w, 0.06, d * 0.62, 0, 0.4, 0.05, main, 0.12);
      box(g, w, 0.38, 0.18, 0, 0.4, -d / 2 + 0.09, main);
      break;
    }
    case 'shower': {
      box(g, w, 0.06, d, 0, 0, 0, mat('#f4f6f7', 0.4));
      const glass = mat(item.color || spec.main, 0.05, { transparent: true, opacity: 0.35 });
      box(g, w, h - 0.06, 0.01, 0, 0.06, d / 2, glass);
      box(g, 0.01, h - 0.06, d, w / 2, 0.06, 0, glass);
      cyl(
        g,
        0.1,
        0.1,
        0.02,
        -w / 2 + 0.25,
        h - 0.15,
        -d / 2 + 0.25,
        mat('#b9bec2', 0.2, { metalness: 0.7 }),
        16,
      );
      break;
    }
    case 'bathtub': {
      soft(g, w, h, d, 0, 0, 0, main, 0.08);
      soft(g, w - 0.16, 0.05, d - 0.16, 0, h - 0.04, 0, mat('#dfe9ec', 0.15), 0.1);
      break;
    }
    case 'bookshelf': {
      const t = 0.025,
        rows = Math.max(3, Math.round(h / 0.38));
      for (const s of [-1, 1]) box(g, t, h, d, s * (w / 2 - t / 2), 0, 0, wood);
      box(g, w, t, d, 0, h - t, 0, wood);
      for (let r = 0; r < rows; r++) {
        const y = (h / rows) * r;
        box(g, w - 2 * t, t, d, 0, y, 0, wood);
        let x = -w / 2 + t + 0.02,
          k = r * 3;
        while (x < w / 2 - t - 0.06) {
          const bw = 0.03 + ((k * 7) % 4) * 0.008,
            bh = (h / rows) * (0.55 + ((k * 5) % 4) * 0.08);
          if ((k * 11) % 9 !== 0)
            box(g, bw, bh, d * 0.75, x + bw / 2, y + t, 0.02, mat(BOOKS[k % BOOKS.length], 0.8));
          x += bw + 0.004;
          k++;
        }
      }
      break;
    }
    case 'rug': {
      soft(g, w, 0.012, d, 0, 0.002, 0, main, 0.005);
      break;
    }
    case 'floor_lamp': {
      cyl(g, 0.16, 0.18, 0.03, 0, 0, 0, wood, 24);
      cyl(g, 0.012, 0.012, h - 0.3, 0, 0.03, 0, wood, 8);
      cyl(
        g,
        0.17,
        0.22,
        0.3,
        0,
        h - 0.3,
        0,
        mat(item.color || spec.main, 0.9, { emissive: '#3b3322', side: THREE.DoubleSide }),
        28,
      );
      break;
    }
    case 'plant': {
      cyl(g, w * 0.32, w * 0.24, 0.38, 0, 0, 0, wood, 20);
      cyl(g, 0.018, 0.018, h * 0.45, 0, 0.36, 0, mat('#6b4e32'), 6);
      const leaf = mat(item.color || spec.main, 0.85),
        leaf2 = mat(shade(item.color || spec.main, 1.18), 0.85);
      for (const [px, py, pz, r, m] of [
        [0, h * 0.78, 0, w * 0.42, leaf],
        [w * 0.18, h * 0.66, w * 0.1, w * 0.3, leaf2],
        [-w * 0.16, h * 0.68, -w * 0.08, w * 0.3, leaf2],
        [w * 0.02, h * 0.92, -w * 0.12, w * 0.26, leaf],
      ])
        ball(g, r, px, py, pz, m);
      break;
    }
    default:
      soft(g, w, h, d, 0, 0, 0, main, 0.03);
  }
  return g;
}

/** Default size of a kind as { w, d, h }. */
export function defaultSize(kind) {
  const [w, d, h] = (CATALOG[kind] || CATALOG.sofa).size;
  return { w, d, h };
}
