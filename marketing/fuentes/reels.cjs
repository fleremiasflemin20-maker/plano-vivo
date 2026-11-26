// Vertical reels (1080 × 1920) for Instagram, TikTok and YouTube Shorts: narration
// (edge-tts), automatic recording of the live site (Playwright + Edge) and mix (ffmpeg).
//   NODE_PATH=<carpeta con playwright>/node_modules node reels.cjs [reel-01|reel-02|reel-03]
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'https://plano-vivo.fleremiasflemin.workers.dev/';
const URL_TXT = 'plano-vivo.fleremiasflemin.workers.dev';
const HERE = __dirname;
const OUT = path.join(HERE, '..', 'reels');
const WORK = path.join(HERE, 'reels-tmp');
const VOICE = 'es-EC-AndreaNeural';
const W = 1080,
  H = 1920;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const card = (title, sub = '') =>
  `<div class="rv-brand"><i class="rv-mark"></i><em>plano<b>vivo</b></em></div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}`;
const END = card(
  'Pruébalo gratis',
  `En tu navegador · Sin instalar<br><span class="url">${URL_TXT}</span>`,
);

// --- Scripts ------------------------------------------------------------------------
const REELS = {
  'reel-01-de-plano-a-3d': [
    { card: card('¿Tienes el plano<br>de tu casa?'), text: '¿Tienes el plano de tu casa? Míralo en 3D en segundos.', act: (a) => a.load('demo.png') },
    { caption: '1 · Sube la foto o el PDF', text: 'Súbelo a Plano Vivo: una foto, una captura o un PDF.', act: (a) => a.mode('plan') },
    { caption: '2 · Construir en 3D', text: 'Pulsa Construir en 3D: reconoce muros, puertas, ventanas, escaleras y muebles.', act: async (a) => { await a.build(); await a.mode('model'); await a.orbit(-260, 25, 3200); } },
    { caption: 'Con medidas reales', text: 'Y toma la escala del propio plano, con medidas reales.', act: async (a) => { await a.zoom(-4); await a.orbit(220, -10, 3000); } },
    { card: END, text: 'Pruébalo gratis en tu navegador. El enlace está en el perfil.' },
  ],
  'reel-02-recorre-tu-casa': [
    { card: card('Recorre tu casa<br><span>antes de construirla</span>'), text: '¿Y si pudieras caminar por tu casa antes de construirla?', act: async (a) => { await a.load('demo.png'); await a.build(); await a.mode('model'); } },
    { caption: 'Tu plano, en 3D', text: 'Plano Vivo convierte tu plano en un modelo 3D.', act: (a) => a.orbit(-300, 20, 3500) },
    { caption: 'Camina por dentro', text: 'Inicia el recorrido y camina por dentro, a la altura de los ojos.', act: (a) => a.walk() },
    { caption: 'Prueba acabados', text: 'Prueba acabados para las paredes y el piso.', act: (a) => a.materials() },
    { card: END, text: 'Gratis y sin instalar nada. El enlace está en el perfil.' },
  ],
  'reel-03-dibuja-en-3d': [
    { card: card('Dibuja tu casa<br><span>y mírala en 3D</span>'), text: 'Dibuja tu casa y mírala en 3D al instante.', act: async (a) => { await a.blank(); await a.mode('split'); } },
    { caption: 'Un recinto: dos clics', text: 'Un recinto, con dos clics.', act: (a) => a.draw('rectangle', [[0.16, 0.28], [0.84, 0.72]]) },
    { caption: 'Paredes, puertas y ventanas', text: 'Agrega paredes, puertas y ventanas. El 3D se actualiza mientras dibujas.', act: async (a) => { await a.draw('wall', [[0.5, 0.28], [0.5, 0.72]]); await a.draw('door', [[0.5, 0.6]]); await a.draw('window', [[0.33, 0.28]]); await a.draw('window', [[0.67, 0.72]]); } },
    { caption: 'Mide y calcula áreas', text: 'Mide distancias y obtén el área de cada habitación.', act: (a) => a.draw('measure', [[0.16, 0.72], [0.84, 0.72]]) },
    { card: END, text: 'Pruébalo gratis. El enlace está en el perfil.' },
  ],
};

// --- Overlay (big captions for vertical video) ---------------------------------------
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('rv-cap')) return;
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=DM+Sans:wght@500;700&display=swap');
      #rv-cap{position:fixed;left:60px;right:60px;top:110px;z-index:99999;pointer-events:none;text-align:center;
        background:rgba(13,44,32,.92);color:#fff;border-radius:28px;padding:30px 36px;font:800 58px/1.1 Manrope,sans-serif;
        box-shadow:0 18px 50px rgba(0,0,0,.25);opacity:0;transform:translateY(-20px);transition:opacity .35s,transform .35s}
      #rv-cap.on{opacity:1;transform:none}
      #rv-card{position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;justify-content:center;padding:110px;
        background:linear-gradient(150deg,#0d2c20,#2a7a55);color:#fff;opacity:0;transition:opacity .5s;pointer-events:none}
      #rv-card.on{opacity:1;transition:none}
      #rv-card .rv-brand{display:flex;align-items:center;gap:.35em;font:700 54px Manrope,sans-serif;margin-bottom:90px;color:#fff}
      #rv-card .rv-brand em{font-style:normal;color:#fff}
      #rv-card .rv-brand b{color:#9fe0b8}
      #rv-card .rv-mark{display:inline-block;width:1.05em;height:.72em;border:.12em solid #fff;transform:skewX(-18deg)}
      #rv-card h1{font:800 120px/1 Manrope,sans-serif;letter-spacing:-.03em}
      #rv-card h1 span{color:#9fe0b8}
      #rv-card p{font:500 46px/1.4 'DM Sans',sans-serif;color:#d4f3e1;margin-top:60px}
      #rv-card .url{display:inline-block;margin-top:30px;font-weight:700;color:#fff;background:rgba(255,255,255,.14);padding:18px 34px;border-radius:60px;font-size:38px}
      #rv-mark{position:fixed;left:0;right:0;bottom:70px;text-align:center;z-index:99997;font:700 34px Manrope,sans-serif;color:#123b2a;pointer-events:none}
      #rv-mark b{color:#28866a}
      #rv-cursor{position:fixed;left:-80px;top:-80px;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
        background:rgba(255,196,0,.6);border:4px solid #fff;box-shadow:0 0 0 3px rgba(0,0,0,.3);z-index:100000;
        pointer-events:none;transition:left .6s ease,top .6s ease,transform .15s}
      #rv-cursor.click{transform:scale(.6)}
      /* Presentation layouts */
      body.rv-plan #planpane,body.rv-model #modelpane{position:fixed!important;inset:0!important;z-index:9000;border-radius:0!important;margin:0!important;border:0!important}
      body.rv-split #planpane{position:fixed!important;left:0!important;right:0!important;top:0!important;height:50vh!important;z-index:9000;border-radius:0!important;margin:0!important}
      body.rv-split #modelpane{position:fixed!important;left:0!important;right:0!important;top:50vh!important;bottom:0!important;z-index:9000;border-radius:0!important;margin:0!important}
      body.rv-wide{background:linear-gradient(150deg,#0d2c20,#2a7a55)!important}
      body.rv-wide #modelpane{position:fixed!important;left:0!important;right:0!important;top:620px!important;height:608px!important;z-index:9000;border-radius:0!important;margin:0!important;border:0!important}
      body.rv-wide::before{content:'';position:fixed;inset:0;z-index:8999;background:linear-gradient(150deg,#0d2c20,#2a7a55)}
      body[class*=rv-] #modelpane > :not(#render),body[class*=rv-] #planpane > :not(#plan){display:none!important}
      body[class*=rv-] #render,body[class*=rv-] #plan{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}`;
    document.head.appendChild(style);
    for (const id of ['rv-cap', 'rv-card', 'rv-mark', 'rv-cursor']) {
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

function narration(name, scenes) {
  const dir = path.join(WORK, name);
  fs.mkdirSync(dir, { recursive: true });
  scenes.forEach((s, i) => {
    s.audioFile = path.join(dir, `${i}.mp3`);
    execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate', '+8%', '--text', s.text, '--write-media', s.audioFile]);
    s.audio = Number(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', s.audioFile]).toString(),
    );
  });
}

async function record(browser, name, scenes) {
  const dir = path.join(WORK, name);
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
    locale: 'es-EC',
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const t0 = Date.now();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(SITE, { waitUntil: 'networkidle' });

  const relayout = () =>
    page.evaluate(async () => {
      (await import('/ui/core.mjs')).viewer.resize();
      (await import('/ui/plan.mjs')).draw();
    });
  const cursor = (x, y, click = false) =>
    page.evaluate(
      ([x, y, c]) => {
        const el = document.getElementById('rv-cursor');
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        if (c) {
          el.classList.add('click');
          setTimeout(() => el.classList.remove('click'), 180);
        }
      },
      [x, y, click],
    );
  // Accept the app's confirmation dialog at once (it would cover the video).
  const confirmNow = () =>
    page.evaluate(() => document.querySelector('#confirmDialog[open] button[value=ok]')?.click());
  const a = {
    async load(file) {
      await page.evaluate(async () => (await import('/ui/model.mjs')).clearProject());
      await page.setInputFiles('#file', path.join(HERE, file));
      await sleep(300);
      await confirmNow();
      await sleep(1000);
    },
    async blank() {
      await page.evaluate(async () => {
        const m = await import('/ui/model.mjs');
        m.clearProject();
        m.rebuild();
      });
      await sleep(300);
    },
    async mode(m) {
      await page.evaluate(async (m) => {
        (await import('/ui/model.mjs')).setView('split');
        document.body.classList.remove('rv-plan', 'rv-model', 'rv-split', 'rv-wide');
        document.body.classList.add('rv-' + m);
      }, m);
      await sleep(300);
      await relayout();
      await sleep(500);
    },
    async build() {
      await page.evaluate(() => document.getElementById('build').click());
      await sleep(300);
      await confirmNow();
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Plano reconocido'), null, { timeout: 30000 });
      await sleep(400);
    },
    async orbit(dx, dy, ms) {
      const x = W / 2,
        y = H * 0.6,
        steps = Math.round(ms / 40);
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
        await sleep(25);
      }
      await page.mouse.up();
    },
    async zoom(n) {
      await page.mouse.move(W / 2, H * 0.55);
      for (let i = 0; i < Math.abs(n); i++) {
        await page.mouse.wheel(0, n > 0 ? 120 : -120);
        await sleep(150);
      }
    },
    async walk() {
      // Walking needs a landscape field of view: a 16:9 window in the vertical frame.
      await a.mode('wide');
      await page.evaluate(() => document.getElementById('walk').click());
      await relayout();
      await sleep(700);
      const y = 620 + 304;
      await page.mouse.move(W / 2, y);
      await page.mouse.down();
      for (let i = 1; i <= 60; i++) {
        await page.mouse.move(W / 2 - i * 3, y);
        await sleep(40);
      }
      await page.mouse.up();
      await page.keyboard.down('w');
      await sleep(800);
      await page.keyboard.up('w');
    },
    async materials() {
      await page.evaluate(() => document.getElementById('exitwalk').click());
      await a.mode('model');
      await a.zoom(-2);
      for (const [w, f] of [
        ['#cba680', '#d6d8d2'],
        ['#adbac0', '#c4cbce'],
        ['#e5e7df', '#cfb792'],
      ]) {
        await page.evaluate(
          ([w, f]) => {
            for (const [id, v] of [
              ['material', w],
              ['floorMaterial', f],
            ]) {
              const el = document.getElementById(id);
              el.value = v;
              el.dispatchEvent(new Event('change'));
            }
          },
          [w, f],
        );
        await a.orbit(70, 0, 1100);
      }
    },
    async draw(tool, points) {
      await page.evaluate(async (t) => (await import('/ui/plan.mjs')).setTool(t), tool);
      const b = await page.locator('#plan').boundingBox();
      for (const [fx, fy] of points) {
        const x = b.x + b.width * fx,
          y = b.y + b.height * fy;
        await cursor(x, y);
        await sleep(650);
        await cursor(x, y, true);
        await page.mouse.click(x, y);
        await sleep(450);
      }
    },
  };

  const timeline = [];
  for (const s of scenes) {
    const start = Date.now() - t0;
    timeline.push(start);
    await page.evaluate(
      ([c, cap]) => {
        window.__rv.install();
        const cardEl = document.getElementById('rv-card'),
          capEl = document.getElementById('rv-cap');
        if (c) {
          cardEl.innerHTML = c;
          const cur = document.getElementById('rv-cursor');
          cur.style.left = cur.style.top = '-80px';
        }
        cardEl.classList.toggle('on', !!c);
        capEl.textContent = cap || '';
        capEl.classList.toggle('on', !!cap);
      },
      [s.card || '', s.caption || ''],
    );
    try {
      if (s.act) await s.act(a);
    } catch (e) {
      console.log('SCENE FAILED', name, s.text.slice(0, 30), e.message.split('\n')[0]);
    }
    const need = s.audio * 1000 + 450 - (Date.now() - t0 - start);
    if (need > 0) await sleep(need);
  }
  await sleep(600);
  const video = page.video();
  await context.close();
  return { raw: await video.path(), timeline };
}

function mix(name, scenes, { raw, timeline }) {
  const t0 = timeline[0],
    inputs = ['-ss', (t0 / 1000).toFixed(3), '-i', raw],
    filters = [],
    labels = [];
  scenes.forEach((s, i) => {
    inputs.push('-i', s.audioFile);
    const d = timeline[i] - t0 + 250;
    filters.push(`[${i + 1}:a]adelay=${d}|${d}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad[aout]`);
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', path.join(OUT, name + '.mp4'),
  ]);
  // Subtitles, for platforms that accept them.
  const ts = (ms) => {
    const h = Math.floor(ms / 3600000),
      m = Math.floor(ms / 60000) % 60,
      s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
  };
  fs.writeFileSync(
    path.join(OUT, name + '.srt'),
    scenes
      .map((s, i) => `${i + 1}\n${ts(timeline[i] - t0 + 250)} --> ${ts(timeline[i] - t0 + 250 + s.audio * 1000)}\n${s.text}\n`)
      .join('\n'),
  );
}

(async () => {
  const only = process.argv[2] || '';
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const [name, scenes] of Object.entries(REELS)) {
    if (!name.includes(only)) continue;
    narration(name, scenes);
    const rec = await record(browser, name, scenes);
    mix(name, scenes, rec);
    console.log('ok', name, ((rec.timeline.at(-1) + scenes.at(-1).audio * 1000) / 1000).toFixed(1) + ' s');
  }
  await browser.close();
})();
