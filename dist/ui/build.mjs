// Importing plan images/PDFs and reconstructing walls from them,
// either in the browser (detect-worker.mjs) or with the local Python engine.
import {
  $,
  num,
  W,
  H,
  T,
  uid,
  say,
  localEngine,
  state,
  viewer,
  checkpoint,
  syncHistory,
  snapshot,
  confirmChange,
} from './core.mjs';
import { rebuild, restore, setView, clearProject } from './model.mjs';
import { resetPlan } from './plan.mjs';

const MAX_UPLOAD = 20 * 1024 * 1024;
const MAX_SIDE = 4096; // longest side kept for analysis, in pixels
const PYTHON_POLL_MS = 650;

// Controls disabled while a reconstruction is running.
const BUSY_CONTROLS = [
  'build',
  'load',
  'new',
  'demo',
  'save',
  'undo',
  'redo',
  'calibrate',
  'width',
  'depth',
  'height',
  'thickness',
  'applyElement',
  'deleteElement',
  'versions',
  'file',
  'walk',
  'pageNumber',
];

function setBusy(value) {
  state.busy = value;
  document.body.classList.toggle('busy', value);
  $('buildProgress').hidden = !value;
  for (const id of BUSY_CONTROLS) $(id).disabled = value;
  if (!value) {
    $('depth').disabled = !!state.bg;
    syncHistory();
    $('walk').disabled = !state.walls.length;
  }
}

function progress(value, text) {
  $('progress').value = value;
  $('progressText').textContent = text;
}

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Render the first page of a PDF to a data URL with PDF.js. */
async function renderPdfPage(file) {
  const pdfjs = await import('../vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1),
    base = page.getViewport({ scale: 1 }),
    viewport = page.getViewport({
      scale: Math.min(4, MAX_SIDE / Math.max(base.width, base.height)),
    }),
    c = document.createElement('canvas');
  c.width = viewport.width;
  c.height = viewport.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
  const src = c.toDataURL();
  await pdf.destroy();
  return src;
}

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(f.result);
    f.onerror = rej;
    f.readAsDataURL(file);
  });
}

/** Draw `image` on a white canvas, scaled so its longest side is at most MAX_SIDE. */
function flatten(image, options) {
  const c = document.createElement('canvas'),
    factor = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  c.width = Math.max(1, Math.round(image.width * factor));
  c.height = Math.max(1, Math.round(image.height * factor));
  const g = c.getContext('2d', options);
  g.fillStyle = 'white';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(image, 0, 0, c.width, c.height);
  return { canvas: c, context: g };
}

async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** Ask the Python engine how many pages a PDF has, to fill the page selector. */
async function inspectPdf(file) {
  $('pageLabel').hidden = !file.name.toLowerCase().endsWith('.pdf');
  $('pageNumber').value = 1;
  if ($('pageLabel').hidden) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await fetch('/api/inspect', { method: 'POST', body: form });
    if (response.ok) {
      const info = await response.json();
      $('pageNumber').max = info.pages;
      $('filename').textContent = file.name + ' · ' + info.pages + ' páginas';
    }
  } catch {}
}

async function importFile(file) {
  if (!file || state.busy) return;
  if (file.size > MAX_UPLOAD) {
    say('El archivo supera los 20 MB.');
    return;
  }
  const epoch = ++state.loadEpoch;
  say('Abriendo plano…');
  try {
    const src = isPdf(file) ? await renderPdfPage(file) : await readAsDataURL(file);
    const image = await loadImage(flatten(await loadImage(src)).canvas.toDataURL('image/png'));
    if (epoch !== state.loadEpoch) return; // a newer file was chosen meanwhile
    if (image.height / image.width < 0.05 || image.height / image.width > 20) throw Error();
    if (
      state.walls.length &&
      !(await confirmChange(
        'Abrir un nuevo plano',
        'Se guardará una versión local del proyecto actual. El nuevo plano reemplazará el modelo de la mesa de trabajo.',
      ))
    )
      return;
    await snapshot();
    checkpoint();
    clearProject();
    state.bg = image;
    state.sourceFile = file;
    state.scaleAssumed = true;
    $('width').value = 12;
    $('depth').value = ((12 * image.height) / image.width).toFixed(4);
    $('filename').textContent = file.name + (file.type === 'application/pdf' ? ' · página 1' : '');
    $('projectName').value = file.name.replace(/\.[^.]+$/, '').slice(0, 80);
    $('scaleHint').textContent =
      'Escala inicial supuesta. Introduce el ancho real o calibra con dos puntos.';
    resetPlan();
    rebuild();
    viewer.reset();
    setView('split');
    if (localEngine) await inspectPdf(file);
    say(
      'Imagen lista. Pulsa Construir en 3D; después revisa la escala y los elementos propuestos.',
    );
  } catch {
    say('No se pudo abrir el archivo. Usa PNG, JPG, WEBP o un PDF sin contraseña.');
  } finally {
    $('file').value = '';
  }
}

/** Use a recognised scale unless the user already set one (typed width or calibration). */
function applyScale(scale) {
  if (!scale || !state.scaleAssumed) return false;
  const width = Math.round(scale.sheetWidth * 100) / 100;
  if (!(width >= 1 && width <= 300)) return false;
  const depth = (width * state.bg.height) / state.bg.width;
  if (!(depth >= 1 && depth <= 300)) return false;
  $('width').value = width;
  $('depth').value = depth.toFixed(4);
  $('scaleHint').textContent =
    scale.source === 'bar'
      ? 'Escala leída de la barra gráfica del plano. Compruébala con una medida conocida.'
      : 'Escala estimada por el ancho de las puertas. Compruébala con una medida conocida.';
  state.scaleAssumed = false;
  return true;
}

/** Replace the model with a recognition result (walls, openings, stairs, terraces). */
function applyRecognition(result) {
  applyScale(result.scale);
  const clampT = (t) => Math.min(1, Math.max(0.05, Math.round(t * 1000) / 1000));
  state.walls = result.walls.map(({ thicknessRatio, ...w }) => ({
    ...w,
    id: uid(),
    ...(thicknessRatio ? { thickness: clampT(thicknessRatio * W()) } : {}),
  }));
  state.features = (result.features || []).map((f) => ({ ...f, id: uid() }));
  state.selected = null;
  state.report = result.notes.join(' ');
}

function summary(result) {
  const s = result.stats;
  if (result.engine !== 'plan')
    return (
      'Modelo 3D generado: ' +
      s.segments +
      ' segmentos y ' +
      s.openings +
      ' aberturas propuestas. Revisa la correspondencia con la imagen en Vista dual.'
    );
  const n = (count, one, many) => (count ? `${count} ${count === 1 ? one : many}` : ''),
    parts = [
      n(s.walls, 'muro', 'muros'),
      n(s.doors, 'puerta', 'puertas'),
      n(s.passages, 'paso', 'pasos'),
      n(s.windows, 'ventana', 'ventanas'),
      n(s.stairs, 'escalera', 'escaleras'),
      n(s.terraces, 'terraza', 'terrazas'),
      n(s.furniture, 'mueble', 'muebles'),
      n(s.labels, 'texto', 'textos'),
    ].filter(Boolean);
  return `Plano reconocido: ${parts.join(', ')}. Revisa los elementos resaltados en Vista dual.`;
}

/** Browser reconstruction: run the recogniser in a worker on the background image. */
function constructInBrowser() {
  setBusy(true);
  progress(5, 'Preparando la imagen…');
  const { canvas: c, context: g } = flatten(state.bg, { willReadFrequently: true });
  const pixels = g.getImageData(0, 0, c.width, c.height).data;
  const stop = () => {
    state.worker?.terminate();
    state.worker = null;
  };
  try {
    state.worker = new Worker(new URL('../detect-worker.mjs', import.meta.url), {
      type: 'module',
    });
    state.worker.onmessage = (e) => {
      if (e.data.progress) {
        progress(e.data.progress, e.data.message);
        return;
      }
      stop();
      if (e.data.error) {
        setBusy(false);
        say('No se pudo analizar el plano. Puedes dibujar sobre la imagen.');
        return;
      }
      const result = e.data.result;
      if (!result.walls.length) {
        setBusy(false);
        say(result.notes[0]);
        return;
      }
      checkpoint();
      applyRecognition(result);
      rebuild();
      setBusy(false);
      viewer.reset();
      setView('model');
      say(summary(result));
      if (localEngine && result.engine === 'plan') readTexts(c, result);
    };
    state.worker.onerror = () => {
      stop();
      setBusy(false);
      say('El análisis no pudo completarse. El modelo anterior se conserva.');
    };
    state.worker.postMessage({ pixels, width: c.width, height: c.height, worldWidth: W() }, [
      pixels.buffer,
    ]);
  } catch {
    setBusy(false);
    say('No se pudo iniciar el análisis en este navegador.');
  }
}

/**
 * With the local Python engine, read (OCR) the text areas found by the recogniser.
 * Each area is read on its own, enlarged, so small room numbers can be read too.
 * Areas it cannot read stay as the picture of the plan's text.
 */
async function readTexts(canvas, result) {
  // The user may edit or rebuild while OCR runs: only apply to the same result.
  const before = state.features,
    labels = before.filter((f) => f.type === 'label');
  if (!labels.length) return;
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')),
      form = new FormData();
    form.append('file', blob, 'plano.png');
    form.append('boxes', JSON.stringify(labels.map((f) => [f.x, f.y, f.x + f.w, f.y + f.h])));
    const response = await fetch('/api/ocr', { method: 'POST', body: form });
    if (!response.ok) return;
    const { texts } = await response.json();
    if (!texts.length || state.features !== before) return;
    const read = new Map(texts.map((t) => [labels[t.index], t.text]));
    state.features = before.map((f) => (read.has(f) ? { ...f, text: read.get(f) } : f));
    rebuild();
    say(summary(result) + ` Textos leídos con OCR: ${texts.length} de ${labels.length}.`);
  } catch {
    // OCR is an extra: the model stands without it.
  }
}

const cancelJob = (id) => fetch('/api/jobs/' + id + '/cancel', { method: 'POST' }).catch(() => {});

/** Python reconstruction: submit a job to backend/server.py and poll until it finishes. */
async function constructPython() {
  // Each run gets a number; cancelling bumps state.pythonRun so stale polls stop.
  const run = ++state.pythonRun;
  setBusy(true);
  progress(2, 'Enviando al motor de este computador…');
  try {
    const original = state.sourceFile,
      file =
        original ||
        new File([await (await fetch(state.bg.src)).blob()], 'plano.png', { type: 'image/png' }),
      form = new FormData();
    form.append('file', file);
    form.append('page', String(original ? num('pageNumber') || 1 : 1));
    form.append('width', W());
    form.append('height', H());
    form.append('thickness', T());
    const response = await fetch('/api/jobs', { method: 'POST', body: form });
    if (!response.ok) {
      const error = await response.json();
      throw Error(
        typeof error.detail === 'string'
          ? error.detail
          : 'Revisa el archivo y el número de página.',
      );
    }
    const job = await response.json();
    state.pythonJob = job.id;
    if (run !== state.pythonRun) {
      cancelJob(job.id);
      return;
    }
    while (run === state.pythonRun) {
      const statusResponse = await fetch('/api/jobs/' + job.id);
      if (!statusResponse.ok) throw Error('No se pudo consultar el análisis.');
      const status = await statusResponse.json();
      if (run !== state.pythonRun) return;
      progress(status.progress, status.message);
      if (status.status === 'failed') throw Error(status.message);
      if (status.status === 'cancelled') return;
      if (status.status === 'succeeded') {
        checkpoint();
        const name = $('projectName').value,
          filename = $('filename').textContent;
        await restore({ ...status.result, name, filename });
        state.sourceFile = original;
        setView('model');
        say(
          'Construcción Python lista: ' +
            status.result.walls.length +
            ' elementos y ' +
            (status.result.analysis.texts?.length || 0) +
            ' textos leídos. Revisa los elementos propuestos.',
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, PYTHON_POLL_MS));
    }
  } catch (error) {
    if (run === state.pythonRun)
      say('Motor Python: ' + error.message + ' El modelo anterior se conserva.');
  } finally {
    if (run === state.pythonRun) {
      state.pythonJob = null;
      setBusy(false);
    }
  }
}

$('file').onchange = (e) => importFile(e.target.files[0]);
document.querySelector('.upload').onkeydown = (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('file').click();
  }
};

$('build').onclick = async () => {
  if (state.busy) return;
  if (!state.bg) {
    if (state.walls.length) {
      viewer.reset();
      setView('model');
      say('Tu plano dibujado ya está construido en 3D. Puedes seguir editándolo en Vista dual.');
    } else say('Sube una imagen o dibuja paredes para construir el modelo.');
    return;
  }
  if (
    state.walls.length &&
    !(await confirmChange(
      'Reconstruir desde la imagen',
      'Se guardará una versión del modelo actual. La nueva detección reemplazará las paredes; puedes deshacer el cambio.',
    ))
  )
    return;
  await snapshot();
  // The Python engine reads PDF vectors and text directly; raster images use the
  // plan recogniser, which runs in the browser in both modes.
  if (localEngine && state.sourceFile && isPdf(state.sourceFile)) await constructPython();
  else constructInBrowser();
};

$('cancelBuild').onclick = () => {
  state.pythonRun++;
  if (state.pythonJob) cancelJob(state.pythonJob);
  state.pythonJob = null;
  state.worker?.terminate();
  state.worker = null;
  setBusy(false);
  say('Construcción cancelada. Se conservó el modelo anterior.');
};

$('acceptReview').onclick = () => {
  checkpoint();
  state.walls.forEach((w) => (w.inferred = false));
  state.report = null;
  rebuild();
  say('Elementos marcados como revisados por ti.');
};
