// High-resolution captures of Plano Vivo for marketing pieces (Edge, 2× pixel density).
//   NODE_PATH=<carpeta con playwright>/node_modules node capturas.js
const { chromium } = require('playwright');
const path = require('path');

const SITE = process.env.SITE || 'https://plano-vivo.fleremiasflemin.workers.dev/';
const HERE = __dirname;
const OUT = path.join(HERE, '..', 'capturas');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'es-EC',
  });
  const page = await context.newPage();
  const shot = (name, target) =>
    (target ? page.locator(target).first() : page).screenshot({ path: path.join(OUT, name + '.png') });
  const canvas = () => page.locator('#render canvas');
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
    await sleep(400);
  };
  const confirm = async () => {
    await sleep(400);
    const ok = page.locator('#confirmDialog[open] button[value=ok]');
    if (await ok.count()) await ok.click();
  };
  const build = async (file) => {
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
    await sleep(1500);
  };

  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.fill('#projectName', 'Casa Demo');
  // 1. The plan as uploaded.
  await page.setInputFiles('#file', path.join(HERE, 'demo.png'));
  await confirm();
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '_debug.png') });
  await page.click('[data-view=plan]');
  await sleep(800);
  await shot('01-plano-original', '#plan');

  // 2. Recognised: dual view and full interface.
  await page.click('#build');
  await confirm();
  await page.waitForFunction(
    () => document.getElementById('status').textContent.includes('Plano reconocido'),
    null,
    { timeout: 30000 },
  );
  await sleep(1500);
  await page.click('[data-view=split]');
  await sleep(1200);
  await shot('02-interfaz-completa');
  // Plan without the editor's help texts, for the boards.
  await page.addStyleTag({ content: '#planpane .pane-bottom,#planpane .pane-label{visibility:hidden}' });
  await sleep(600);
  await shot('03-editor-2d', '#plan');

  // 3. 3D model, materials and angles.
  await page.click('[data-view=model]');
  await page.locator('summary', { hasText: 'Materiales y presentación' }).click();
  await page.selectOption('#material', '#e5e7df');
  await page.selectOption('#floorMaterial', '#cfb792');
  await sleep(800);
  await drag(-140, 30);
  await zoom(-3);
  await sleep(800);
  await shot('04-modelo-3d', '#render canvas');
  await drag(220, -10);
  await zoom(-2);
  await sleep(800);
  await shot('05-modelo-3d-angulo', '#render canvas');
  await zoom(-4);
  await sleep(800);
  await shot('06-detalle-muebles', '#render canvas');
  await page.click('#topcam');
  await sleep(1200);
  await shot('07-planta-desde-arriba', '#render canvas');
  await shot('08-cantidades', '.metrics');

  // 4. Walk-through.
  await page.click('#walk');
  await sleep(1200);
  await page.keyboard.down('w');
  await sleep(700);
  await page.keyboard.up('w');
  await sleep(600);
  await shot('09-recorrido', '#render canvas');
  await page.click('#exitwalk');

  // 5. Materials variant.
  await page.selectOption('#material', '#cba680');
  await page.selectOption('#floorMaterial', '#d6d8d2');
  await page.click('#resetcam');
  await sleep(600);
  await drag(-160, 20);
  await zoom(-3);
  await sleep(800);
  await shot('10-materiales', '#render canvas');

  // 6. Export and suggestions panels.
  await page.locator('summary', { hasText: 'Exportar y recuperar' }).click();
  await sleep(400);
  await shot('11-exportar', 'details:has(#exportDXF)');
  await page.click('#feedback');
  await sleep(600);
  await shot('12-sugerencias', '#feedbackDialog');
  await page.click('#feedbackCancel');

  // 7. Diagonal walls.
  await page.selectOption('#material', '#e5e7df');
  await page.selectOption('#floorMaterial', '#cfb792');
  await build('diagonal.png');
  await page.click('[data-view=model]');
  await sleep(800);
  await drag(-120, 40);
  await zoom(-3);
  await sleep(800);
  await shot('13-muros-diagonales', '#render canvas');

  await browser.close();
})();
