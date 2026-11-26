// Marketing pieces as HTML pages rendered to PNG (and PDF for the boards) with Edge.
//   NODE_PATH=<carpeta con playwright>/node_modules node piezas.cjs [filtro]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CAP = (f) => 'file:///' + path.join(ROOT, 'capturas', f).replace(/\\/g, '/');
const SRC = (f) => 'file:///' + path.join(__dirname, f).replace(/\\/g, '/');
const URL_TXT = 'plano-vivo.fleremiasflemin.workers.dev';

const BASE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
:root{--dark:#123b2a;--deep:#0d2c20;--green:#28866a;--mid:#2a7a55;--mint:#9fe0b8;--pale:#e8f2ed;--paper:#f6f8f7;--ink:#193f35;--muted:#5f7a6e;--sand:#cfb792}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;color:var(--ink);background:var(--paper);overflow:hidden;-webkit-font-smoothing:antialiased}
h1,h2,h3,.brand{font-family:Manrope,sans-serif;letter-spacing:-.02em}
.brand{display:flex;align-items:center;gap:.35em;font-weight:700}
.brand .mark{display:inline-block;width:1.05em;height:.72em;border:.12em solid currentColor;transform:skewX(-18deg);border-radius:.06em}
.brand b{font-weight:800;color:var(--green)}
.dark{background:linear-gradient(140deg,var(--deep),var(--mid));color:#fff}
.dark .brand b{color:var(--mint)}
.pill{display:inline-block;padding:.35em .9em;border-radius:99px;background:var(--pale);color:var(--green);font-weight:700;font-size:.8em;letter-spacing:.06em;text-transform:uppercase}
.dark .pill{background:rgba(255,255,255,.14);color:var(--mint)}
.img{background-size:cover;background-position:center;border-radius:22px}
.url{font-weight:600;letter-spacing:.01em}
.shadow{box-shadow:0 20px 60px rgba(13,44,32,.18)}
`;

const brand = (size = 34) =>
  `<div class="brand" style="font-size:${size}px"><span class="mark"></span><span>plano<b>vivo</b></span></div>`;

// --- Social posts (1080 × 1080) -------------------------------------------------
const posts = {
  'publicaciones/01-plano-a-3d': `
    <div class="dark" style="width:1080px;height:1080px;padding:70px;display:flex;flex-direction:column">
      ${brand(36)}
      <h1 style="font-size:84px;line-height:1.02;margin:46px 0 22px">De un plano<br>a un 3D que<br>puedes <span style="color:var(--mint)">recorrer</span>.</h1>
      <p style="font-size:30px;color:#d4f3e1;max-width:760px">Sube una foto o un PDF de tu plano. En segundos tienes el modelo.</p>
      <div class="img shadow" style="flex:1;margin-top:40px;background-image:url(${CAP('render-01-perspectiva.png')});background-size:cover;background-position:center 55%;background-color:#e8eeea"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:30px;font-size:26px">
        <span class="pill">Gratis · Sin instalar</span><span class="url">${URL_TXT}</span>
      </div>
    </div>`,
  'publicaciones/02-antes-despues': `
    <div style="width:1080px;height:1080px;padding:64px;display:flex;flex-direction:column;background:var(--paper)">
      <div style="display:flex;justify-content:space-between;align-items:center">${brand(32)}<span class="pill">Antes · Después</span></div>
      <h1 style="font-size:62px;line-height:1.05;margin:36px 0 34px">La misma casa,<br>en segundos.</h1>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;flex:1">
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="img shadow" style="flex:1;background:#fff url(${SRC('demo.png')}) center/92% no-repeat"></div>
          <div style="font-size:26px;font-weight:700">Tu plano <span style="color:var(--muted);font-weight:500">(foto o PDF)</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="img shadow" style="flex:1;background:#e8eeea url(${CAP('render-01-perspectiva.png')}) center/190% no-repeat"></div>
          <div style="font-size:26px;font-weight:700">Modelo 3D <span style="color:var(--muted);font-weight:500">editable</span></div>
        </div>
      </div>
      <div style="margin-top:30px;font-size:26px;display:flex;justify-content:space-between"><b style="color:var(--green)">Pruébalo gratis</b><span class="url">${URL_TXT}</span></div>
    </div>`,
  'publicaciones/03-tres-pasos': `
    <div class="dark" style="width:1080px;height:1080px;padding:70px;display:flex;flex-direction:column">
      ${brand(34)}
      <h1 style="font-size:70px;line-height:1.05;margin:40px 0 46px">Así de simple</h1>
      ${[
        ['1', 'Sube tu plano', 'Foto, captura, escaneo o PDF.'],
        ['2', 'Construir en 3D', 'Muros, puertas, ventanas, escaleras, muebles y escala.'],
        ['3', 'Recorre y exporta', 'Camina por dentro. Descarga en DXF, GLB o CSV.'],
      ]
        .map(
          ([n, t, d]) => `
        <div style="display:flex;gap:34px;align-items:center;padding:30px 0;border-top:1px solid rgba(255,255,255,.18)">
          <div style="width:110px;height:110px;border-radius:30px;background:var(--mint);color:var(--deep);display:grid;place-items:center;font:800 60px Manrope">${n}</div>
          <div><h2 style="font-size:46px">${t}</h2><p style="font-size:27px;color:#d4f3e1;margin-top:6px">${d}</p></div>
        </div>`,
        )
        .join('')}
      <div style="margin-top:auto;display:flex;justify-content:space-between;font-size:26px"><span class="pill">En tu navegador</span><span class="url">${URL_TXT}</span></div>
    </div>`,
  'publicaciones/04-que-reconoce': `
    <div style="width:1080px;height:1080px;position:relative;background:#e8eeea">
      <div class="img" style="position:absolute;inset:0;border-radius:0;background-image:url(${CAP('render-02-dormitorio.png')});background-size:150%;background-position:55% 45%"></div>
      <div style="position:absolute;inset:auto 0 0 0;height:60%;background:linear-gradient(transparent,rgba(13,44,32,.96) 32%)"></div>
      <div style="position:absolute;top:60px;left:64px">${brand(32)}</div>
      <div style="position:absolute;left:64px;right:64px;bottom:60px;color:#fff">
        <h1 style="font-size:60px;line-height:1.05;margin-bottom:30px">Lee tu plano<br>como un arquitecto</h1>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 30px;font-size:27px">
          ${[
            'Muros con su grosor',
            'Puertas con su giro',
            'Ventanas y ventanales',
            'Escaleras y terrazas',
            'Muros en diagonal',
            'Muebles y textos',
            'Escala del plano',
            'Recintos y áreas',
          ]
            .map((t) => `<div><span style="color:var(--mint);font-weight:800">✓</span> ${t}</div>`)
            .join('')}
        </div>
      </div>
    </div>`,
  'publicaciones/05-para-quien': `
    <div style="width:1080px;height:1080px;padding:70px;background:var(--paper);display:flex;flex-direction:column">
      ${brand(32)}
      <h1 style="font-size:66px;line-height:1.05;margin:40px 0 40px">¿Para quién es<br><span style="color:var(--green)">Plano Vivo</span>?</h1>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;flex:1">
        ${[
          ['Arquitectos', 'Volumetría rápida para la primera reunión.'],
          ['Estudiantes', 'Del plano del taller a un modelo que se recorre.'],
          ['Constructores', 'Longitudes, áreas y volúmenes de muros.'],
          ['Inmobiliarias', 'Muestra la casa en 3D antes de visitarla.'],
          ['Diseño interior', 'Prueba materiales de paredes y pisos.'],
          ['Tú y tu casa', 'Imagina la reforma antes de empezar.'],
        ]
          .map(
            ([t, d]) => `<div style="background:#fff;border:1px solid #d8e1dd;border-radius:24px;padding:28px">
              <h3 style="font-size:34px;color:var(--ink)">${t}</h3><p style="font-size:23px;color:var(--muted);margin-top:8px;line-height:1.35">${d}</p></div>`,
          )
          .join('')}
      </div>
      <div style="margin-top:28px;font-size:25px;display:flex;justify-content:space-between"><b style="color:var(--green)">Gratis · Sin instalar</b><span class="url">${URL_TXT}</span></div>
    </div>`,
  'publicaciones/06-exporta': `
    <div class="dark" style="width:1080px;height:1080px;padding:70px;display:flex;flex-direction:column">
      ${brand(34)}
      <h1 style="font-size:66px;line-height:1.05;margin:40px 0 18px">Llévalo a tu<br>programa favorito</h1>
      <p style="font-size:28px;color:#d4f3e1">Plano Vivo no te encierra: exporta y sigue trabajando.</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:46px">
        ${[
          ['DXF', 'Plano para CAD'],
          ['SVG', 'Plano vectorial'],
          ['GLB', 'Modelo 3D'],
          ['CSV', 'Cantidades'],
          ['PNG', 'Imagen 3D'],
          ['IFC', 'BIM · motor local'],
        ]
          .map(
            ([f, d]) => `<div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:24px;padding:34px 26px">
              <div style="font:800 58px Manrope;color:var(--mint)">${f}</div><div style="font-size:24px;margin-top:8px;color:#eafff2">${d}</div></div>`,
          )
          .join('')}
      </div>
      <div style="margin-top:auto;display:flex;justify-content:space-between;font-size:26px"><span class="pill">Plano Vivo</span><span class="url">${URL_TXT}</span></div>
    </div>`,
  'publicaciones/07-tu-opinion': `
    <div style="width:1080px;height:1080px;padding:70px;background:var(--pale);display:flex;gap:44px">
      <div style="flex:1.05;display:flex;flex-direction:column">
        ${brand(32)}
        <span class="pill" style="margin-top:44px;align-self:flex-start;background:#fff">Versión beta</span>
        <h1 style="font-size:62px;line-height:1.05;margin:22px 0 26px">Tu opinión diseña Plano Vivo</h1>
        <p style="font-size:28px;line-height:1.4;color:var(--muted)">Pruébalo con tus planos y cuéntanos qué falló o qué te gustaría. Botón <b style="color:var(--green)">Sugerencias</b>, sin crear cuenta.</p>
        <div style="margin-top:auto;font-size:22px;white-space:nowrap" class="url">${URL_TXT}</div>
      </div>
      <div class="img shadow" style="flex:.95;align-self:center;aspect-ratio:960/1384;background:#fff url(${CAP('12-sugerencias.png')}) top center/100% no-repeat;border-radius:24px"></div>
    </div>`,
};

// --- Stories (1080 × 1920) ------------------------------------------------------
const stories = {
  'historias/01-recorre-tu-casa': `
    <div style="width:1080px;height:1920px;position:relative;background:#e8eeea">
      <div style="position:absolute;inset:0;background:url(${CAP('render-07-vertical.png')}) center 62%/138% no-repeat"></div>
      <div style="position:absolute;inset:0 0 auto 0;height:44%;background:linear-gradient(var(--deep) 40%,transparent)"></div>
      <div style="position:absolute;top:120px;left:80px;right:80px;color:#fff">
        ${brand(40)}
        <h1 style="font-size:96px;line-height:1;margin-top:60px">Recorre tu casa<br><span style="color:var(--mint)">antes de construirla</span></h1>
      </div>
      <div style="position:absolute;left:80px;right:80px;bottom:150px;background:var(--deep);color:#fff;border-radius:34px;padding:40px 46px">
        <div style="font-size:34px;line-height:1.35">Sube tu plano · Construir en 3D · Recorre</div>
        <div style="font-size:30px;color:var(--mint);margin-top:14px" class="url">${URL_TXT}</div>
      </div>
    </div>`,
  'historias/02-tres-pasos': `
    <div class="dark" style="width:1080px;height:1920px;padding:120px 80px;display:flex;flex-direction:column">
      ${brand(40)}
      <h1 style="font-size:92px;line-height:1;margin:70px 0 70px">De plano<br>a 3D en<br><span style="color:var(--mint)">3 pasos</span></h1>
      ${[
        ['1', 'Sube tu plano', CAP('01-plano-original.png')],
        ['2', 'Construir en 3D', CAP('render-01-perspectiva.png')],
        ['3', 'Recorre y exporta', CAP('render-02-dormitorio.png')],
      ]
        .map(
          ([n, t, img]) => `<div style="display:flex;gap:30px;align-items:center;margin-bottom:40px">
          <div style="width:96px;height:96px;flex:none;border-radius:28px;background:var(--mint);color:var(--deep);display:grid;place-items:center;font:800 54px Manrope">${n}</div>
          <div style="flex:1"><div style="font:700 46px Manrope;margin-bottom:16px">${t}</div>
          <div class="img" style="height:250px;background:${img.includes('render') ? '#e8eeea' : '#fff'} url(${img}) center/${img.includes('render') ? '78%' : 'contain'} no-repeat"></div></div></div>`,
        )
        .join('')}
      <div style="margin-top:auto;font-size:32px;text-align:center" class="url">${URL_TXT}</div>
    </div>`,
  'historias/03-pruebalo': `
    <div style="width:1080px;height:1920px;padding:120px 80px;background:var(--paper);display:flex;flex-direction:column;align-items:center;text-align:center">
      ${brand(46)}
      <span class="pill" style="margin-top:90px;font-size:30px">Gratis · Sin instalar · En tu navegador</span>
      <h1 style="font-size:104px;line-height:1;margin:60px 0 50px">Pruébalo<br>con tu plano</h1>
      <div class="img shadow" style="width:100%;height:760px;background:#e8eeea url(${CAP('render-04-materiales.png')}) center/160% no-repeat"></div>
      <div style="margin-top:70px;background:var(--green);color:#fff;border-radius:99px;padding:30px 50px;font:700 36px Manrope">${URL_TXT}</div>
      <p style="font-size:30px;color:var(--muted);margin-top:40px">Y cuéntanos qué mejorar con el botón «Sugerencias».</p>
    </div>`,
};

// --- Covers and link preview ----------------------------------------------------
const covers = {
  'portadas/linkedin-1584x396': `
    <div class="dark" style="width:1584px;height:396px;display:flex;align-items:center;padding:0 90px;gap:60px;overflow:hidden">
      <div style="flex:1">${brand(40)}<h1 style="font-size:52px;line-height:1.05;margin-top:20px">Del plano al espacio,<br>en tu navegador.</h1></div>
      <div class="img" style="width:640px;height:340px;background:url(${CAP('render-01-perspectiva.png')}) center/150% no-repeat;border-radius:22px;background-color:#e8eeea"></div>
    </div>`,
  'portadas/facebook-1640x624': `
    <div class="dark" style="width:1640px;height:624px;display:flex;align-items:center;padding:0 110px;gap:70px">
      <div style="flex:1">${brand(44)}<h1 style="font-size:66px;line-height:1.05;margin:26px 0 20px">De un plano a un 3D<br>que puedes recorrer.</h1>
        <span class="pill" style="font-size:22px">Gratis · Sin instalar</span><div class="url" style="font-size:26px;margin-top:18px">${URL_TXT}</div></div>
      <div class="img shadow" style="width:720px;height:480px;background:#e8eeea url(${CAP('render-02-dormitorio.png')}) center/140% no-repeat"></div>
    </div>`,
  'portadas/vista-previa-enlace-1200x630': `
    <div class="dark" style="width:1200px;height:630px;display:flex;align-items:center;padding:0 70px;gap:50px">
      <div style="flex:1">${brand(38)}<h1 style="font-size:58px;line-height:1.05;margin:24px 0 20px">De un plano a un 3D que puedes recorrer.</h1>
        <p style="font-size:24px;color:#d4f3e1">Gratis · En tu navegador · Sin instalar nada</p></div>
      <div class="img shadow" style="width:500px;height:500px;background:#e8eeea url(${CAP('render-01-perspectiva.png')}) center/220% no-repeat"></div>
    </div>`,
  'portadas/miniatura-video-1280x720': `
    <div class="dark" style="width:1280px;height:720px;display:flex;align-items:center;padding:0 70px;gap:50px">
      <div style="flex:1">${brand(38)}<h1 style="font-size:80px;line-height:1;margin:26px 0 26px">Cómo usar<br><span style="color:var(--mint)">Plano Vivo</span></h1>
        <span class="pill" style="font-size:24px">Todas las funciones · 2 min</span></div>
      <div class="img shadow" style="width:560px;height:560px;background:#e8eeea url(${CAP('render-02-dormitorio.png')}) center/180% no-repeat;position:relative">
        <div style="position:absolute;inset:0;margin:auto;width:130px;height:130px;border-radius:50%;background:rgba(13,44,32,.85);display:grid;place-items:center"><div style="width:0;height:0;border-left:44px solid #fff;border-top:28px solid transparent;border-bottom:28px solid transparent;margin-left:12px"></div></div>
      </div>
    </div>`,
};

// --- A3 landscape boards (420 × 297 mm) ------------------------------------------
const A3 = 'width:1587px;height:1123px'; // 96 dpi; rendered at 3× for print-quality PNG
const titleBlock = (n, title) => `
  <div style="position:absolute;right:36px;bottom:36px;width:420px;border:1.5px solid var(--ink);font-size:12px;background:#fff">
    <div style="display:grid;grid-template-columns:1fr 90px;border-bottom:1.5px solid var(--ink)">
      <div style="padding:10px 14px">${brand(22)}<div style="color:var(--muted);margin-top:4px">Del plano al espacio</div></div>
      <div style="border-left:1.5px solid var(--ink);display:grid;place-items:center;font:800 30px Manrope">${n}</div>
    </div>
    <div style="padding:8px 14px;border-bottom:1px solid #c9d6cf"><b>Lámina:</b> ${title}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;padding:8px 14px;gap:4px"><span><b>Proyecto:</b> Casa demo</span><span><b>Escala:</b> gráfica</span><span><b>Fecha:</b> 11/2026</span><span><b>Versión:</b> beta</span><span style="grid-column:1/3"><b>Web:</b> ${URL_TXT}</span></div>
  </div>`;
const boardFrame = (inner) => `
  <div style="${A3};position:relative;background:#fff;padding:36px">
    <div style="position:absolute;inset:18px;border:1.5px solid var(--ink)"></div>
    ${inner}
  </div>`;
const boards = {
  'laminas/lamina-01-presentacion-de-proyecto': boardFrame(`
    <div style="position:absolute;left:54px;top:54px;right:54px;display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid var(--ink);padding-bottom:14px">
      <div><div class="pill">Presentación de proyecto</div><h1 style="font-size:44px;margin-top:10px">Casa demo · Planta 01</h1></div>
      <div style="text-align:right;font-size:14px;color:var(--muted)">Generado con Plano Vivo a partir de un plano en imagen<br>Muros, aberturas, escalera, terraza y mobiliario reconocidos automáticamente</div>
    </div>
    <div style="position:absolute;left:54px;top:170px;width:880px;height:560px" class="img" ><div class="img" style="width:100%;height:100%;background:#eef3f0 url(${CAP('render-01-perspectiva.png')}) center/125% no-repeat;border-radius:10px"></div>
      <div style="position:absolute;left:14px;bottom:12px;font:700 13px Manrope;letter-spacing:.1em;color:var(--muted)">VISTA AXONOMÉTRICA</div></div>
    <div style="position:absolute;left:960px;top:170px;width:572px;height:400px;border:1px solid #d8e1dd;border-radius:10px;background:#fff url(${CAP('03-editor-2d.png')}) center/contain no-repeat"></div>
    <div style="position:absolute;left:974px;top:578px;font:700 13px Manrope;letter-spacing:.1em;color:var(--muted)">PLANTA ACOTADA · METROS</div>
    <div style="position:absolute;left:960px;top:610px;width:572px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:var(--pale)"><th style="text-align:left;padding:7px 10px">Cuadro de cantidades</th><th style="text-align:right;padding:7px 10px">Valor</th></tr>
        ${[
          ['Longitud de muros', '48,47 m'],
          ['Área neta de muro (una cara)', '127,88 m²'],
          ['Volumen geométrico de muros', '33,04 m³'],
          ['Área interior aproximada', '≈ 67,46 m²'],
          ['Recintos cerrados', '3'],
        ]
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 10px;border-bottom:1px solid #e3ebe7">${k}</td><td style="padding:6px 10px;border-bottom:1px solid #e3ebe7;text-align:right;font-weight:700">${v}</td></tr>`,
          )
          .join('')}
      </table>
      <p style="font-size:11px;color:var(--muted);margin-top:6px">Cómputos preliminares, sin cálculo estructural.</p>
    </div>
    <div style="position:absolute;left:54px;top:752px;display:flex;gap:16px">
      ${[
        ['render-03-planta.png', 'PLANTA EN 3D'],
        ['render-02-dormitorio.png', 'DORMITORIO Y ESTAR'],
        ['render-04-materiales.png', 'VARIANTE DE MATERIALES'],
      ]
        .map(
          ([f, t]) => `<div><div class="img" style="width:285px;height:200px;border-radius:8px;background:#eef3f0 url(${CAP(f)}) center/150% no-repeat"></div>
          <div style="font:700 11px Manrope;letter-spacing:.1em;color:var(--muted);margin-top:6px">${t}</div></div>`,
        )
        .join('')}
    </div>
    ${titleBlock('01', 'Presentación de proyecto')}`),
  'laminas/lamina-02-flujo-de-trabajo': boardFrame(`
    <div style="position:absolute;left:54px;top:54px;right:54px;border-bottom:1.5px solid var(--ink);padding-bottom:14px">
      <div class="pill">Flujo de trabajo</div><h1 style="font-size:44px;margin-top:10px">Del plano al modelo, en cinco pasos</h1>
    </div>
    <div style="position:absolute;left:54px;right:54px;top:175px;display:grid;grid-template-columns:repeat(5,1fr);gap:18px">
      ${[
        ['01', 'Subir', 'Foto, captura, escaneo o PDF del plano.', SRC('demo.png'), 'contain', '#fff'],
        ['02', 'Reconocer', 'Muros, puertas, ventanas, escaleras, muebles, textos y escala.', CAP('03-editor-2d.png'), 'contain', '#fff'],
        ['03', 'Revisar', 'Vista dual: plano y modelo lado a lado, elementos resaltados.', CAP('02-interfaz-completa.png'), 'cover', '#fff'],
        ['04', 'Explorar', 'Modelo 3D, materiales y recorrido a la altura de los ojos.', CAP('render-02-dormitorio.png'), '170%', '#eef3f0'],
        ['05', 'Exportar', 'DXF, SVG, GLB, CSV, PNG; IFC con el motor local.', CAP('11-exportar.png'), 'contain', '#fff'],
      ]
        .map(
          ([n, t, d, img, size, bg]) => `<div>
            <div style="font:800 44px Manrope;color:var(--green)">${n}</div>
            <h2 style="font-size:28px;margin:2px 0 8px">${t}</h2>
            <div class="img" style="height:330px;border:1px solid #d8e1dd;border-radius:10px;background:${bg} url(${img}) center/${size} no-repeat"></div>
            <p style="font-size:15px;line-height:1.45;color:var(--muted);margin-top:10px">${d}</p></div>`,
        )
        .join('')}
    </div>
    <div style="position:absolute;left:54px;top:740px;width:1300px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
      ${[
        ['Local y privado', 'El reconocimiento se hace en tu navegador: los planos no se suben a ningún servidor.'],
        ['Editable', 'Cada elemento propuesto se corrige: longitud, ángulo, altura, espesor, tipo.'],
        ['Medible', 'Cotas, áreas por recinto y cómputos de muros, con escala de la barra gráfica o calibrada.'],
      ]
        .map(
          ([t, d]) => `<div style="background:var(--pale);border-radius:12px;padding:20px"><h3 style="font-size:22px">${t}</h3><p style="font-size:15px;line-height:1.45;color:var(--muted);margin-top:6px">${d}</p></div>`,
        )
        .join('')}
    </div>
    <div style="position:absolute;left:54px;top:930px;width:1000px;font-size:14px;color:var(--muted);line-height:1.5">
      Funciona en cualquier navegador moderno, gratis y sin instalación. El motor local opcional (Python) añade lectura de vectores PDF, OCR de textos y exportación IFC para BIM.
    </div>
    ${titleBlock('02', 'Flujo de trabajo')}`),
  'laminas/lamina-03-ficha-tecnica': boardFrame(`
    <div style="position:absolute;left:54px;top:54px;right:54px;border-bottom:1.5px solid var(--ink);padding-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="pill">Ficha técnica</div><h1 style="font-size:44px;margin-top:10px">Plano Vivo · Estudio 3D</h1></div>
      <div style="font-size:15px;color:var(--muted)">Versión beta · 11/2026</div>
    </div>
    <div style="position:absolute;left:54px;top:170px;width:1000px;display:grid;grid-template-columns:1fr 1fr;gap:16px 34px;font-size:15px;line-height:1.45">
      ${[
        ['Reconocimiento de planos', 'Muros y tabiques con su grosor real, también en diagonal · puertas con bisagra y lado de giro · ventanas y ventanales · pasos · escaleras · terrazas · muebles por medidas (cama, sofá, mesa, encimera, bañera) · textos · recintos cerrados.'],
        ['Escala', 'Lectura de la barra gráfica del plano; estimación por el ancho de las puertas; calibración con dos puntos de medida conocida.'],
        ['Dibujo y edición', 'Paredes, recintos rectangulares, puertas, ventanas. Ajuste a cuadrícula y esquinas, ortogonalidad, longitud fija. Edición de longitud, ángulo, altura y espesor.'],
        ['Medición y cómputos', 'Cotas, herramienta de medida, áreas por recinto, longitud y área neta de muros, volumen geométrico. Exportación de cantidades en CSV.'],
        ['Visualización', 'Vista 2D, modelo 3D y vista dual. Materiales de paredes y pisos, plano de referencia en el piso, recorrido en primera persona con colisiones.'],
        ['Formatos', 'Entrada: PNG, JPG, WEBP, PDF (hasta 20 MB). Salida: DXF, SVG, GLB, CSV, PNG, proyecto JSON; IFC4 con el motor local.'],
        ['Datos y privacidad', 'Proceso en el navegador; autoguardado local y cinco versiones recuperables. Sin cuenta. El buzón de sugerencias guarda solo el texto enviado.'],
        ['Motor local (opcional)', 'Servicio en el propio computador: vectores PDF, selección de página, corrección de inclinación, OCR (RapidOCR), cola de trabajos, IFC con relaciones de huecos.'],
      ]
        .map(
          ([t, d]) => `<div style="border-top:1.5px solid var(--ink);padding-top:10px"><h3 style="font-size:19px;margin-bottom:5px">${t}</h3><p style="color:#3f5a50">${d}</p></div>`,
        )
        .join('')}
    </div>
    <div style="position:absolute;left:1090px;top:170px;width:442px">
      <div class="img" style="height:300px;border-radius:10px;background:#eef3f0 url(${CAP('render-06-diagonal.png')}) center/110% no-repeat"></div>
      <div style="font:700 11px Manrope;letter-spacing:.1em;color:var(--muted);margin:6px 0 16px">MUROS EN DIAGONAL Y PUERTA EN CHAFLÁN</div>
      <div style="background:var(--pale);border-radius:12px;padding:18px;font-size:14px;line-height:1.5">
        <h3 style="font-size:18px;margin-bottom:6px">Alcance</h3>
        Prototipo de diseño conceptual: la reconstrucción propone geometría para revisar. No sustituye un levantamiento ni incluye cálculo estructural o comprobación normativa.
      </div>
    </div>
    <div style="position:absolute;left:54px;top:845px;display:flex;gap:16px">
      ${['render-01-perspectiva.png', 'render-03-planta.png', 'render-04-materiales.png']
        .map((f) => `<div class="img" style="width:340px;height:210px;border-radius:8px;background:#eef3f0 url(${CAP(f)}) center/140% no-repeat"></div>`)
        .join('')}
    </div>
    ${titleBlock('03', 'Ficha técnica')}`),
  'laminas/lamina-00-portada': `
    <div class="dark" style="${A3};position:relative;padding:90px;display:flex;flex-direction:column">
      ${brand(46)}
      <div style="display:flex;gap:70px;align-items:center;flex:1">
        <div style="flex:1">
          <span class="pill" style="font-size:18px">Dossier · Versión beta 2026</span>
          <h1 style="font-size:96px;line-height:1;margin:30px 0 28px">Del plano<br>al espacio.</h1>
          <p style="font-size:26px;line-height:1.45;color:#d4f3e1;max-width:560px">Plano Vivo convierte la imagen o el PDF de un plano en un modelo 3D editable, medible y recorrible, directamente en el navegador.</p>
        </div>
        <div class="img shadow" style="width:780px;height:600px;background:#e8eeea url(${CAP('render-01-perspectiva.png')}) center/140% no-repeat"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:22px;color:#d4f3e1"><span>01 Presentación de proyecto · 02 Flujo de trabajo · 03 Ficha técnica</span><span class="url" style="color:#fff">${URL_TXT}</span></div>
    </div>`,
};

const all = {
  ...Object.fromEntries(Object.entries(posts).map(([k, v]) => [k, { html: v, w: 1080, h: 1080 }])),
  ...Object.fromEntries(Object.entries(stories).map(([k, v]) => [k, { html: v, w: 1080, h: 1920 }])),
  ...Object.fromEntries(
    Object.entries(covers).map(([k, v]) => {
      const [, w, h] = k.match(/(\d+)x(\d+)$/);
      return [k, { html: v, w: +w, h: +h }];
    }),
  ),
  ...Object.fromEntries(Object.entries(boards).map(([k, v]) => [k, { html: v, w: 1587, h: 1123, board: true }])),
};
const DOSSIER = [
  'laminas/lamina-00-portada',
  'laminas/lamina-01-presentacion-de-proyecto',
  'laminas/lamina-02-flujo-de-trabajo',
  'laminas/lamina-03-ficha-tecnica',
];

(async () => {
  const filter = process.argv[2] || '';
  const browser = await chromium.launch({ channel: 'msedge' });
  const tmp = path.join(__dirname, 'html');
  fs.mkdirSync(tmp, { recursive: true });
  const pdfs = [];
  for (const [name, p] of Object.entries(all)) {
    if (!name.includes(filter)) continue;
    const file = path.join(tmp, name.replace(/\//g, '__') + '.html');
    fs.writeFileSync(
      file,
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${BASE}</style></head><body style="width:${p.w}px;height:${p.h}px">${p.html}</body></html>`,
    );
    const page = await browser.newPage({
      viewport: { width: p.w, height: p.h },
      deviceScaleFactor: p.board ? 3 : 1,
    });
    await page.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(ROOT, name);
    await page.screenshot({ path: out + '.png' });
    if (p.board) {
      await page.pdf({ path: out + '.pdf', width: '420mm', height: '297mm', printBackground: true, pageRanges: '1' });
      pdfs.push(out + '.pdf');
    }
    await page.close();
    console.log('ok', name);
  }
  // Dossier: all boards in one PDF, one A3 page each.
  if (!filter || filter.includes('lamina')) {
    const file = path.join(tmp, 'dossier.html');
    fs.writeFileSync(
      file,
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${BASE}
      body{overflow:visible} .page{width:1587px;height:1123px;overflow:hidden;page-break-after:always}</style></head><body>` +
        DOSSIER.map((k) => `<div class="page">${all[k].html}</div>`).join('') +
        '</body></html>',
    );
    const page = await browser.newPage({ viewport: { width: 1587, height: 1123 } });
    await page.goto('file:///' + file.split(path.sep).join('/'), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: path.join(ROOT, 'laminas', 'dossier-plano-vivo.pdf'), width: '420mm', height: '297mm', printBackground: true });
    console.log('ok dossier');
  }
  await browser.close();
})();
