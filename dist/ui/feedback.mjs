// "Sugerencias" form: visitors send ideas, problems and opinions without an account.
// Stored by the Cloudflare Worker (worker/index.js) in D1. Also the presentation video.
import { $ } from './core.mjs';

const HOSTED = 'https://plantea-3d.fleremiasflemin.workers.dev';
// Same origin on Cloudflare; GitHub Pages and the local Python engine post there.
const ENDPOINT = (location.origin === HOSTED ? '' : HOSTED) + '/api/sugerencias';
export const VERSION = '2026-11';

const dialog = $('feedbackDialog'),
  form = $('feedbackForm'),
  result = $('feedbackResult');

$('feedback').onclick = () => {
  result.textContent = '';
  form.hidden = false;
  $('feedbackDone').hidden = true;
  dialog.showModal();
  $('feedbackMessage').focus();
};
$('feedbackCancel').onclick = $('feedbackClose').onclick = () => dialog.close();

form.onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form)),
    send = $('feedbackSend');
  send.disabled = true;
  result.textContent = 'Enviando…';
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, version: VERSION }),
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(answer.error || 'No se pudo enviar.');
    form.reset();
    form.hidden = true;
    $('feedbackDone').hidden = false;
  } catch (error) {
    result.textContent =
      (error instanceof TypeError ? 'Sin conexión con el buzón.' : error.message) +
      ' Inténtalo de nuevo en un momento.';
  } finally {
    send.disabled = false;
  }
};

// Presentation video: what Plantea 3D does, feature by feature.
$('tour').onclick = () => {
  $('tourDialog').showModal();
  $('tourVideo')
    .play()
    .catch(() => {});
};
$('closeTour').onclick = () => $('tourDialog').close();
$('tourDialog').addEventListener('close', () => $('tourVideo').pause());
