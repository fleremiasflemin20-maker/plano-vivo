// "Ejemplos" video (1920 × 1080, music, no voice): real free-licensed plans, each
// shown next to the 3D model Plano Vivo builds from it.
//   NODE_PATH=<carpeta con playwright>/node_modules node ejemplos.cjs
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'http://127.0.0.1:8767/';
const URL_TXT = 'plano-vivo.fleremiasflemin.workers.dev';
const HERE = __dirname;
const PLANS = path.join(HERE, '..', 'ejemplos', 'planos');
const OUT = path.join(HERE, '..', 'ejemplos');
const MUSIC = path.join(HERE, '..', '..', 'tools', 'video', 'musica.py');
const W = 1920,
  H = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXAMPLES = [
  {
    file: '01-casa-clasica.png',
    title: 'Casa unifamiliar',
    credit: 'Plano de dominio público (Internet Archive, vía Wikimedia Commons)',
    width: 14,
    zoom: 2,
  },
  {
    file: '02-departamento-8-61.jpg',
    title: 'Departamento con mirador',
    credit: 'Beverley Hills Apartments 8/61 · Josh.Michael.Wilson · CC BY-SA 3.0 (Wikimedia Commons)',
    zoom: 2,
  },
  {
    file: '03-hampton-court-vancouver.png',
    title: 'Edificio de departamentos',
    credit: 'Hampton Court, Vancouver, 1912 · Grant, Henderson y Cook · dominio público (Wikimedia Commons)',
    zoom: -2,
  },
];

const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('ej-plan')) return;
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=DM+Sans:wght@400;500;700&display=swap');
      body.ej #modelpane{position:fixed!important;left:760px!important;top:0!important;right:0!important;bottom:0!important;z-index:9000;border-radius:0!important;margin:0!important;border:0!important}
      body.ej #modelpane > :not(#render){display:none!important}
      body.ej #render{position:absolute!important;inset:0!important}
      #ej-plan{position:fixed;left:0;top:0;bottom:0;width:760px;z-index:9001;background:#f6f8f7;display:none;flex-direction:column;padding:56px 50px 40px;font-family:'DM Sans',sans-serif;color:#193f35;border-right:1px solid #d8e1dd}
      body.ej #ej-plan{display:flex}
      #ej-plan .tag{font:800 15px Manrope,sans-serif;letter-spacing:.14em;color:#28866a}
      #ej-plan h2{font:800 46px/1.05 Manrope,sans-serif;letter-spacing:-.02em;margin:10px 0 26px}
      #ej-plan .img{flex:1;background:#fff center/contain no-repeat;border:1px solid #d8e1dd;border-radius:16px;box-shadow:0 14px 40px rgba(13,44,32,.1)}
      #ej-plan .credit{font-size:15px;color:#5f7a6e;margin-top:16px;line-height:1.4}
      #ej-3d{position:fixed;left:800px;top:44px;z-index:9002;display:none;font-family:'DM Sans',sans-serif}
      body.ej #ej-3d{display:block}
      #ej-3d .tag{display:inline-block;background:#123b2a;color:#9fe0b8;font:800 15px Manrope,sans-serif;letter-spacing:.14em;padding:10px 18px;border-radius:30px}
      #ej-3d .stats{margin-top:12px;font:600 22px 'DM Sans',sans-serif;color:#193f35;background:rgba(255,255,255,.85);padding:10px 18px;border-radius:14px;opacity:0;transition:opacity .5s}
      #ej-3d .stats.on{opacity:1}
      #ej-arrow{position:fixed;left:728px;top:50%;margin-top:-32px;width:64px;height:64px;border-radius:50%;background:#28866a;color:#fff;z-index:9003;display:none;place-items:center;font:800 34px Manrope;box-shadow:0 8px 24px rgba(0,0,0,.2)}
      body.ej #ej-arrow{display:grid}
      #ej-mark{position:fixed;right:40px;bottom:32px;z-index:9004;font:700 24px Manrope,sans-serif;color:#123b2a;display:none}
      body.ej #ej-mark{display:block}
      #ej-mark b{color:#28866a}
      #ej-card{position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;
        background:linear-gradient(140deg,#0d2c20,#2a7a55);color:#fff;opacity:0;transition:opacity .6s;pointer-events:none;font-family:'DM Sans',sans-serif;padding:80px}
      #ej-card.on{opacity:1}
      #ej-card .ej-brand{display:flex;align-items:center;gap:.35em;font:700 40px Manrope,sans-serif;margin-bottom:46px;color:#fff}
      #ej-card .ej-brand em{font-style:normal;color:#fff}
      #ej-card .ej-brand b{color:#9fe0b8}
      #ej-card .mk{display:inline-block;width:1.05em;height:.72em;border:.12em solid #fff;transform:skewX(-18deg)}
      #ej-card h1{font:800 96px/1 Manrope,sans-serif;letter-spacing:-.03em}
      #ej-card h1 span{color:#9fe0b8}
      #ej-card p{font-size:30px;color:#d4f3e1;margin-top:26px;line-height:1.4}
      #ej-card .url{display:inline-block;margin-top:34px;background:rgba(255,255,255,.14);padding:14px 30px;border-radius:40px;font:700 30px Manrope,sans-serif;color:#fff}
      #ej-card .credits{margin-top:44px;font-size:17px;color:#b9e3cb;line-height:1.6;max-width:1400px}`;
    document.head.appendChild(style);
    const plan = document.createElement('div');
    plan.id = 'ej-plan';
    plan.innerHTML = '<div class="tag">PLANO ORIGINAL</div><h2></h2><div class="img"></div><div class="credit"></div>';
    const d3 = document.createElement('div');
    d3.id = 'ej-3d';
    d3.innerHTML = '<div class="tag">MODELO 3D · GENERADO POR PLANO VIVO</div><div class="stats"></div>';
    const arrow = document.createElement('div');
    arrow.id = 'ej-arrow';
    arrow.textContent = '→';
    const mark = document.createElement('div');
    mark.id = 'ej-mark';
    mark.innerHTML = 'plano<b>vivo</b>';
    const card = document.createElement('div');
    card.id = 'ej-card';
    document.body.append(plan, d3, arrow, mark, card);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  window.__ej = { install };
};

const brand = '<div class="ej-brand"><i class="mk"></i><em>plano<b>vivo</b></em></div>';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: path.join(HERE, 'ejemplos-tmp'), size: { width: W, height: H } },
    locale: 'es-EC',
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(SITE, { waitUntil: 'networkidle' });
  const t0 = Date.now();

  const card = (html) =>
    page.evaluate((h) => {
      window.__ej.install();
      const c = document.getElementById('ej-card');
      if (h) c.innerHTML = h;
      c.classList.toggle('on', !!h);
    }, html);
  const confirmNow = () =>
    page.evaluate(() => document.querySelector('#confirmDialog[open] button[value=ok]')?.click());
  const relayout = () =>
    page.evaluate(async () => (await import('/ui/core.mjs')).viewer.resize());
  const orbit = async (dx, dy, ms) => {
    const x = 760 + (W - 760) / 2,
      y = H * 0.55,
      steps = Math.round(ms / 40);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
      await sleep(25);
    }
    await page.mouse.up();
  };
  const zoom = async (n) => {
    await page.mouse.move(760 + (W - 760) / 2, H * 0.55);
    for (let i = 0; i < Math.abs(n); i++) {
      await page.mouse.wheel(0, n > 0 ? 120 : -120);
      await sleep(120);
    }
  };

  // Intro (the app loads behind the card).
  const start = Date.now() - t0;
  await card(
    `${brand}<h1>Planos reales,<br><span>en 3D</span></h1><p>Ejemplos de planos reconstruidos automáticamente por Plano Vivo</p>`,
  );
  await sleep(4200);

  for (const [i, ex] of EXAMPLES.entries()) {
    await card(`${brand}<h1>Ejemplo ${i + 1}</h1><p>${ex.title}</p>`);
    // Prepare behind the card: empty project, the plan, recognition.
    await page.evaluate(async () => {
      const m = await import('/ui/model.mjs');
      m.clearProject();
      m.rebuild();
      m.setView('model');
    });
    await page.setInputFiles('#file', path.join(PLANS, ex.file));
    await sleep(300);
    await confirmNow();
    await sleep(900);
    const data = 'data:image/' + (ex.file.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(path.join(PLANS, ex.file)).toString('base64');
    await page.evaluate(
      ([title, credit, img]) => {
        document.body.classList.add('ej');
        document.querySelector('#ej-plan h2').textContent = title;
        document.querySelector('#ej-plan .credit').textContent = credit;
        document.querySelector('#ej-plan .img').style.backgroundImage = `url(${img})`;
        document.querySelector('#ej-3d .stats').classList.remove('on');
      },
      [ex.title, ex.credit, data],
    );
    await relayout();
    await page.evaluate(() => document.getElementById('build').click());
    await sleep(300);
    await confirmNow();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Plano reconocido'), null, { timeout: 30000 });
    if (ex.width)
      await page.evaluate((w) => {
        const el = document.getElementById('width');
        el.value = w;
        el.dispatchEvent(new Event('change'));
      }, ex.width);
    await page.evaluate(async () => {
      (await import('/ui/model.mjs')).setView('model');
      const { state } = await import('/ui/core.mjs');
      const n = (t) => state.walls.filter((w) => w.type === t).length;
      const rooms = state.rooms.length,
        area = state.rooms.reduce((s, r) => s + r.area, 0);
      document.querySelector('#ej-3d .stats').textContent =
        `${n('wall')} muros · ${n('door')} puertas · ${n('window')} ventanas · ${rooms} recintos · ≈ ${Math.round(area)} m²`;
    });
    await relayout();
    // Frame the model for its final size (the scale may have changed above).
    await page.evaluate(async () => (await import('/ui/core.mjs')).viewer.reset());
    await zoom(ex.zoom || 0);
    await sleep(600);
    await card('');
    await sleep(700);
    await page.evaluate(() => document.querySelector('#ej-3d .stats').classList.add('on'));
    await orbit(-420, 20, 5200);
    await orbit(-260, -30, 3400);
    await sleep(500);
  }

  await page.evaluate(() => document.body.classList.remove('ej'));
  await card(
    `${brand}<h1>Prueba con <span>tu plano</span></h1><p>Gratis · En tu navegador · Sin instalar nada</p><div class="url">${URL_TXT}</div>` +
      `<div class="credits">Planos: ${EXAMPLES.map((e) => e.credit).join(' · ')}.<br>Música original de Plano Vivo.</div>`,
  );
  await sleep(7000);
  const end = Date.now() - t0;
  const video = page.video();
  await context.close();
  await browser.close();

  // Trim the page load, add music, encode.
  const raw = await video.path();
  const seconds = (end - start) / 1000;
  const music = path.join(HERE, 'ejemplos-tmp', 'musica.wav');
  execFileSync('python', [MUSIC, String(seconds + 1), music]);
  const out = path.join(OUT, 'plano-vivo-ejemplos.mp4');
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', String(start / 1000), '-t', String(seconds), '-i', raw, '-i', music,
    '-filter_complex', '[1:a]volume=0.55,afade=t=out:st=' + (seconds - 3).toFixed(2) + ':d=3[a]',
    '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out,
  ]);
  console.log('ok', out, seconds.toFixed(1) + ' s');
})();
