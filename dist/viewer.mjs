import * as THREE from './vendor/three.js';
import { nearest } from './geometry.mjs';
export function createViewer(container, onStatus) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8eeea');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.03, 1500),
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x97a48e, 2));
  const sun = new THREE.DirectionalLight(0xfff8ed, 3);
  sun.position.set(-7, 16, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const group = new THREE.Group();
  group.name = 'Plano Vivo';
  scene.add(group);
  let model = null,
    walking = false,
    yaw = 0.65,
    pitch = 0.85,
    radius = 20,
    lookPitch = 0,
    drag = null,
    position = new THREE.Vector3(),
    keys = {},
    floorTexture = null;
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  function box(w, h, d, x, y, z, material, rotation = 0, name = '') {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  function rebuild(data) {
    model = data;
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }
    floorTexture?.dispose();
    floorTexture = null;
    const { walls, W, D, H, T, rooms, image, material, floorColor, imageFloor, selected } = data,
      features = data.features || [];
    const base = box(W, 0.13, D, 0, -0.09, 0, mat('#d9dfd7'), 0, 'Base');
    base.castShadow = false;
    if (rooms.length) {
      const positions = [];
      for (const room of rooms)
        for (const r of room.runs) {
          const x = r.x * W - W / 2,
            z = r.y * D - D / 2,
            w = r.w * W,
            d = r.h * D;
          positions.push(
            x,
            0,
            z,
            x,
            0,
            z + d,
            x + w,
            0,
            z + d,
            x,
            0,
            z,
            x + w,
            0,
            z + d,
            x + w,
            0,
            z,
          );
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      const floor = new THREE.Mesh(geo, mat(floorColor));
      floor.receiveShadow = true;
      floor.name = 'Pisos interiores';
      group.add(floor);
    }
    if (image && imageFloor) {
      floorTexture = new THREE.Texture(image);
      floorTexture.colorSpace = THREE.SRGBColorSpace;
      floorTexture.needsUpdate = true;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(W, D),
        new THREE.MeshBasicMaterial({
          map: floorTexture,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.015;
      floor.name = 'Referencia del plano';
      group.add(floor);
    }
    for (const f of features) buildFeature(f, W, D, H);
    for (const s of walls) {
      const dx = (s.b.x - s.a.x) * W,
        dz = (s.b.y - s.a.y) * D,
        L = Math.hypot(dx, dz);
      if (L < 0.001) continue;
      const x = ((s.a.x + s.b.x - 1) * W) / 2,
        z = ((s.a.y + s.b.y - 1) * D) / 2,
        rot = -Math.atan2(dz, dx),
        h = s.height || H,
        t = s.thickness || T,
        m = mat(s.id === selected ? '#8bbda1' : material);
      if (s.type === 'wall') {
        // Extend joined ends by half the thickness so corners close without a notch.
        const ext = jointExtension(s, walls, W, D, T),
          ux = dx / L,
          uz = dz / L,
          cx = x + ((ext.b - ext.a) / 2) * ux,
          cz = z + ((ext.b - ext.a) / 2) * uz;
        box(L + ext.a + ext.b, h, t, cx, h / 2, cz, m, rot, 'Pared ' + s.id);
      } else {
        const sill = s.type === 'window' ? Math.min(s.sill ?? 0.9, h) : 0,
          opening = Math.min(s.openHeight || (s.type === 'window' ? 1.2 : 2.1), h - sill);
        if (sill > 0) box(L, sill, t, x, sill / 2, z, m, rot, 'Antepecho');
        box(
          L,
          h - sill - opening,
          t,
          x,
          sill + opening + (h - sill - opening) / 2,
          z,
          m.clone(),
          rot,
          'Dintel',
        );
        const frame = mat(s.type === 'door' ? '#af956e' : '#a6b5ad');
        for (const direction of [-1, 1])
          box(
            0.035,
            opening,
            t + 0.015,
            x + direction * Math.cos(rot) * (L / 2 - 0.02),
            sill + opening / 2,
            z - direction * Math.sin(rot) * (L / 2 - 0.02),
            frame.clone(),
            rot,
            'Marco',
          );
        if (s.type === 'window') {
          box(
            L,
            opening,
            0.025,
            x,
            sill + opening / 2,
            z,
            new THREE.MeshStandardMaterial({
              color: '#a1cad6',
              transparent: true,
              opacity: 0.36,
              roughness: 0.15,
            }),
            rot,
            'Vidrio',
          );
          box(L, 0.04, t + 0.02, x, sill + opening, z, frame.clone(), rot, 'Marco superior');
        } else {
          box(L, 0.04, t + 0.02, x, opening, z, frame.clone(), rot, 'Marco de puerta');
        }
      }
    }
    const extent = Math.max(W, D);
    Object.assign(sun.shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
      far: extent * 5,
    });
    sun.position.set(-extent * 0.6, extent * 1.6, extent);
    sun.shadow.camera.updateProjectionMatrix();
    resize();
  }
  /** Extra length at each end of a wall that meets another wall there. */
  function jointExtension(s, walls, W, D, T) {
    const t = s.thickness || T,
      out = { a: 0, b: 0 };
    for (const key of ['a', 'b'])
      for (const q of walls) {
        if (q === s || q.type !== 'wall') continue;
        if (nearest(s[key], q, W, D).d <= (q.thickness || T) / 2 + 0.02) {
          out[key] = t / 2;
          break;
        }
      }
    return out;
  }

  function buildFeature(f, W, D, H) {
    const x0 = f.x * W - W / 2,
      z0 = f.y * D - D / 2,
      w = f.w * W,
      d = f.h * D;
    if (f.type === 'terrace') {
      box(w, 0.05, d, x0 + w / 2, 0.025, z0 + d / 2, mat('#b89f78'), 0, 'Terraza');
      return;
    }
    // Stair climbing from the start of its axis to a full storey height.
    const n = f.steps,
      rise = H / n,
      along = f.axis === 'y' ? d : w,
      run = along / n,
      stepMat = mat('#d8d2c4');
    for (let i = 0; i < n; i++) {
      const top = rise * (i + 1),
        // Treads go from the far end (bottom) towards the near end (top), matching the
        // arrow drawn in plan.
        pos = along - run * (i + 0.5);
      if (f.axis === 'y') box(w, top, run, x0 + w / 2, top / 2, z0 + pos, stepMat, 0, 'Peldaño');
      else box(run, top, d, x0 + along - pos, top / 2, z0 + d / 2, stepMat, 0, 'Peldaño');
    }
  }

  function resize() {
    const r = container.getBoundingClientRect();
    if (r.width && r.height) {
      renderer.setSize(r.width, r.height);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
  }
  function reset() {
    walking = false;
    document.getElementById('movement').hidden = true;
    document.getElementById('modebadge').textContent = 'PERSPECTIVA';
    document.getElementById('modelhelp').textContent = 'Arrastra para girar · Rueda para acercarte';
    radius = Math.max(model?.W || 12, model?.D || 9) * 1.65;
    yaw = 0.65;
    pitch = 0.85;
  }
  function blocked(x, z) {
    if (!model) return true;
    const { W, D, T, walls } = model;
    if (Math.abs(x) > W / 2 || Math.abs(z) > D / 2) return true;
    return walls.some(
      (s) =>
        s.type !== 'door' &&
        nearest({ x: x / W + 0.5, y: z / D + 0.5 }, s, W, D).d < (s.thickness || T) / 2 + 0.16,
    );
  }
  function walk() {
    if (!model?.walls.length) return false;
    let candidates = model.rooms.map((r) => r.center);
    for (let y = 0.1; y < 0.95; y += 0.1)
      for (let x = 0.1; x < 0.95; x += 0.1) candidates.push({ x, y });
    const p = candidates.find((p) => !blocked((p.x - 0.5) * model.W, (p.y - 0.5) * model.D));
    if (!p) {
      onStatus('No se encontró espacio libre para iniciar. Revisa las paredes.');
      return false;
    }
    position.set((p.x - 0.5) * model.W, 1.65, (p.y - 0.5) * model.D);
    walking = true;
    yaw = 0;
    lookPitch = 0;
    document.getElementById('movement').hidden = false;
    document.getElementById('modebadge').textContent = 'RECORRIDO';
    document.getElementById('modelhelp').textContent =
      'WASD o flechas · Arrastra para mirar · Esc para salir';
    return true;
  }
  renderer.domElement.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    yaw -= dx * 0.006;
    if (walking) lookPitch = Math.max(-1.3, Math.min(1.3, lookPitch - dy * 0.005));
    else pitch = Math.max(0.1, Math.min(1.56, pitch + dy * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', () => (drag = null));
  renderer.domElement.addEventListener('pointercancel', () => (drag = null));
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (!walking) radius = Math.max(2, Math.min(800, radius * Math.exp(e.deltaY * 0.001)));
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea') || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') reset();
    if (walking) {
      keys[e.key.toLowerCase()] = true;
      if (e.key.startsWith('Arrow')) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
  window.addEventListener('blur', () => (keys = {}));
  document.querySelectorAll('[data-move]').forEach((b) => {
    b.onpointerdown = (e) => {
      keys[b.dataset.move] = true;
      b.setPointerCapture(e.pointerId);
    };
    b.onpointerup = b.onpointercancel = () => (keys[b.dataset.move] = false);
  });
  let last = performance.now();
  function animate(t) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.04, (t - last) / 1000);
    last = t;
    if (walking) {
      const f = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0),
        s = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0),
        step = (2.2 * dt) / Math.max(1, Math.hypot(f, s)),
        dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * step,
        dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * step;
      if (!blocked(position.x + dx, position.z)) position.x += dx;
      if (!blocked(position.x, position.z + dz)) position.z += dz;
      camera.position.copy(position);
      camera.lookAt(
        position.x - Math.sin(yaw) * Math.cos(lookPitch),
        position.y + Math.sin(lookPitch),
        position.z - Math.cos(yaw) * Math.cos(lookPitch),
      );
    } else {
      const r = radius * Math.max(1, 0.85 / camera.aspect);
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * r,
        Math.sin(pitch) * r,
        Math.cos(yaw) * Math.cos(pitch) * r,
      );
      camera.lookAt(0, 0.4, 0);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
  return {
    rebuild,
    resize,
    reset,
    walk,
    top: () => {
      reset();
      pitch = 1.56;
      yaw = 0;
    },
    png: () => renderer.domElement.toDataURL('image/png'),
    export: async () => {
      const { GLTFExporter } = await import('./vendor/GLTFExporter.js');
      const e = new GLTFExporter();
      return await e.parseAsync(group, { binary: true });
    },
  };
}
