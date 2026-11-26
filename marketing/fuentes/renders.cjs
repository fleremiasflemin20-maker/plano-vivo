// Clean full-screen renders of the 3D model (no buttons), landscape and portrait.
//   NODE_PATH=<carpeta con playwright>/node_modules node renders.cjs
const { chromium } = require('playwright');
const path = require('path');

const SITE = process.env.SITE || 'https://plano-vivo.fleremiasflemin.workers.dev/';
const HERE = __dirname;
const OUT = path.join(HERE, '..', 'capturas');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STUDIO = `
  #modelpane{position:fixed!important;inset:0!important;z-index:9000;margin:0!important;border-radius:0!important;border:0!important}
  #modelpane > :not(#render){display:none!important}
  #render{position:absolute!important;inset:0!important}`;

async function session(browser, viewport, shots) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'es-EC' });
  const page = await context.newPage();
  const canvas = () => page.locator('#render canvas');
  const confirm = async () => {
    await sleep(400);
    const ok = page.locator('#confirmDialog[open] button[value=ok]');
    if (await ok.count()) await ok.click();
  };
  const studio = async (on) => {
    await page.evaluate(
      async ([css, on]) => {
        let el = document.getElementById('studio-css');
        if (!el) {
          el = document.createElement('style');
          el.id = 'studio-css';
          document.head.appendChild(el);
        }
        el.textContent = on ? css : '';
        (await import('/ui/core.mjs')).viewer.resize();
      },
      [STUDIO, on],
    );
    await sleep(500);
  };
  const drag = async (dx, dy) => {
    const b = await canvas().boundingBox();
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(x + (dx * i) / 20, y + (dy * i) / 20);
    await page.mouse.up();
  };
  const zoom = async (steps) => {
    const b = await canvas().boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < Math.abs(steps); i++) await page.mouse.wheel(0, steps > 0 ? 120 : -120);
    await sleep(500);
  };
  const build = async (file) => {
    await studio(false);
    await page.setInputFiles('#file', path.join(HERE, file));
    await confirm();
    await sleep(1200);
    await page.click('#build');
    await confirm();
    await page.waitForFunction(
      () => document.getElementById('status').textContent.includes('Plano reconocido'),
      null,
      { timeout: 30000 },
    );
    await sleep(1200);
    await page.click('[data-view=model]');
    await sleep(500);
  };
  const materials = async (walls, floor) => {
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
      [walls, floor],
    );
    await sleep(600);
  };
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const reset = async () => {
    await page.click('#resetcam', { force: true }).catch(() => {});
    await page.evaluate(() => document.getElementById('resetcam').click());
    await sleep(400);
  };

  await page.goto(SITE, { waitUntil: 'networkidle' });
  await shots({ build, studio, drag, zoom, shot, materials, reset, page });
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  // Landscape renders (3200 × 2000).
  await session(browser, { width: 1600, height: 1000 }, async (s) => {
    await s.build('demo.png');
    await s.materials('#e5e7df', '#cfb792');
    await s.studio(true);
    await s.drag(-140, 20);
    await s.zoom(-5);
    await s.shot('render-01-perspectiva');
    await s.drag(260, 10);
    await s.zoom(-3);
    await s.shot('render-02-dormitorio');
    await s.reset();
    await s.page.evaluate(() => document.getElementById('topcam').click());
    await sleep(800);
    await s.zoom(-4);
    await s.shot('render-03-planta');
    await s.reset();
    await s.materials('#cba680', '#d6d8d2');
    await s.drag(160, 30);
    await s.zoom(-5);
    await s.shot('render-04-materiales');
    await s.materials('#e5e7df', '#cfb792');
    await s.studio(false);
    await s.page.click('#walk');
    await sleep(800);
    await s.studio(true);
    await s.page.keyboard.down('w');
    await sleep(600);
    await s.page.keyboard.up('w');
    await s.drag(-160, 0);
    await sleep(500);
    await s.shot('render-05-recorrido');
    await s.studio(false);
    await s.page.click('#exitwalk');
    await s.build('diagonal.png');
    await s.studio(true);
    await s.drag(-100, 30);
    await s.zoom(-4);
    await s.shot('render-06-diagonal');
  });
  // Portrait render for stories and reels (1800 × 3200).
  await session(browser, { width: 900, height: 1600 }, async (s) => {
    await s.build('demo.png');
    await s.materials('#e5e7df', '#cfb792');
    await s.studio(true);
    await s.drag(-120, 40);
    await s.zoom(-3);
    await s.shot('render-07-vertical');
  });
  await browser.close();
})();
