// "Compartir": a link (?p=<id>) to a copy of the project, without the plan image.
// Opening a link keeps a local version of whatever the visitor had open before.
import { $, say, state, project, snapshot } from './core.mjs';
import { restore } from './model.mjs';
import { track } from './stats.mjs';

const HOSTED = 'https://plano-vivo.fleremiasflemin.workers.dev';
const API =
  (location.origin === HOSTED || /^http:\/\/localhost:8788$/.test(location.origin) ? '' : HOSTED) +
  '/api/compartir';
const linkBase =
  location.origin === HOSTED ||
  location.hostname.endsWith('github.io') ||
  /localhost:8788$/.test(location.host)
    ? location.origin + location.pathname
    : HOSTED + '/';

$('share').onclick = () => {
  $('shareLink').value = '';
  $('shareCopy').hidden = true;
  $('shareCreate').hidden = false;
  $('shareCreate').disabled = !state.walls.length;
  $('shareInfo').textContent = state.walls.length
    ? 'Creamos un enlace con una copia de este proyecto (sin la imagen del plano). Quien lo abra puede verlo y editar su propia copia.'
    : 'Dibuja o crea un plano primero.';
  $('shareDialog').showModal();
};
$('shareClose').onclick = () => $('shareDialog').close();
$('shareCreate').onclick = async () => {
  $('shareCreate').disabled = true;
  $('shareInfo').textContent = 'Creando el enlace…';
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto: project() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw Error(j.error || 'No se pudo crear el enlace.');
    $('shareLink').value = linkBase + '?p=' + j.id;
    $('shareLink').select();
    $('shareInfo').textContent = 'Listo. Cualquiera con este enlace puede ver el proyecto.';
    $('shareCreate').hidden = true;
    $('shareCopy').hidden = false;
    track('compartir');
  } catch (e) {
    $('shareInfo').textContent = e.message;
    $('shareCreate').disabled = false;
  }
};
$('shareCopy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('shareLink').value);
    $('shareInfo').textContent = 'Enlace copiado.';
  } catch {
    $('shareLink').select();
  }
};

/** Open ?p=<id> once the app has started. */
export async function openShared() {
  const id = new URLSearchParams(location.search).get('p');
  if (!id || !/^[A-Za-z0-9]{12}$/.test(id)) return false;
  try {
    const r = await fetch(API + '/' + id);
    if (!r.ok)
      throw Error((await r.json().catch(() => ({}))).error || 'No se pudo abrir el enlace.');
    const data = await r.json();
    if (state.walls.length) await snapshot();
    await restore(data);
    say('Proyecto compartido abierto. Tu proyecto anterior quedó en «Versiones locales».');
    history.replaceState(null, '', location.pathname);
    return true;
  } catch (e) {
    say(e.message);
    return false;
  }
}
