// Admin panel (served by the Worker at /admin). Asks for the ADMIN_TOKEN key, keeps it
// only for this browser tab (sessionStorage) and reads GET /api/admin/resumen.
// The inline script avoids template literals so this file can hold it in one string.
export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Plano Vivo · Panel de administración</title>
<style>
  :root { --bg:#f3f6f4; --card:#fff; --ink:#17322a; --ink2:#4c6459; --muted:#7d9187; --line:#e3ebe6; --grid:#edf2ef; --mark:#0f9467; --wash:rgba(15,148,103,.10); --accent:#1d6b50; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif }
  header { display:flex; align-items:center; gap:16px; padding:16px 28px; background:#0d2c20; color:#fff; flex-wrap:wrap }
  header h1 { font-size:17px; margin:0; font-weight:700 } header h1 b { color:#9fe0b8 }
  header .sp { flex:1 }
  header select, header button { font:inherit; border-radius:8px; border:1px solid #2f5a48; background:#173e2f; color:#fff; padding:6px 10px; cursor:pointer }
  main { max-width:1220px; margin:0 auto; padding:22px 28px 60px }
  .hint { color:var(--muted); font-size:12.5px }
  .kpis { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; margin:8px 0 18px }
  .kpi { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px }
  .kpi span { display:block; color:var(--ink2); font-size:12px } .kpi strong { font-size:26px; font-variant-numeric:tabular-nums; letter-spacing:-.02em } .kpi small { color:var(--muted); font-size:11.5px; display:block }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:14px }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px 12px; min-width:0 }
  .card.wide { grid-column:1/-1 }
  .card h2 { font-size:14px; margin:0 0 2px } .card p.sub { margin:0 0 10px; color:var(--muted); font-size:12px }
  svg text { fill:var(--muted); font-size:11px; font-family:inherit }
  .bars { display:grid; gap:6px }
  .row { display:grid; grid-template-columns:minmax(80px,38%) 1fr auto; gap:8px; align-items:center; font-size:13px }
  .row .name { color:var(--ink2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .row .track { height:14px; position:relative }
  .row .fill { position:absolute; left:0; top:1px; height:12px; background:var(--mark); border-radius:0 4px 4px 0; min-width:2px }
  .row .val { font-variant-numeric:tabular-nums; color:var(--ink); min-width:48px; text-align:right }
  .empty { color:var(--muted); font-size:13px; padding:8px 0 }
  table { width:100%; border-collapse:collapse; font-size:13px } th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top } td.n, th.n { text-align:right; font-variant-numeric:tabular-nums }
  .tip { position:fixed; pointer-events:none; background:#17322a; color:#fff; padding:6px 9px; border-radius:7px; font-size:12px; display:none; z-index:9 }
  .login { max-width:380px; margin:12vh auto; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:24px }
  .login input { width:100%; font:inherit; padding:9px 11px; border:1px solid var(--line); border-radius:8px; margin:8px 0 }
  .login button, .btn { font:inherit; border:0; background:var(--accent); color:#fff; padding:9px 14px; border-radius:8px; cursor:pointer }
  .btn.ghost { background:transparent; color:var(--accent); border:1px solid var(--line) }
  .err { color:#b3261e; min-height:20px; font-size:13px }
  .sug { border-top:1px solid var(--line); padding:9px 0 } .sug:first-child { border:0 } .sug b { text-transform:capitalize } .sug .meta { color:var(--muted); font-size:12px }
  details summary { cursor:pointer; color:var(--accent); font-size:13px; margin-top:6px }
</style>
</head>
<body>
<div id="login" class="login" hidden>
  <h1 style="font-size:18px;margin:0 0 4px">Panel de Plano Vivo</h1>
  <p class="hint">Escribe la clave de administración (el secreto ADMIN_TOKEN del Worker). Solo se guarda en esta pestaña.</p>
  <form id="loginForm"><input id="key" type="password" autocomplete="current-password" placeholder="Clave" required><button>Entrar</button></form>
  <p class="err" id="loginErr"></p>
</div>
<div id="app" hidden>
  <header>
    <h1>plano<b>vivo</b> · panel</h1>
    <span class="sp"></span>
    <label>Periodo <select id="range"><option value="7">7 días</option><option value="30" selected>30 días</option><option value="90">90 días</option><option value="365">1 año</option></select></label>
    <button id="reload">Actualizar</button><button id="logout">Salir</button>
  </header>
  <main>
    <p class="hint" id="period"></p>
    <section class="kpis" id="kpis"></section>
    <div class="grid">
      <div class="card wide"><h2>Visitantes por día</h2><p class="sub">Personas distintas cada día (hora de Ecuador). Pasa el cursor por una columna para ver el detalle.</p><div id="chart"></div>
        <details><summary>Ver como tabla y descargar CSV</summary><div id="dayTable"></div><p><button class="btn ghost" id="csv">Descargar CSV</button></p></details></div>
      <div class="card"><h2>Embudo de uso</h2><p class="sub">De los visitantes del periodo, cuántos llegaron a cada paso (personas distintas por día).</p><div id="funnel" class="bars"></div></div>
      <div class="card"><h2>De dónde llegan</h2><p class="sub">Sitio de origen de la visita (Instagram, LinkedIn, WhatsApp, Google…).</p><div id="sources" class="bars"></div></div>
      <div class="card"><h2>Campañas (utm_source)</h2><p class="sub">Si compartes el enlace con ?utm_source=nombre, aparece aquí.</p><div id="campaigns" class="bars"></div></div>
      <div class="card"><h2>Países</h2><p class="sub">Según la red de Cloudflare.</p><div id="countries" class="bars"></div></div>
      <div class="card"><h2>Dispositivo</h2><p class="sub">Móvil, tableta o computadora.</p><div id="devices" class="bars"></div></div>
      <div class="card"><h2>Navegador</h2><p class="sub">&nbsp;</p><div id="browsers" class="bars"></div></div>
      <div class="card"><h2>Hora del día</h2><p class="sub">Visitantes por hora (Ecuador): el mejor momento para publicar.</p><div id="hours"></div></div>
      <div class="card"><h2>Web usada</h2><p class="sub">Cloudflare o GitHub Pages.</p><div id="sites" class="bars"></div></div>
      <div class="card wide"><h2>Sugerencias recibidas</h2><p class="sub">Del botón Sugerencias de la app, en el periodo.</p><div id="suggestions"></div></div>
    </div>
    <p class="hint" style="margin-top:18px">Datos anónimos: no se guardan IP, cookies ni cuentas. Cada visitante se cuenta con un código que cambia cada día, por eso una misma persona que vuelve otro día cuenta otra vez. Los bots conocidos no se cuentan.</p>
  </main>
</div>
<div class="tip" id="tip"></div>
<script>
(function () {
  var KEY = 'pv-admin-key', data = null;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('es-EC');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var LABELS = { visita: 'Visitaron la web', subir: 'Subieron un plano', dibujar: 'Dibujaron', construir: 'Construyeron en 3D', recorrido: 'Hicieron el recorrido', pro: 'Abrieron herramientas pro', exportar: 'Exportaron', sugerencia: 'Enviaron una sugerencia', video: 'Vieron el video' };
  var COUNTRY = { EC: 'Ecuador', CO: 'Colombia', PE: 'Perú', MX: 'México', US: 'Estados Unidos', ES: 'España', AR: 'Argentina', CL: 'Chile', VE: 'Venezuela', BO: 'Bolivia' };

  function show(logged) { $('login').hidden = logged; $('app').hidden = !logged; }
  function load() {
    var key = sessionStorage.getItem(KEY);
    if (!key) { show(false); return; }
    fetch('/api/admin/resumen?dias=' + $('range').value, { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { if (res.status === 401 || res.status === 429 || res.status === 503) { sessionStorage.removeItem(KEY); show(false); } $('loginErr').textContent = res.j.error || 'No se pudo cargar.'; return; }
        data = res.j; show(true); render();
      })
      .catch(function () { $('loginErr').textContent = 'Sin conexión.'; show(false); });
  }
  $('loginForm').onsubmit = function (e) { e.preventDefault(); sessionStorage.setItem(KEY, $('key').value); $('loginErr').textContent = ''; load(); };
  $('logout').onclick = function () { sessionStorage.removeItem(KEY); $('key').value = ''; show(false); };
  $('reload').onclick = load; $('range').onchange = load;

  function ev(name) { for (var i = 0; i < data.eventos.length; i++) if (data.eventos[i].evento === name) return data.eventos[i]; return { veces: 0, personas: 0 }; }
  function sum(arr, k) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i][k] || 0; return s; }
  function fmtDay(d) { var p = d.split('-'); return p[2] + '/' + p[1]; }

  function render() {
    var s = data.serie, today = s[s.length - 1] || { visitantes: 0 }, yesterday = s[s.length - 2] || { visitantes: 0 };
    $('period').textContent = 'Del ' + data.desde + ' al ' + data.hasta + ' · hora de Ecuador';
    var people = ev('visita').personas || sum(s, 'visitantes');
    var tiles = [
      ['Visitantes hoy', today.visitantes, 'ayer: ' + nf.format(yesterday.visitantes)],
      ['Visitantes del periodo', people, 'suma de cada día'],
      ['Páginas vistas', sum(s, 'visitas'), 'cargas de la web'],
      ['Primera vez', sum(s, 'nuevos'), 'navegadores nuevos'],
      ['Construyeron en 3D', ev('construir').personas, nf.format(ev('construir').veces) + ' veces'],
      ['Recorridos 3D', ev('recorrido').personas, nf.format(ev('recorrido').veces) + ' veces'],
      ['Exportaron', ev('exportar').personas, nf.format(ev('exportar').veces) + ' archivos'],
      ['Sugerencias', data.sugerencias.length, 'en el periodo']
    ];
    $('kpis').innerHTML = tiles.map(function (t) { return '<div class="kpi"><span>' + t[0] + '</span><strong>' + nf.format(t[1] || 0) + '</strong><small>' + esc(t[2]) + '</small></div>'; }).join('');
    columns($('chart'), s);
    $('dayTable').innerHTML = '<table><thead><tr><th>Día</th><th class="n">Visitantes</th><th class="n">Páginas</th><th class="n">Primera vez</th></tr></thead><tbody>' +
      s.slice().reverse().map(function (d) { return '<tr><td>' + d.dia + '</td><td class="n">' + d.visitantes + '</td><td class="n">' + d.visitas + '</td><td class="n">' + d.nuevos + '</td></tr>'; }).join('') + '</tbody></table>';
    var steps = ['visita', 'subir', 'dibujar', 'construir', 'recorrido', 'pro', 'exportar', 'video', 'sugerencia'];
    bars($('funnel'), steps.map(function (k) { return { nombre: LABELS[k], visitantes: ev(k).personas }; }), people, true);
    bars($('sources'), data.origenes);
    bars($('campaigns'), data.campanas);
    bars($('countries'), data.paises.map(function (c) { return { nombre: COUNTRY[c.nombre] || c.nombre, visitantes: c.visitantes }; }));
    bars($('devices'), data.dispositivos.map(function (c) { return { nombre: { movil: 'Móvil', tableta: 'Tableta', computadora: 'Computadora' }[c.nombre] || c.nombre, visitantes: c.visitantes }; }));
    bars($('browsers'), data.navegadores);
    bars($('sites'), data.sitios.map(function (c) { return { nombre: c.nombre === 'github' ? 'GitHub Pages' : c.nombre === 'cloudflare' ? 'Cloudflare' : c.nombre, visitantes: c.visitantes }; }));
    var hrs = []; for (var h = 0; h < 24; h++) hrs.push({ dia: (h < 10 ? '0' : '') + h + 'h', visitantes: 0, label: h + ':00' });
    data.horas.forEach(function (r) { hrs[r.hora].visitantes = r.visitantes; });
    columns($('hours'), hrs, true);
    $('suggestions').innerHTML = data.sugerencias.length ? data.sugerencias.map(function (g) {
      return '<div class="sug"><b>' + esc(g.tipo) + '</b>' + (g.valoracion ? ' · ' + '★'.repeat(g.valoracion) : '') + '<div>' + esc(g.mensaje) + '</div><div class="meta">' + esc(g.creada.slice(0, 16).replace('T', ' ')) + ' UTC' + (g.contacto ? ' · ' + esc(g.contacto) : '') + '</div></div>';
    }).join('') : '<p class="empty">Todavía no hay sugerencias en este periodo.</p>';
  }

  // Horizontal bars, single series (one hue), value at the tip.
  function bars(el, rows, base, pct) {
    rows = (rows || []).filter(function (r) { return r.visitantes > 0 || pct; });
    if (!rows.length) { el.innerHTML = '<p class="empty">Sin datos todavía.</p>'; return; }
    var max = base || Math.max.apply(null, rows.map(function (r) { return r.visitantes; })) || 1;
    el.innerHTML = rows.map(function (r) {
      var w = Math.max(0, Math.min(100, 100 * r.visitantes / max));
      var v = nf.format(r.visitantes) + (pct && base ? ' · ' + Math.round(100 * r.visitantes / base) + '%' : '');
      return '<div class="row" title="' + esc(r.nombre) + ': ' + v + '"><span class="name">' + esc(r.nombre) + '</span><span class="track"><span class="fill" style="width:' + w + '%"></span></span><span class="val">' + v + '</span></div>';
    }).join('');
  }

  // Columns from one baseline, 4px rounded tops, hairline grid, tooltip on hover.
  function columns(el, rows, compact) {
    var W = el.clientWidth || 900, H = compact ? 150 : 220, L = 34, B = 22, T = 10;
    var max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.visitantes; })));
    // Clean ticks: a 1-2-5 step that gives about four gridlines.
    var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), unit = [1, 2, 5, 10].map(function (k) { return k * mag; }).filter(function (k) { return k >= raw; })[0];
    unit = Math.max(1, unit); var ticks = Math.ceil(max / unit), top = ticks * unit;
    var n = rows.length, slot = (W - L) / n, bw = Math.max(2, Math.min(24, slot - 2));
    var y = function (v) { return T + (H - T - B) * (1 - v / top); };
    var svg = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Visitantes por ' + (compact ? 'hora' : 'día') + '">';
    for (var g = 0; g <= ticks; g++) { var v = unit * g, yy = y(v); svg += '<line x1="' + L + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" stroke="#edf2ef"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + nf.format(Math.round(v)) + '</text>'; }
    var every = Math.ceil(n / (compact ? 12 : 10));
    rows.forEach(function (r, i) {
      var x = L + i * slot + (slot - bw) / 2, h = (H - T - B) * (r.visitantes / top), yy = H - B - h, rad = Math.min(4, h, bw / 2);
      if (h > 0) svg += '<path d="M' + x + ',' + (H - B) + 'V' + (yy + rad) + 'Q' + x + ',' + yy + ' ' + (x + rad) + ',' + yy + 'H' + (x + bw - rad) + 'Q' + (x + bw) + ',' + yy + ' ' + (x + bw) + ',' + (yy + rad) + 'V' + (H - B) + 'Z" fill="#0f9467"/>';
      svg += '<rect class="hit" data-i="' + i + '" x="' + (L + i * slot) + '" y="' + T + '" width="' + slot + '" height="' + (H - T) + '" fill="transparent"/>';
      if (i % every === 0 || (!compact && i === n - 1)) svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + (compact ? r.dia : fmtDay(r.dia)) + '</text>';
    });
    svg += '<line x1="' + L + '" x2="' + W + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="#cfdad4"/></svg>';
    el.innerHTML = svg;
    var tip = $('tip');
    el.querySelectorAll('.hit').forEach(function (h) {
      h.onmousemove = function (e) {
        var r = rows[+h.dataset.i];
        tip.innerHTML = compact ? '<b>' + r.label + '</b> · ' + nf.format(r.visitantes) + ' visitantes' : '<b>' + r.dia + '</b><br>' + nf.format(r.visitantes) + ' visitantes · ' + nf.format(r.visitas) + ' páginas · ' + nf.format(r.nuevos) + ' primera vez';
        tip.style.display = 'block'; tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 10) + 'px';
      };
      h.onmouseleave = function () { tip.style.display = 'none'; };
    });
  }

  $('csv').onclick = function () {
    if (!data) return;
    var rows = [['dia', 'visitantes', 'paginas', 'primera_vez']].concat(data.serie.map(function (d) { return [d.dia, d.visitantes, d.visitas, d.nuevos]; }));
    var blob = new Blob(['﻿' + rows.map(function (r) { return r.join(';'); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plano-vivo-visitas-' + data.hasta + '.csv'; a.click();
  };
  var resizeTimer; window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (data) render(); }, 200); });
  load();
})();
</script>
</body>
</html>`;
