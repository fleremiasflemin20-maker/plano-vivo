// Records the Plantea 3D walkthrough with Playwright (Edge), scene by scene, timed to
// the narration. Writes raw.webm and timeline.json (scene start times, ms).
// Run from tools/video (see montar.py). SITE=<url> records another deployment.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.env.SITE || 'https://plantea-3d.fleremiasflemin.workers.dev/';
const dir = __dirname;
const scenes = JSON.parse(fs.readFileSync(path.join(dir, 'guion.json'), 'utf8'));
const W = 1280,
  H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Overlay: captions, title cards and a visible cursor (video recordings have none).
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('pv-cap')) return;
    const style = document.createElement('style');
    style.textContent = `
      #pv-cap{position:fixed;left:24px;bottom:22px;max-width:760px;z-index:99999;pointer-events:none;
        background:rgba(22,52,39,.92);color:#fff;border-radius:12px;padding:12px 18px;font:500 17px/1.35 system-ui,sans-serif;
        box-shadow:0 8px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .35s}
      #pv-cap b{display:block;font:700 13px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#9fe0b8;margin-bottom:4px}
      #pv-card{position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:linear-gradient(135deg,#123b2a,#2a7a55);color:#fff;font-family:system-ui,sans-serif;text-align:center;
        opacity:0;transition:opacity .6s;pointer-events:none;padding:60px}
      #pv-card h1{font-size:76px;margin:0 0 10px;letter-spacing:-.02em}
      #pv-card h2{font-size:30px;font-weight:500;margin:0 0 26px;color:#c9f0d8}
      #pv-card p{font-size:22px;line-height:1.55;max-width:900px;margin:4px 0;color:#eafff2}
      #pv-card .url{margin-top:28px;font-size:24px;background:rgba(255,255,255,.14);padding:10px 22px;border-radius:30px}
      #pv-cursor{position:fixed;left:640px;top:360px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(255,196,0,.55);border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.35);z-index:100000;
        pointer-events:none;transition:left .7s ease,top .7s ease,transform .15s}
      #pv-cursor.click{transform:scale(.6)}`;
    document.head.appendChild(style);
    for (const id of ['pv-cap', 'pv-card', 'pv-cursor']) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  window.__cap = (title, text) => {
    install();
    const el = document.getElementById('pv-cap');
    el.innerHTML = title ? `<b>${title}</b>${text}` : '';
    el.style.opacity = title ? 1 : 0;
  };
  window.__card = (html) => {
    install();
    const el = document.getElementById('pv-card');
    if (html) el.innerHTML = html;
    el.style.opacity = html ? 1 : 0;
  };
  window.__cursor = (x, y, click) => {
    install();
    const el = document.getElementById('pv-cursor');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (click) {
      el.classList.add('click');
      setTimeout(() => el.classList.remove('click'), 180);
    }
  };
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: path.join(dir, 'raw'), size: { width: W, height: H } },
    acceptDownloads: true,
    locale: 'es-EC',
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const t0 = Date.now();
  const timeline = [];
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));

  const at = async (x, y, click = false) => {
    await page.evaluate(([x, y, c]) => window.__cursor(x, y, c), [x, y, click]);
  };
  const center = async (target) => {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const hover = async (target, pause = 800) => {
    const p = await center(target);
    await at(p.x, p.y);
    await sleep(pause);
    return p;
  };
  const click = async (target, pause = 500) => {
    const p = await hover(target, 750);
    await at(p.x, p.y, true);
    await page.mouse.click(p.x, p.y);
    await sleep(pause);
  };
  // Point on the 2D plan canvas, as fractions of its box.
  const planPoint = async (fx, fy) => {
    const b = await page.locator('#plan').boundingBox();
    return { x: b.x + b.width * fx, y: b.y + b.height * fy };
  };
  const clickPlan = async (fx, fy, pause = 400) => {
    const p = await planPoint(fx, fy);
    await at(p.x, p.y);
    await sleep(750);
    await at(p.x, p.y, true);
    await page.mouse.click(p.x, p.y);
    await sleep(pause);
  };
  const confirmIfAsked = async () => {
    await sleep(500);
    const ok = page.locator('#confirmDialog[open] button[value=ok]');
    if (await ok.count()) await click(ok);
  };
  const waitStatus = (text, timeout = 30000) =>
    page.waitForFunction((t) => document.getElementById('status').textContent.includes(t), text, {
      timeout,
    });
  const dragModel = async (dx, dy) => {
    const b = await page.locator('#render canvas').boundingBox();
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await at(x, y);
    await sleep(700);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
      await page.mouse.move(x + (dx * i) / 30, y + (dy * i) / 30);
      await at(x + (dx * i) / 30, y + (dy * i) / 30);
      await sleep(40);
    }
    await page.mouse.up();
  };

  const actions = {
    async portada() {
      await page.goto(URL, { waitUntil: 'networkidle' });
      await at(-60, -60);
      await page.evaluate(() =>
        window.__card(
          '<h1>▱ Plantea 3D</h1><h2>Del plano al espacio</h2><p>De un plano a un modelo 3D que puedes recorrer.</p><p>En tu navegador · Gratis · Sin instalar nada</p>',
        ),
      );
    },
    async subir() {
      await page.evaluate(() => window.__card(''));
      await sleep(500);
      await hover('label.upload', 1200);
      await page.setInputFiles('#file', path.join(dir, 'demo.png'));
      await confirmIfAsked();
      await sleep(1500);
      await page.click('[data-view=plan]');
    },
    async construir() {
      await click('#build');
      await confirmIfAsked();
      await waitStatus('Plano reconocido');
      await sleep(1500);
      await hover('#status', 1500);
    },
    async modelo() {
      await page.click('[data-view=model]');
      await sleep(600);
      await dragModel(-260, 40);
      const b = await page.locator('#render canvas').boundingBox();
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -120);
        await sleep(120);
      }
      await sleep(600);
      await click('#topcam', 1200);
      await click('#resetcam', 300);
    },
    async dual() {
      await click('[data-view=split]', 1500);
      await hover('#plan', 1500);
    },
    async medidas() {
      await hover('#width', 1200);
      await click('#height');
      await page.fill('#height', '2.7');
      await page.keyboard.press('Tab');
      await sleep(800);
      await hover('#thickness', 1000);
      await hover('#calibrate', 1200);
    },
    async cantidades() {
      await click('[data-view=model]', 600);
      for (const id of ['#linear', '#wallArea', '#volume', '#floorArea']) await hover(id, 900);
      await hover('#roomList', 1200);
    },
    async materiales() {
      await page.locator('summary', { hasText: 'Materiales y presentación' }).click();
      await hover('#material', 600);
      await page.selectOption('#material', '#cba680');
      await sleep(900);
      await hover('#floorMaterial', 600);
      await page.selectOption('#floorMaterial', '#d6d8d2');
      await sleep(900);
      await dragModel(180, -30);
    },
    async recorrido() {
      // The walk starts in a room facing its window: step towards it and glance round.
      await click('#walk', 1600);
      await page.keyboard.down('w');
      await sleep(500);
      await page.keyboard.up('w');
      const b = await page.locator('#render canvas').boundingBox();
      const x = b.x + b.width * 0.45,
        y = b.y + b.height * 0.5;
      await at(x, y);
      await sleep(400);
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 40; i++) {
        await page.mouse.move(x + i * 2.5, y);
        await at(x + i * 2.5, y);
        await sleep(60);
      }
      await page.mouse.up();
    },
    async dibujar() {
      await click('#exitwalk', 400);
      await click('#new');
      await confirmIfAsked();
      await sleep(600);
      await click('[data-view=split]', 400);
      await click('[data-tool=rectangle]');
      await clickPlan(0.18, 0.2);
      await clickPlan(0.82, 0.8, 800);
      await click('[data-tool=wall]');
      await clickPlan(0.5, 0.2);
      await clickPlan(0.5, 0.8, 800);
      await click('[data-tool=door]');
      await clickPlan(0.5, 0.62, 800);
      await click('[data-tool=window]');
      await clickPlan(0.34, 0.2, 800);
    },
    async editar() {
      await click('[data-tool=select]');
      await clickPlan(0.82, 0.5, 900);
      await hover('#elementLength', 700);
      await hover('#elementHeight', 400);
      await page.fill('#elementHeight', '3.2');
      await click('#applyElement', 1000);
      await click('#undo', 900);
      await click('#redo', 600);
    },
    async medir() {
      await click('[data-tool=measure]');
      await clickPlan(0.18, 0.8);
      await clickPlan(0.82, 0.8, 1500);
    },
    async diagonal() {
      await page.setInputFiles('#file', path.join(dir, 'diagonal.png'));
      await confirmIfAsked();
      await sleep(1200);
      await click('#build');
      await confirmIfAsked();
      await waitStatus('Plano reconocido');
      await sleep(800);
      await dragModel(-200, 30);
    },
    async guardar() {
      await hover('#saveState', 1000);
      await click('#save', 800);
      await page.locator('summary', { hasText: 'Exportar y recuperar' }).click();
      await click('#versions', 2200);
      await click('#closeVersions', 300);
    },
    async exportar() {
      for (const id of ['#exportDXF', '#exportSVG', '#exportGLB', '#exportCSV', '#exportPNG'])
        await hover(id, 900);
      await click('#exportGLB', 600);
    },
    async python() {
      await at(-60, -60);
      await page.evaluate(() =>
        window.__card(
          '<h2>Motor local para profesionales</h2><p>Lectura de vectores PDF y selección de página</p><p>Reconocimiento de textos (OCR)</p><p>Exportación IFC para BIM</p><p>Tus planos no salen de tu computador</p>',
        ),
      );
    },
    async cierre() {
      await page.evaluate(() => window.__card(''));
      await sleep(400);
      await click('#feedback', 2500);
      await page.locator('#feedbackCancel').click();
      await at(-60, -60);
      await page.evaluate(() =>
        window.__card(
          '<h1>▱ Plantea 3D</h1><h2>Versión beta · Pruébalo y cuéntanos</h2><p>Botón «Sugerencias» dentro de la app, sin cuenta</p><div class="url">plantea-3d.fleremiasflemin.workers.dev</div>',
        ),
      );
    },
  };

  for (const s of scenes) {
    const start = Date.now() - t0;
    timeline.push({ id: s.id, start });
    if (s.id !== 'portada')
      await page.evaluate(([t, x]) => window.__cap(t, x), [s.titulo, s.texto]).catch(() => {});
    try {
      await actions[s.id]();
    } catch (e) {
      console.log('SCENE FAILED', s.id, e.message.split('\n')[0]);
    }
    if (s.id === 'portada')
      await page.evaluate(() => window.__cap('', '')).catch(() => {});
    // Hold until the narration of this scene has finished, plus a short pause.
    const need = s.audio * 1000 + 700 - (Date.now() - t0 - start);
    if (need > 0) await sleep(need);
    timeline[timeline.length - 1].end = Date.now() - t0;
    console.log(s.id, timeline[timeline.length - 1]);
  }
  await sleep(1500);
  const video = page.video();
  await context.close();
  await browser.close();
  fs.renameSync(await video.path(), path.join(dir, 'raw.webm'));
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 1));
})();
