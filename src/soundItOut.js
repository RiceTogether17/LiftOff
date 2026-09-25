/**
 * "Sound It Out" panel — the visual (no audio) replacement for PhonicsQuest's
 * tap-to-hear decoder.
 *
 * It follows LiftOff's own rules: the app never says the sound (Rule 1) and
 * never gives the word away (Rule 2). The child sees the graphemes coloured
 * with the workbook coding, then reveals one sound at a time and blends it
 * onto the sounds before it — cumulative grapheme blending, Stage 3.
 */

import { toGraphemes, blendSteps, suffixHint } from './graphemes.js';
import { esc, segHtml, wordHtml } from './render.js';
import { isSightWord } from './sightWords.js';

let panel = null;

function ensurePanel() {
  if (panel) return panel;
  panel = document.createElement('aside');
  panel.className = 'sio';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Sound it out');
  panel.hidden = true;
  document.body.appendChild(panel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSoundItOut();
  });
  return panel;
}

export function closeSoundItOut() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  document.querySelectorAll('.w.is-active').forEach((w) => w.classList.remove('is-active'));
  panel.returnFocus?.focus?.();
}

/**
 * @param {{segs:Array, text:string, word:string}} word parsed word
 * @param {HTMLElement} [from] element to return focus to
 */
export function openSoundItOut(word, from) {
  const p = ensurePanel();
  p.returnFocus = from ?? null;
  const graphemes = toGraphemes(word.segs);
  const steps = blendSteps(graphemes);
  const hint = suffixHint(word.word);
  const uncoded = word.segs.every((s) => s.kind === 'plain' && !s.cue);
  const sight = uncoded && isSightWord(word.word);
  let shown = 0;

  const tiles = graphemes
    .map(
      (g, i) =>
        `<span class="tile tile--${g.kind}${g.cue ? ' has-cue' : ''}" data-i="${i}">${segHtml({ ...g, text: g.text })}</span>`,
    )
    .join('');

  p.innerHTML = `
    <div class="sio-inner">
      <button class="sio-close" type="button" aria-label="Close">✕</button>
      <p class="sio-label">Sound it out</p>
      <div class="sio-word" aria-hidden="true">${wordHtml({ segs: word.segs.map((s) => ({ ...s, text: s.text.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, '') })) })}</div>
      ${
        sight
          ? `<p class="sio-sight">⭐ <strong>Sight word</strong> — look at the whole word. You know this one by sight!</p>`
          : `<div class="sio-tiles" aria-label="Sounds in this word">${tiles}</div>`
      }
      ${
        graphemes.some((g) => g.kind === 'silent' && !g.cue)
          ? '<p class="sio-note">Grey letters are silent — skip them.</p>'
          : ''
      }
      <ol class="sio-ladder" aria-live="polite" ${sight ? 'hidden' : ''}></ol>
      <div class="sio-actions" ${sight ? 'hidden' : ''}>
        <button class="btn btn--primary sio-next" type="button">Add a sound ▶</button>
        <button class="btn btn--ghost sio-again" type="button" hidden>Start again ↺</button>
      </div>
      ${
        hint
          ? `<details class="sio-hint"><summary>💡 Stuck? Look inside the word</summary>
               <p>Can you see a word you know? <strong>${esc(hint.base)}</strong> + <strong>${esc(hint.suffix)}</strong></p>
             </details>`
          : ''
      }
    </div>`;

  const ladder = p.querySelector('.sio-ladder');
  const next = p.querySelector('.sio-next');
  const again = p.querySelector('.sio-again');
  const sounding = graphemes.map((g, i) => (g.kind === 'silent' && !g.cue ? -1 : i)).filter((i) => i >= 0);

  const render = () => {
    ladder.innerHTML = steps
      .slice(0, shown)
      .map((s, i) => `<li class="${i === shown - 1 ? 'is-new' : ''}">${esc(s)}</li>`)
      .join('<li class="arrow" aria-hidden="true">→</li>');
    p.querySelectorAll('.tile').forEach((t) => {
      const idx = Number(t.dataset.i);
      const order = sounding.indexOf(idx);
      t.classList.toggle('is-lit', order > -1 && order < shown);
      t.classList.toggle('is-current', order === shown - 1);
    });
    const done = shown >= steps.length;
    next.hidden = done;
    again.hidden = !done;
    if (done && steps.length) {
      ladder.insertAdjacentHTML(
        'beforeend',
        '<li class="sio-done">Now say the whole word. Does it make sense in the sentence?</li>',
      );
    }
  };

  next.addEventListener('click', () => {
    shown = Math.min(steps.length, shown + 1);
    render();
  });
  again.addEventListener('click', () => {
    shown = 0;
    render();
    next.focus();
  });
  p.querySelector('.sio-close').addEventListener('click', closeSoundItOut);

  render();
  p.hidden = false;
  (sight ? p.querySelector('.sio-close') : next).focus();
}
