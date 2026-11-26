// Videos de presentacion para Instagram (vertical 1080 x 1920) y LinkedIn (horizontal 1920 x 1080):
// narracion (edge-tts), grabacion automatica de la app (Playwright + Edge), musica original de fondo
// (tools/video/musica.py) que baja bajo la voz, y subtitulos .srt. No toca los reels ni el video anterior.
//   SITE=http://127.0.0.1:8767/ NODE_PATH=<carpeta con playwright>/node_modules node presentacion.cjs [nombre] [ig|linkedin]
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'https://plano-vivo.fleremiasflemin.workers.dev/';
const URL_TXT = 'plano-vivo.fleremiasflemin.workers.dev';
const HERE = __dirname;
const OUT = path.join(HERE, '..', 'presentacion');
const WORK = path.join(HERE, 'presentacion-tmp');
const MUSIC = path.join(HERE, '..', '..', 'tools', 'video', 'musica.py');
const VOICE = 'es-EC-AndreaNeural';
const FORMATS = { ig: { W: 1080, H: 1920 }, linkedin: { W: 1920, H: 1080 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const card = (title, sub = '') =>
  `<div class="rv-brand"><i class="rv-mark"></i><em>plano<b>vivo</b></em></div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}`;
const END = card('Pruébalo gratis', `Para arquitectos, ingenieros y diseñadores<br><span class="url">${URL_TXT}</span>`);
const REAL = path.join(HERE, '..', 'ejemplos', 'planos', '01-casa-clasica.png');
const EJ = path.join(HERE, '..', 'ejemplos', 'planos') + path.sep;
// Licence notice for the Wikimedia plans (CC BY-SA 3.0 needs credit).
const CREDITS =
  '<p class="credits">Planos de ejemplo: Wikimedia Commons · «Beverley Hills Apartment 8/61» de Josh.Michael.Wilson, CC BY-SA 3.0 · casa clásica (Internet Archive) y Hampton Court Apartments, Vancouver 1912, dominio público.</p>';

// --- Guiones -------------------------------------------------------------------------
const VIDEOS = {
  '01-dibuja-tu-plano': [
    { card: card('Dibuja tu plano<br><span>y míralo en 3D</span>'), text: 'Dibuja tu plano y míralo en 3D mientras lo trazas.', act: async (a) => { await a.blank(); await a.mode('split'); } },
    { caption: 'Un recinto: dos clics', text: 'Traza un recinto con dos clics: las cuatro paredes salen a escuadra.', act: (a) => a.draw('rectangle', [[0.14, 0.24], [0.86, 0.76]]) },
    { caption: 'Muros interiores', text: 'Divide los espacios con muros interiores. El modelo 3D se actualiza al instante.', act: async (a) => { await a.draw('wall', [[0.52, 0.24], [0.52, 0.76]]); await a.draw('wall', [[0.52, 0.5], [0.86, 0.5]]); } },
    { caption: 'Puertas y ventanas', text: 'Coloca puertas y ventanas con un clic sobre el muro.', act: async (a) => { await a.draw('door', [[0.52, 0.62]]); await a.draw('door', [[0.7, 0.5]]); await a.draw('door', [[0.3, 0.76]]); await a.draw('window', [[0.32, 0.24]]); await a.draw('window', [[0.69, 0.24]]); await a.draw('window', [[0.86, 0.64]]); } },
    { caption: 'Medidas y áreas', text: 'Mide cualquier distancia y obtén el área de cada recinto en metros cuadrados.', act: (a) => a.draw('measure', [[0.14, 0.76], [0.86, 0.76]]) },
    { caption: 'Tu diseño, en 3D', text: 'Gira el modelo y expórtalo: DXF para tu programa de CAD, o GLB para 3D.', act: async (a) => { await a.mode('model'); await a.orbit(-280, 30, 3400); } },
    { card: END, text: 'Pruébalo gratis en tu navegador. El enlace está en el perfil.' },
  ],
  '02-sube-tu-plano': [
    { card: card('Sube tu plano<br><span>y obtén el 3D</span>'), text: 'Sube la imagen o el PDF de un plano y conviértelo en un modelo 3D.', act: (a) => a.load('demo.png') },
    { caption: 'Imagen o PDF', text: 'Sirve una foto, una captura de pantalla o un PDF del plano.', act: (a) => a.mode('plan') },
    { caption: 'Construir en 3D', text: 'Pulsa Construir en 3D: reconoce muros con su grosor, puertas, ventanas, escaleras y muebles.', act: async (a) => { await a.mode('split'); await a.build(); } },
    { caption: 'Con la escala del plano', text: 'Lee la escala del propio plano, así las medidas son reales.', act: async (a) => { await a.mode('model'); await a.orbit(-300, 20, 3600); } },
    { caption: 'También planos reales', text: 'Y funciona con planos reales de arquitectura.', act: async (a) => { await a.load(REAL); await a.mode('split'); await a.build(14); await a.mode('model'); await a.zoom(-2); await a.orbit(260, 10, 3200); } },
    { card: END, text: 'Pruébalo gratis. El enlace está en el perfil.' },
  ],
  '03-recorrido-puertas-ventanas': [
    { card: card('Recorre tu proyecto<br><span>por dentro</span>'), text: 'Recorre tu proyecto por dentro, como si ya estuviera construido.', act: async (a) => { await a.load('demo.png'); await a.build(); await a.mode('model'); } },
    { caption: 'A la altura de los ojos', text: 'Inicia el recorrido y camina a la altura de los ojos.', act: async (a) => { await a.walkStart(); await a.lookAround(); } },
    { caption: 'Pulsa V: una ventana', text: 'Apunta a una pared y pulsa V: aparece una ventana.', act: (a) => a.addAhead('window') },
    { caption: 'Pulsa P: una puerta', text: 'Pulsa P para abrir una puerta, y pasa por ella al siguiente espacio.', act: async (a) => { await a.addAhead('door'); await a.walkThrough(); } },
    { caption: 'Salta entre recintos', text: 'Salta a cualquier recinto con un clic, o atraviesa paredes si lo necesitas.', act: (a) => a.jumpRoom() },
    { caption: 'También desde el 3D', text: 'Desde la vista 3D, un clic sobre el muro añade la puerta o la ventana.', act: (a) => a.clickOpening('door') },
    { card: END, text: 'Gratis, sin instalar nada. El enlace está en el perfil.' },
  ],
  '04-todo-plano-vivo': [
    { card: card('Plano Vivo', 'Del plano al modelo 3D,<br>amueblado con IA'), text: 'Te presento Plano Vivo: del plano a un modelo 3D amueblado con inteligencia artificial, en tu navegador.', act: (a) => a.load('demo.png') },
    { caption: '1 · Sube tu plano', text: 'Sube la imagen o el PDF de un plano.', act: (a) => a.mode('app') },
    { caption: '2 · Construir en 3D', text: 'Con un clic reconoce muros con su grosor, puertas, ventanas, escaleras y muebles.', act: async (a) => { await a.build(); await a.mode('split'); await a.orbit(-200, 15, 2400, 'model'); } },
    { caption: '3 · Edita y mide', text: 'Corrige en 2D, mide, y obtén áreas, volúmenes y el área de cada recinto.', act: async (a) => { await a.mode('split'); await a.draw('measure', [[0.12, 0.92], [0.88, 0.92]]); await a.mode('app', 'metrics'); } },
    { caption: '4 · Amuebla con un clic', text: 'Amuébla la casa con un clic, según las medidas reales de cada ambiente, y elige el estilo.', act: async (a) => { await a.furnish('calido'); await a.mode('model'); await a.orbit(-220, 20, 2200); await a.style('nordico'); await a.orbit(160, 0, 1600); } },
    { caption: '5 · Cambia cada cuarto', text: 'Pídele cambios escribiendo o hablando: paredes verde oscuro y un sofá naranja.', act: (a) => a.askBar('paredes verde oscuro y un sofá naranja', 'Sala') },
    { caption: '6 · Foto realista', text: 'Y convierte la vista en una foto realista para tu cliente.', act: (a) => a.realPhoto() },
    { caption: '7 · Recorrido', text: 'Recórrelo por dentro, y añade puertas o ventanas donde apuntas.', act: async (a) => { await a.walkStart(); await a.addAhead('door'); await a.walkThrough(); } },
    { caption: '8 · Pro y exportación', text: 'Ejes, columnas, cómputos y revisión técnica, y exporta a DXF, GLB, CSV o comparte un enlace.', act: async (a) => { await a.exitWalk(); await a.mode('app', 'exports'); } },
    { card: END, text: 'Está en beta y queremos tu opinión: usa el botón Sugerencias. Pruébalo gratis.' },
  ],
  '06-interiores-con-ia': [
    { card: card('Diseña interiores<br><span>con IA</span>'), text: 'Ahora Plano Vivo también diseña interiores con inteligencia artificial.', act: (a) => a.blank() },
    { caption: 'Describe tu casa', text: 'Describe tu casa en una frase, y la IA crea el plano y lo amuebla en 3D.', act: (a) => a.describe('Departamento de dos dormitorios de 80 m2 con sala-comedor, cocina y baño, estilo cálido minimalista') },
    { caption: 'Estilos con un clic', text: 'Cambia el estilo de toda la casa con un clic: nórdico, industrial o mid-century.', act: async (a) => { await a.style('nordico'); await a.orbit(-160, 0, 1500); await a.style('midcentury'); await a.orbit(160, 0, 1500); } },
    { caption: 'Cambia cada cuarto', text: 'Pídele cambios a cada cuarto, escribiendo o con tu voz.', act: (a) => a.askBar('paredes verde oscuro, sofá naranja y agrega una planta', 'Sala') },
    { caption: 'Foto realista', text: 'Convierte la vista 3D en una foto realista, y compárala con el modelo.', act: (a) => a.realPhoto() },
    { caption: 'Con planos reales', text: 'Funciona con planos reales: súbelo, constrúyelo en 3D y amuéblalo con un clic.', act: async (a) => { await a.realPlan('plano-internet.webp', null, 'calido', -4); await a.realPlan(EJ + '01-casa-clasica.png', 14, 'nordico'); } },
    { caption: 'De departamentos a edificios', text: 'Desde un departamento hasta un edificio completo, con las medidas del plano.', act: async (a) => { await a.realPlan(EJ + '02-departamento-8-61.jpg', null, 'verde'); await a.realPlan(EJ + '03-hampton-court-vancouver.png', null, null, -2); } },
    { caption: 'Desde tus fotos', text: 'También puedes subir fotos o un video de tu casa, y la reconstruye en 3D.', act: (a) => a.fromPhotos('foto-ejemplo-ia.jpg') },
    { caption: 'Edita cada mueble', text: 'Haz clic en cualquier mueble para cambiar su color, medidas o girarlo.', act: (a) => a.pickFurniture() },
    { card: END + CREDITS, text: 'Pruébalo gratis en tu navegador. El enlace está en el perfil.', act: (a) => a.closeDialogs() },
  ],
  '05-funciones-profesionales': [
    { card: card('Herramientas<br><span>profesionales</span>', 'Para arquitectos, ingenieros civiles<br>y diseñadores'), text: 'Plano Vivo ahora trae herramientas profesionales para arquitectos, ingenieros civiles y diseñadores.', act: async (a) => { await a.demoHouse(); await a.mode('plan'); } },
    { caption: 'Ejes estructurales', text: 'Traza los ejes del proyecto con sus luces: números en un sentido y letras en el otro.', act: (a) => a.pro(() => { const $ = (id) => document.getElementById(id); $('proPanel').open = true; $('gridOx').value = 0.96; $('gridOy').value = 1.08; $('gridSx').value = '5.28, 4.08'; $('gridSy').value = '3.42, 3.42'; $('gridMake').click(); }, 'pro') },
    { caption: 'Columnas y losa', text: 'Coloca columnas en los cruces de ejes y una losa, y míralas en 3D.', act: async (a) => { await a.pro(() => { const $ = (id) => document.getElementById(id); $('colMake').click(); $('slabShow').checked = true; $('slabShow').dispatchEvent(new Event('change')); }); await a.mode('model'); await a.orbit(-260, 25, 3000); } },
    { caption: 'Nombra cada ambiente', text: 'Nombra cada ambiente: sala, dormitorio, baño. El área se calcula sola.', act: async (a) => { await a.mode('plan'); await a.nameRooms(['Sala-comedor', 'Dormitorio principal', 'Dormitorio', 'Baño']); } },
    { caption: 'Medida exacta al dibujar', text: 'Al dibujar un muro, escribe la longitud exacta y pulsa Intro.', act: (a) => a.typedWall('2.4') },
    { caption: 'Revisión técnica', text: 'La revisión técnica avisa lo que falta: ventanas, accesos, puertas angostas o escaleras incómodas.', act: (a) => a.reviewPro() },
    { caption: 'Cómputos métricos', text: 'Y obtén los cómputos: bloques, mortero, enlucido, hormigón y acero, listos para exportar.', act: (a) => a.dialogPro('proTakeoff') },
    { caption: 'Cuadro de áreas y DXF', text: 'Con cuadro de áreas por ambiente, y todo exportable a DXF con ejes, columnas y ambientes.', act: (a) => a.dialogPro('proAreas') },
    { card: END, text: 'Ya disponible, gratis, en tu navegador. El enlace está en el perfil.', act: (a) => a.closeDialogs() },
  ],
};

// --- Overlay ---------------------------------------------------------------------------
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('rv-cap')) return;
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=DM+Sans:wght@500;700&display=swap');
      #rv-cap{position:fixed;left:60px;right:60px;top:110px;z-index:99999;pointer-events:none;text-align:center;
        background:rgba(13,44,32,.92);color:#fff;border-radius:28px;padding:30px 36px;font:800 58px/1.1 Manrope,sans-serif;
        box-shadow:0 18px 50px rgba(0,0,0,.25);opacity:0;transform:translateY(-20px);transition:opacity .35s,transform .35s}
      body.rv-h #rv-cap{left:50%;right:auto;top:auto;bottom:56px;transform:translate(-50%,20px);padding:20px 40px;font-size:44px;white-space:nowrap}
      #rv-cap.on{opacity:1;transform:none}
      body.rv-h #rv-cap.on{transform:translate(-50%,0)}
      #rv-card{position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;justify-content:center;padding:110px;
        background:linear-gradient(150deg,#0d2c20,#2a7a55);color:#fff;opacity:0;transition:opacity .5s;pointer-events:none}
      body.rv-h #rv-card{padding:90px 160px}
      #rv-card.on{opacity:1;transition:none}
      #rv-card .rv-brand{display:flex;align-items:center;gap:.35em;font:700 54px Manrope,sans-serif;margin-bottom:90px;color:#fff}
      body.rv-h #rv-card .rv-brand{margin-bottom:60px;font-size:46px}
      #rv-card .rv-brand em{font-style:normal;color:#fff}
      #rv-card .rv-brand b{color:#9fe0b8}
      #rv-card .rv-mark{display:inline-block;width:1.05em;height:.72em;border:.12em solid #fff;transform:skewX(-18deg)}
      #rv-card h1{font:800 120px/1 Manrope,sans-serif;letter-spacing:-.03em;margin:0}
      body.rv-h #rv-card h1{font-size:112px}
      #rv-card h1 span{color:#9fe0b8}
      #rv-card p{font:500 46px/1.4 'DM Sans',sans-serif;color:#d4f3e1;margin-top:60px}
      body.rv-h #rv-card p{font-size:40px;margin-top:44px}
      #rv-card .credits{font-size:18px;color:#b9e3cb;margin-top:40px;line-height:1.5}
      #rv-card .url{display:inline-block;margin-top:30px;font-weight:700;color:#fff;background:rgba(255,255,255,.14);padding:18px 34px;border-radius:60px;font-size:38px}
      #rv-mark{position:fixed;left:0;right:0;bottom:70px;text-align:center;z-index:99997;font:700 34px Manrope,sans-serif;color:#123b2a;pointer-events:none}
      body.rv-h #rv-mark{left:auto;right:40px;bottom:auto;top:28px;text-align:right;font-size:30px}
      #rv-mark b{color:#28866a}
      #rv-cursor{position:fixed;left:-80px;top:-80px;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
        background:rgba(255,196,0,.6);border:4px solid #fff;box-shadow:0 0 0 3px rgba(0,0,0,.3);z-index:100000;
        pointer-events:none;transition:left .6s ease,top .6s ease,transform .15s}
      body.rv-h #rv-cursor{width:40px;height:40px;margin:-20px 0 0 -20px}
      #rv-cursor.click{transform:scale(.6)}
      #rv-key{position:fixed;left:50%;top:50%;z-index:100001;pointer-events:none;transform:translate(-50%,-50%) scale(.6);opacity:0;
        font:800 120px/1 Manrope,sans-serif;color:#0d2c20;background:#fff;border-radius:28px;padding:26px 54px;box-shadow:0 20px 60px rgba(0,0,0,.35);transition:opacity .2s,transform .2s}
      #rv-key.on{opacity:.95;transform:translate(-50%,-50%) scale(1)}
      /* Presentation layouts */
      body.rv-plan #planpane,body.rv-model #modelpane{position:fixed!important;inset:0!important;z-index:9000;border-radius:0!important;margin:0!important;border:0!important}
      body.rv-split #planpane{position:fixed!important;left:0!important;right:0!important;top:0!important;height:50vh!important;z-index:9000;border-radius:0!important;margin:0!important}
      body.rv-split #modelpane{position:fixed!important;left:0!important;right:0!important;top:50vh!important;bottom:0!important;z-index:9000;border-radius:0!important;margin:0!important}
      body.rv-h.rv-split #planpane{top:0!important;bottom:0!important;left:0!important;right:auto!important;width:50vw!important;height:auto!important}
      body.rv-h.rv-split #modelpane{top:0!important;bottom:0!important;left:50vw!important;right:0!important}
      body.rv-wide{background:linear-gradient(150deg,#0d2c20,#2a7a55)!important}
      body.rv-wide #modelpane{position:fixed!important;left:0!important;right:0!important;top:620px!important;height:608px!important;z-index:9000;border-radius:0!important;margin:0!important;border:0!important}
      body.rv-wide::before{content:'';position:fixed;inset:0;z-index:8999;background:linear-gradient(150deg,#0d2c20,#2a7a55)}
      body[class*=rv-]:not(.rv-app) #modelpane > :not(#render):not(#crosshair):not(#aiBar),body[class*=rv-]:not(.rv-app) #planpane > :not(#plan){display:none!important}
      body[class*=rv-]:not(.rv-app) #render,body[class*=rv-]:not(.rv-app) #plan{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}
      body.rv-app .rv-hl{outline:5px solid #f5b800!important;outline-offset:6px;border-radius:10px;transition:outline-color .3s}`;
    document.head.appendChild(style);
    for (const id of ['rv-cap', 'rv-card', 'rv-mark', 'rv-cursor', 'rv-key']) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    document.getElementById('rv-mark').innerHTML = 'plano<b>vivo</b>';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  window.__rv = { install };
};

function narration(dir, scenes) {
  fs.mkdirSync(dir, { recursive: true });
  scenes.forEach((s, i) => {
    s.audioFile = path.join(dir, `${i}.mp3`);
    if (!fs.existsSync(s.audioFile) || fs.readFileSync(s.audioFile + '.txt', { encoding: 'utf8', flag: 'a+' }) !== s.text) {
      execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate', '+10%', '--pitch', '+2Hz', '--text', s.text, '--write-media', s.audioFile]);
      fs.writeFileSync(s.audioFile + '.txt', s.text);
    }
    s.audio = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', s.audioFile]).toString());
  });
}

async function record(browser, name, fmt, scenes, dir) {
  const { W, H } = FORMATS[fmt];
  const H_ = fmt === 'linkedin';
  const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } }, locale: 'es-EC' });
  await context.addInitScript(OVERLAY);
  await context.addInitScript(() => {
    localStorage.setItem('pv-guia-2', 'completa');
    localStorage.setItem('pv-guia', 'completa');
    localStorage.setItem('pv-ia-ok', '1');
  });
  const page = await context.newPage();
  const t0 = Date.now();
  // Long AI waits are cut from the final video (a short glimpse of the progress stays).
  const skips = [];
  const waitAI = async (fn) => {
    const s0 = Date.now() - t0;
    await fn();
    const s1 = Date.now() - t0;
    if (s1 - s0 > 3000) skips.push([s0 + 1500, s1 - 500]);
  };
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(SITE, { waitUntil: 'networkidle' });
  if (H_) await page.evaluate(() => document.body.classList.add('rv-h'));

  const relayout = () =>
    page.evaluate(async () => {
      (await import('/ui/core.mjs')).viewer.resize();
      (await import('/ui/plan.mjs')).draw();
    });
  const cursor = (x, y, click = false) =>
    page.evaluate(([x, y, c]) => {
      const el = document.getElementById('rv-cursor');
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      if (c) { el.classList.add('click'); setTimeout(() => el.classList.remove('click'), 180); }
    }, [x, y, click]);
  const hideCursor = () => cursor(-80, -80);
  const confirmNow = () => page.evaluate(() => document.querySelector('#confirmDialog[open] button[value=ok]')?.click());
  const canvasBox = () => page.locator('#render canvas').boundingBox();
  const keyFlash = (k) => page.evaluate((k) => { const el = document.getElementById('rv-key'); el.textContent = k; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 900); }, k);
  // Walk state, kept here: the viewer starts at yaw 0 and every drag turns it by -dx * 0.006.
  const walk = { yaw: 0, pos: null, room: 0 };
  const geometry = () =>
    page.evaluate(async () => {
      const { state, W, D, T } = await import('/ui/core.mjs');
      const wk = await import('/walk.mjs');
      const m = { W: W(), D: D(), T: T(), walls: state.walls, rooms: state.rooms };
      return { W: m.W, D: m.D, rooms: m.rooms.map((r) => ({ spot: wk.roomSpot(m, r), runs: r.runs, area: r.area })), walls: state.walls.map((w) => ({ id: w.id, type: w.type, a: w.a, b: w.b })) };
    });
  const wallCount = () => page.evaluate(async () => (await import('/ui/core.mjs')).state.walls.length);

  const a = {
    async load(file) {
      await page.evaluate(async () => (await import('/ui/model.mjs')).clearProject());
      await page.setInputFiles('#file', path.isAbsolute(file) ? file : path.join(HERE, file));
      await sleep(300);
      await confirmNow();
      await sleep(1000);
    },
    async blank() {
      await page.evaluate(async () => { const m = await import('/ui/model.mjs'); m.clearProject(); m.rebuild(); });
      await sleep(300);
    },
    async mode(m, highlight) {
      // 'app' shows the real interface (LinkedIn); in the vertical video it falls back to the split view.
      const real = m === 'app' && H_ ? 'app' : m === 'app' ? 'split' : m === 'wide' && H_ ? 'model' : m;
      await page.evaluate(async ([m, hl]) => {
        (await import('/ui/model.mjs')).setView('split');
        document.body.classList.remove('rv-plan', 'rv-model', 'rv-split', 'rv-wide', 'rv-app');
        document.body.classList.add('rv-' + m);
        document.querySelectorAll('.rv-hl').forEach((e) => e.classList.remove('rv-hl'));
        if (m === 'app') {
          window.scrollTo(0, 0);
          const target = { report: '#buildReport', metrics: '.metrics', exports: '.export-buttons', pro: '#proPanel', review: '#reviewList' }[hl];
          if (target) {
            const el = document.querySelector(target);
            el.closest('details')?.setAttribute('open', '');
            el.scrollIntoView({ block: 'center' });
            el.classList.add('rv-hl');
          }
        }
      }, [real, highlight || '']);
      await sleep(300);
      await relayout();
      await sleep(500);
    },
    async build(width) {
      await page.evaluate(() => document.getElementById('build').click());
      await sleep(300);
      await confirmNow();
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Plano reconocido'), null, { timeout: 30000 });
      if (width)
        await page.evaluate((w) => { const el = document.getElementById('width'); el.dispatchEvent(new Event('focus')); el.value = w; el.dispatchEvent(new Event('change')); }, width);
      await sleep(400);
    },
    async orbit(dx, dy, ms, needMode) {
      if (needMode) await a.mode(needMode);
      const b = await canvasBox();
      const x = b.x + b.width / 2, y = b.y + b.height * 0.55, steps = Math.round(ms / 40);
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) { await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps); await sleep(25); }
      await page.mouse.up();
      if (needMode) await a.mode('split');
    },
    async zoom(n) {
      const b = await canvasBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.55);
      for (let i = 0; i < Math.abs(n); i++) { await page.mouse.wheel(0, n > 0 ? 120 : -120); await sleep(150); }
    },
    async materials() {
      for (const [w, f] of [['#cba680', '#d6d8d2'], ['#adbac0', '#c4cbce'], ['#e5e7df', '#cfb792']]) {
        await page.evaluate(([w, f]) => {
          for (const [id, v] of [['material', w], ['floorMaterial', f]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change')); }
        }, [w, f]);
        await a.orbit(60, 0, 900);
      }
    },
    async draw(tool, points) {
      await page.evaluate(async (t) => (await import('/ui/plan.mjs')).setTool(t), tool);
      const b = await page.locator('#plan').boundingBox();
      for (const [fx, fy] of points) {
        const x = b.x + b.width * fx, y = b.y + b.height * fy;
        await cursor(x, y);
        await sleep(600);
        await cursor(x, y, true);
        await page.mouse.click(x, y);
        await sleep(420);
      }
      await hideCursor();
    },
    async demoHouse() {
      await page.evaluate(async () => (await import('/ui/model.mjs')).demo());
      await sleep(400);
    },
    /** A step of the professional panel; in LinkedIn it shows the real panel, highlighted. */
    async pro(fn, highlight) {
      if (highlight && H_) await a.mode('app', highlight);
      await page.evaluate(fn);
      await sleep(900);
      if (highlight && H_) {
        await sleep(1400);
        await a.mode('plan');
      }
    },
    async nameRooms(names) {
      await page.evaluate(async () => (await import('/ui/plan.mjs')).setTool('room'));
      const pts = await page.evaluate(async () => {
        const core = await import('/ui/core.mjs');
        const r = document.getElementById('plan').getBoundingClientRect();
        const ratio = core.D() / core.W(), base = Math.max(1, Math.min(r.width - 64, (r.height - 100) / ratio));
        const fit = { x: (r.width - base) / 2, y: 50 + (r.height - 100 - base * ratio) / 2, w: base, h: base * ratio };
        const P = (x, y) => ({ x: r.left + fit.x + x * fit.w, y: r.top + fit.y + y * fit.h });
        return core.state.rooms.map((room) => P(room.center.x, room.center.y));
      });
      for (let i = 0; i < Math.min(names.length, pts.length); i++) {
        const { x, y } = pts[i];
        await cursor(x, y);
        await sleep(500);
        await cursor(x, y, true);
        await page.mouse.click(x, y);
        await sleep(350);
        await page.selectOption('#roomType', names[i]);
        await sleep(450);
        await page.click('#roomDialog button[value=ok]');
        await sleep(400);
      }
      await hideCursor();
    },
    async typedWall(text) {
      await page.evaluate(async () => (await import('/ui/plan.mjs')).setTool('wall'));
      const pts = await page.evaluate(async () => {
        const core = await import('/ui/core.mjs');
        const r = document.getElementById('plan').getBoundingClientRect();
        const ratio = core.D() / core.W(), base = Math.max(1, Math.min(r.width - 64, (r.height - 100) / ratio));
        const fit = { x: (r.width - base) / 2, y: 50 + (r.height - 100 - base * ratio) / 2, w: base, h: base * ratio };
        const P = (x, y) => ({ x: r.left + fit.x + x * fit.w, y: r.top + fit.y + y * fit.h });
        return [P(0.48, 0.88), P(0.48, 0.99)];
      });
      await cursor(pts[0].x, pts[0].y);
      await sleep(500);
      await cursor(pts[0].x, pts[0].y, true);
      await page.mouse.click(pts[0].x, pts[0].y);
      await page.mouse.move(pts[1].x, pts[1].y);
      await sleep(400);
      await page.evaluate((t) => { const el = document.getElementById('rv-key'); el.style.fontSize = '90px'; el.textContent = t + ' m ↵'; el.classList.add('on'); }, text);
      for (const k of text) {
        await page.keyboard.press(k);
        await sleep(180);
      }
      await sleep(500);
      await page.keyboard.press('Enter');
      await sleep(700);
      await page.evaluate(() => { const el = document.getElementById('rv-key'); el.classList.remove('on'); el.style.fontSize = ''; });
      await page.keyboard.press('Escape');
      await hideCursor();
    },
    async reviewPro() {
      await page.evaluate(() => { document.getElementById('proPanel').open = true; document.getElementById('proReview').click(); });
      if (H_) await a.mode('app', 'review');
      else await a.mode('plan');
      await sleep(900);
      await page.evaluate(() => document.querySelector('#reviewList button')?.click());
      if (H_) await a.mode('app', 'review');
      await sleep(600);
    },
    async dialogPro(id) {
      await a.closeDialogs();
      await page.evaluate((id) => document.getElementById(id).click(), id);
      await sleep(400);
      await page.evaluate(() => { const b = document.getElementById('proBody'); b.scrollTop = 0; setTimeout(() => b.scrollTo({ top: b.scrollHeight / 3, behavior: 'smooth' }), 1500); });
    },
    async closeDialogs() {
      await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    },
    async furnish(style) {
      // «Amueblar todo» switches the app to its 3D view: show the 3D layout first.
      await a.mode('model');
      await page.evaluate(() => {
        document.getElementById('interiorPanel').open = true;
        document.getElementById('furnishAll').click();
      });
      await a.mode('model');
      await sleep(500);
      if (style) await a.style(style);
    },
    async style(key) {
      await page.evaluate(async (k) => (await import('/ui/interior.mjs')).setStyle(k, { quiet: true }), key);
      await sleep(700);
    },
    async typeInto(selector, text, ms = 38) {
      await page.fill(selector, '');
      for (const ch of text) {
        await page.type(selector, ch);
        await sleep(ms);
      }
    },
    /** Load a real plan, build it, furnish it in a style and turn around it. */
    async realPlan(file, width, style, zoom = 0) {
      await a.load(file);
      await a.mode('split');
      await a.build(width);
      await sleep(600);
      await a.mode('model');
      if (zoom) await a.zoom(zoom);
      // A building plan (style null) is shown as built: its small spaces are not furnished.
      if (style) await a.furnish(style);
      await sleep(300);
      await a.orbit(-220, 15, 2200);
    },
    async describe(text) {
      await a.mode('model');
      await page.evaluate(() => {
        document.getElementById('interiorPanel').open = true;
        document.getElementById('aiDescribe').click();
      });
      await sleep(300);
      await a.typeInto('#aiDescribeText', text, 28);
      await sleep(300);
      await page.click('#aiDescribeDialog button[value=ok]');
      await page.waitForFunction(() => document.getElementById('aiProgress').open, null, { timeout: 15000 }).catch(() => {});
      await waitAI(() => page.waitForFunction(() => !document.getElementById('aiProgress').open, null, { timeout: 90000 }));
      await sleep(400);
      await relayout();
      await a.orbit(-200, 15, 2000);
    },
    async askBar(text, roomName) {
      await a.mode('model');
      await sleep(300);
      await page.evaluate((name) => {
        const sel = document.getElementById('aiRoom');
        const opt = [...sel.options].find((o) => o.text.includes(name));
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change'));
        }
      }, roomName || '');
      await a.typeInto('#aiText', text, 34);
      await sleep(250);
      await page.click('#aiSend');
      await waitAI(() => page.waitForFunction(() => !document.getElementById('aiBar').classList.contains('busy'), null, { timeout: 60000 }));
      await sleep(400);
      await a.orbit(-140, 0, 1500);
    },
    async realPhoto() {
      await a.mode('model');
      await a.zoom(-3);
      await sleep(500);
      await page.evaluate(() => document.getElementById('aiRender').click());
      await waitAI(() => page.waitForFunction(() => document.getElementById('renderAfter').getAttribute('src'), null, { timeout: 90000 }));
      await sleep(600);
      for (const v of [50, 15, 85, 50]) {
        await page.evaluate((v) => {
          const r = document.getElementById('renderSlider');
          r.value = v;
          r.dispatchEvent(new Event('input'));
        }, v);
        await sleep(650);
      }
      await page.click('#renderClose');
      await a.zoom(3);
    },
    async fromPhotos(file) {
      await a.blank();
      await a.mode('model');
      await page.setInputFiles('#aiFiles', path.join(HERE, file));
      await page.waitForFunction(() => document.getElementById('aiProgress').open, null, { timeout: 15000 }).catch(() => {});
      await waitAI(() => page.waitForFunction(() => !document.getElementById('aiProgress').open, null, { timeout: 120000 }).catch(() => {}));
      await sleep(400);
      await a.orbit(-180, 15, 1800);
    },
    async pickFurniture() {
      await a.mode('model');
      const b = await canvasBox();
      for (let fy = 0.35; fy < 0.75; fy += 0.05)
        for (let fx = 0.3; fx < 0.7; fx += 0.05) {
          const x = b.x + b.width * fx,
            y = b.y + b.height * fy;
          const id = await page.evaluate(([x, y]) => {
            const cv = document.querySelector('#render canvas');
            cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
            cv.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
            cv.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
            return import('/ui/core.mjs').then((c) => c.state.selectedItem);
          }, [x, y]);
          if (id) {
            await cursor(x, y);
            await sleep(500);
            await cursor(x, y, true);
            await sleep(400);
            for (const c of ['#c8742c', '#3f6c9a', '#4f6b55']) {
              await page.evaluate(async (c) => {
                const el = document.getElementById('itemColor');
                el.value = c;
                el.dispatchEvent(new Event('change'));
              }, c);
              await sleep(700);
            }
            await page.keyboard.press('r');
            await sleep(600);
            await hideCursor();
            return;
          }
        }
    },
    // --- walk -------------------------------------------------------------------------
    async turnTo(yaw, ms = 900) {
      let d = yaw - walk.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const px = -d / 0.006, b = await canvasBox(), x0 = b.x + b.width / 2 - px / 2, y = b.y + b.height / 2, steps = Math.max(8, Math.round(ms / 30));
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (px * i) / steps, y); await sleep(22); }
      await page.mouse.up();
      walk.yaw += d;
    },
    async walkStart() {
      await a.mode('wide');
      await page.evaluate(() => document.getElementById('walk').click());
      walk.yaw = 0;
      walk.geo = await geometry();
      // The biggest room with a wall to put a window on and an interior wall to open a door through.
      const order = walk.geo.rooms.map((r, i) => i).sort((p, q) => walk.geo.rooms[q].area - walk.geo.rooms[p].area);
      walk.plan = null;
      for (const i of order) { const p = planRoom(walk.geo, i); if (p) { walk.plan = p; walk.room = i; break; } }
      if (!walk.plan) throw Error('no room with targets');
      await page.evaluate(async (i) => (await import('/ui/core.mjs')).viewer.goTo(i), walk.room);
      walk.pos = walk.plan.spot;
      await relayout();
      await sleep(600);
    },
    async lookAround() {
      await a.turnTo(walk.yaw + 0.9, 1300);
      await a.turnTo(walk.yaw - 0.9, 1300);
    },
    async addAhead(type) {
      const targets = type === 'window' ? walk.plan.windows : walk.plan.doors;
      for (const t of targets) {
        await a.turnTo(t.yaw, 1000);
        await sleep(250);
        const before = await wallCount();
        await keyFlash(type === 'door' ? 'P' : 'V');
        await page.keyboard.press(type === 'door' ? 'p' : 'v');
        await sleep(500);
        if ((await wallCount()) > before) { walk.used = t; return; }
      }
      console.log('  aviso: no se pudo añadir', type);
    },
    async walkThrough() {
      const t = walk.used;
      if (!t) return;
      await a.turnTo(t.yaw, 400);
      await page.keyboard.down('w');
      await sleep(((t.dist + 1.1) / 2.2) * 1000);
      await page.keyboard.up('w');
      await a.turnTo(walk.yaw + 0.6, 900);
    },
    async jumpRoom() {
      const others = walk.geo.rooms.map((r, i) => i).filter((i) => i !== walk.room);
      const i = others[0];
      await page.evaluate(async (i) => (await import('/ui/core.mjs')).viewer.goTo(i), i);
      await sleep(300);
      const v = openView(walk.geo, i);
      if (v !== null) { await a.turnTo(v - 0.7, 500); await a.turnTo(v + 0.35, 1800); }
      else await a.turnTo(walk.yaw + 1.4, 1600);
    },
    async exitWalk() {
      await page.evaluate(async () => (await import('/ui/core.mjs')).viewer.reset());
      await sleep(200);
    },
    async clickOpening(type) {
      await a.exitWalk();
      await a.mode('model');
      await sleep(1200);
      await relayout();
      await sleep(600);
      // Find, without side effects, a point of the canvas where a click lands on a long wall.
      const b = await canvasBox();
      const pts = [];
      for (let fy = 0.35; fy <= 0.75; fy += 0.04) for (let fx = 0.25; fx <= 0.75; fx += 0.04) pts.push([b.x + b.width * fx, b.y + b.height * fy]);
      const hit = await page.evaluate(async ([type, pts]) => {
        const core = await import('/ui/core.mjs'), plan = await import('/ui/plan.mjs');
        let ok = null;
        core.viewer.setOnPlace((t, id) => { const w = core.state.walls.find((w) => w.id === id); if (w && w.type === 'wall' && Math.hypot((w.b.x - w.a.x) * core.W(), (w.b.y - w.a.y) * core.D()) > 2.2) ok = true; return false; });
        core.viewer.setPlacing(type);
        const cv = document.querySelector('#render canvas');
        let found = null;
        for (const [x, y] of pts) {
          ok = null;
          cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
          cv.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
          cv.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
          if (ok) { found = [x, y]; break; }
        }
        // the app's own handler (same as app.mjs)
        core.viewer.setOnPlace((t, id, p) => plan.insertOpening(p, t, core.state.walls.find((w) => w.id === id)));
        return found;
      }, [type, pts]);
      if (!hit) { console.log('  aviso: sin punto para el clic 3D'); return; }
      await cursor(hit[0], hit[1]);
      await sleep(700);
      await cursor(hit[0], hit[1], true);
      const before = await wallCount();
      await page.mouse.click(hit[0], hit[1]);
      await sleep(500);
      if ((await wallCount()) <= before) console.log('  aviso: el clic 3D no añadió la abertura');
      await page.evaluate(async () => (await import('/ui/core.mjs')).viewer.setPlacing(null));
      await hideCursor();
      await a.orbit(-120, 0, 1500);
    },
  };

  const timeline = [];
  for (const s of scenes) {
    const start = Date.now() - t0;
    timeline.push(start);
    await page.evaluate(([c, cap]) => {
      window.__rv.install();
      const cardEl = document.getElementById('rv-card'), capEl = document.getElementById('rv-cap');
      if (c) { cardEl.innerHTML = c; const cur = document.getElementById('rv-cursor'); cur.style.left = cur.style.top = '-80px'; }
      cardEl.classList.toggle('on', !!c);
      capEl.textContent = cap || '';
      capEl.classList.toggle('on', !!cap);
    }, [s.card || '', s.caption || '']);
    try {
      if (s.act) await s.act(a);
    } catch (e) {
      console.log('SCENE FAILED', name, fmt, s.text.slice(0, 30), e.message.split('\n')[0]);
    }
    const need = s.audio * 1000 + 450 - (Date.now() - t0 - start);
    if (need > 0) await sleep(need);
  }
  await sleep(900);
  const video = page.video();
  await context.close();
  return { raw: await video.path(), timeline, skips };
}

/** Direction (yaw) with the longest free view from a room's spot, or null. */
function openView(geo, i) {
  const { W, D } = geo, room = geo.rooms[i];
  if (!room.spot) return null;
  const P = (p) => ({ x: (p.x - 0.5) * W, z: (p.y - 0.5) * D });
  const S = P(room.spot), segs = geo.walls.filter((w) => w.type !== 'door').map((w) => [P(w.a), P(w.b)]);
  let best = null, far = 0;
  for (let k = 0; k < 72; k++) {
    const yaw = (k / 72) * 2 * Math.PI, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    let t = 15;
    for (const [A, B] of segs) {
      const ex = B.x - A.x, ez = B.z - A.z, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const u = ((A.x - S.x) * ez - (A.z - S.z) * ex) / den, v = ((A.x - S.x) * dz - (A.z - S.z) * dx) / den;
      if (u > 0 && v >= 0 && v <= 1) t = Math.min(t, u);
    }
    if (t > far) { far = t; best = yaw; }
  }
  return best;
}

// Targets for the walk from a room's free spot: walls to look at (window) and interior walls to open (door).
function planRoom(geo, i) {
  const { W, D } = geo, room = geo.rooms[i];
  if (!room.spot) return null;
  const P = (p) => ({ x: (p.x - 0.5) * W, z: (p.y - 0.5) * D });
  const S = P(room.spot);
  const inRoom = (q, r) => r.runs.some((u) => q.x >= u.x && q.x <= u.x + u.w && q.y >= u.y && q.y <= u.y + u.h);
  const segs = geo.walls.map((w) => ({ ...w, A: P(w.a), B: P(w.b) }));
  const cross = (p, q, A, B) => {
    const d = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    return d(p, q, A) * d(p, q, B) < 0 && d(A, B, p) * d(A, B, q) < 0;
  };
  const windows = [], doors = [];
  for (const w of segs) {
    if (w.type !== 'wall') continue;
    const dx = w.B.x - w.A.x, dz = w.B.z - w.A.z, L = Math.hypot(dx, dz);
    if (L < 1.7) continue;
    let t = ((S.x - w.A.x) * dx + (S.z - w.A.z) * dz) / (L * L);
    t = Math.max(0.9 / L, Math.min(1 - 0.9 / L, t));
    const M = { x: w.A.x + dx * t, z: w.A.z + dz * t }, dist = Math.hypot(M.x - S.x, M.z - S.z);
    if (dist < 1.2 || dist > 6.5) continue;
    const near = { x: S.x + (M.x - S.x) * 0.97, z: S.z + (M.z - S.z) * 0.97 };
    if (segs.some((o) => o !== w && o.type !== 'door' && cross(S, near, o.A, o.B))) continue;
    const yaw = Math.atan2(-(M.x - S.x), -(M.z - S.z));
    const ux = (M.x - S.x) / dist, uz = (M.z - S.z) / dist;
    const beyond = { x: (M.x + ux * 0.8) / W + 0.5, y: (M.z + uz * 0.8) / D + 0.5 };
    const other = geo.rooms.findIndex((r, j) => j !== i && inRoom(beyond, r));
    const target = { yaw, dist, wall: w.id };
    if (other >= 0) doors.push(target);
    else windows.push(target);
  }
  if (!doors.length || !windows.length) return null;
  doors.sort((p, q) => p.dist - q.dist);
  windows.sort((p, q) => p.dist - q.dist);
  return { spot: S, doors, windows: windows.filter((w) => !doors.some((d) => Math.abs(d.yaw - w.yaw) < 0.5)).concat(windows) };
}

function mix(name, fmt, scenes, { raw, timeline: tl, skips = [] }, dir) {
  const t0 = tl[0];
  // Time after the cuts: every moment moves back by the skipped time before it.
  const cut = (t) => t - skips.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(t, b) - a), 0);
  const timeline = tl.map((t) => t0 + cut(t) - cut(t0));
  const total = (timeline.at(-1) - t0) / 1000 + scenes.at(-1).audio + 1.4;
  const musicFile = path.join(dir, 'musica.wav');
  execFileSync('python', [MUSIC, total.toFixed(2), musicFile]);
  const inputs = ['-ss', (t0 / 1000).toFixed(3), '-i', raw], filters = [], labels = [];
  scenes.forEach((s, i) => {
    inputs.push('-i', s.audioFile);
    const d = timeline[i] - t0 + 250;
    filters.push(`[${i + 1}:a]adelay=${d}|${d}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  const m = scenes.length + 1;
  const keep = [];
  let from = 0;
  for (const [a, b] of skips) {
    keep.push([from, (a - t0) / 1000]);
    from = (b - t0) / 1000;
  }
  keep.push([from, 1e5]);
  keep.forEach(([a, b], i) => filters.push(`[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`));
  filters.push(`${keep.map((_, i) => `[v${i}]`).join('')}concat=n=${keep.length}:v=1:a=0[vout]`);
  inputs.push('-i', musicFile);
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,asplit=2[voz][guia]`);
  filters.push(`[${m}:a]volume=0.20[mus]`);
  filters.push('[mus][guia]sidechaincompress=threshold=0.015:ratio=5:attack=25:release=450[fondo]');
  filters.push('[voz][fondo]amix=inputs=2:normalize=0,volume=3.5dB,alimiter=limit=0.8,apad[aout]');
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `plano-vivo-${name}-${fmt}`);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-t', total.toFixed(2), '-movflags', '+faststart', file + '.mp4',
  ]);
  const ts = (ms) => {
    const h = Math.floor(ms / 3600000), mm = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
  };
  fs.writeFileSync(file + '.srt', scenes.map((s, i) => `${i + 1}\n${ts(timeline[i] - t0 + 250)} --> ${ts(timeline[i] - t0 + 250 + s.audio * 1000)}\n${s.text}\n`).join('\n'));
  return total;
}

(async () => {
  const only = process.argv[2] || '', onlyFmt = process.argv[3] || '';
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const [name, scenes] of Object.entries(VIDEOS)) {
    if (!name.includes(only)) continue;
    narration(path.join(WORK, name, 'voz'), scenes);
    for (const fmt of Object.keys(FORMATS)) {
      if (onlyFmt && fmt !== onlyFmt) continue;
      const dir = path.join(WORK, name, fmt);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const rec = await record(browser, name, fmt, scenes, dir);
      const total = mix(name, fmt, scenes, rec, dir);
      console.log('ok', name, fmt, total.toFixed(1) + ' s');
    }
  }
  await browser.close();
})();
