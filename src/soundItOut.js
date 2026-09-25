/**
 * "Sound It Out" panel — tap a word to decode it one sound at a time.
 *
 * The graphemes are shown with the workbook colour coding. Each time the
 * child adds a sound, its recording plays and it is blended onto the sounds
 * before it — cumulative grapheme blending (LiftOff Stage 3). Tiles can be
 * tapped to hear a sound again, and 🔊 plays the whole word once the child
 * has had a go (or straight away with "Just hear the word" — keeping the
 * story moving matters more than finishing every blend). Sight words are
 * heard as whole words.
 */

import { toGraphemes, blendSteps, suffixHint } from './graphemes.js';
import { assignSounds } from './phonemes.js';
import { playSound, playSounds, preload, say, soundOn, stopAudio } from './audio.js';
import { esc, segHtml, wordHtml } from './render.js';
import { isSightWord } from './sightWords.js';
import { store } from './store.js';

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
  stopAudio();
  panel.hidden = true;
  document.body.classList.remove('sio-open');
  document.querySelectorAll('.w.is-active').forEach((w) => w.classList.remove('is-active'));
  panel.returnFocus?.focus?.();
}

/**
 * @param {{segs:Array, text:string, word:string}} word parsed word
 * @param {HTMLElement} [from] element to return focus to
 * @param {{backLabel?:string, onBack?:()=>void}} [opts] the way back to what the
 *   child was doing ("Back to my story", or "Continue reading" when narration
 *   was paused to open this)
 */
export function openSoundItOut(word, from, opts = {}) {
  const p = ensurePanel();
  p.returnFocus = from ?? null;
  const graphemes = assignSounds(toGraphemes(word.segs), word.word);
  const steps = blendSteps(graphemes);
  const hint = suffixHint(word.word);
  const uncoded = word.segs.every((s) => s.kind === 'plain' && !s.cue);
  const sight = uncoded && isSightWord(word.word);
  const audio = soundOn();
  let shown = 0;
  preload(graphemes.map((g) => g.sound));

  const tiles = graphemes
    .map(
      (g, i) =>
        `<button type="button" class="tile tile--${g.kind}${g.cue ? ' has-cue' : ''}${g.sound ? '' : ' is-quiet'}" data-i="${i}"
           aria-label="${g.sound ? `Hear the sound for ${esc(g.text)}` : `${esc(g.text)} is silent`}">${segHtml({ ...g, text: g.text })}</button>`,
    )
    .join('');

  p.innerHTML = `
    <div class="sio-inner">
      <button class="sio-close" type="button" aria-label="Close">✕</button>
      <p class="sio-label">Sound it out</p>
      <div class="sio-word" aria-hidden="true">${wordHtml({ segs: word.segs.map((s) => ({ ...s, text: s.text.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, '') })) })}</div>
      ${
        sight
          ? `<p class="sio-sight">⭐ This is a <strong>sight word</strong>: we learn it by looking at the whole word.${audio ? ' Let’s listen to it, then say it together.' : ' Say it together with a grown-up.'}</p>`
          : `<div class="sio-tiles" aria-label="Sounds in this word">${tiles}</div>`
      }
      ${
        !sight && graphemes.some((g) => !g.sound)
          ? '<p class="sio-note">Grey letters are silent — skip them.</p>'
          : ''
      }
      ${!sight && audio ? '<p class="sio-note">Tap a sound to hear it.</p>' : ''}
      <ol class="sio-ladder" aria-live="polite" ${sight ? 'hidden' : ''}></ol>
      <div class="sio-actions">
        ${sight ? '' : '<button class="btn btn--primary sio-next" type="button">Add a sound ▶</button>'}
        ${sight ? '' : '<button class="btn btn--ghost sio-again" type="button" hidden>Start again ↺</button>'}
        ${audio && !sight ? '<button class="btn btn--ghost sio-sounds" type="button" hidden>🔈 All the sounds</button>' : ''}
        ${audio ? `<button class="btn ${sight ? 'btn--primary' : 'btn--ghost'} sio-say" type="button">🔊 ${sight ? 'Hear the word' : 'Just hear the word'}</button>` : ''}
      </div>
      ${opts.backLabel ? `<button class="btn btn--ghost sio-back" type="button">${esc(opts.backLabel)}</button>` : ''}
      ${
        hint
          ? `<details class="sio-hint"><summary>💡 Stuck? Look inside the word</summary>
               <p>Can you see a word you know? <strong>${esc(hint.base)}</strong> + <strong>${esc(hint.suffix)}</strong></p>
             </details>`
          : ''
      }
      <details class="sio-grownup"><summary>👪 How to help</summary>
        <p>${sight ? 'Say the word together, then find it again in the story.' : 'Point to each sound and let your child say it first, then tap to check. Blend as you go: m… ma… map.'}
        If they are tired or stuck, just tell them the word and keep the story moving.</p></details>
    </div>`;

  const ladder = p.querySelector('.sio-ladder');
  const next = p.querySelector('.sio-next');
  const again = p.querySelector('.sio-again');
  const sayBtn = p.querySelector('.sio-say');
  const soundsBtn = p.querySelector('.sio-sounds');
  const sounding = graphemes.map((g, i) => (g.sound ? i : -1)).filter((i) => i >= 0);
  const rate = () => Math.min(store.prefs.rate ?? 0.85, 0.85);

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
    if (next) next.hidden = done;
    if (again) again.hidden = !done;
    // Before blending the whole word is a quiet escape route; after, it's the check.
    if (sayBtn && !sight) {
      sayBtn.innerHTML = done ? '🔊 Hear the word' : '🔊 Just hear the word';
      sayBtn.classList.toggle('sio-escape', !done);
    }
    if (soundsBtn) soundsBtn.hidden = !done;
    if (done && steps.length) {
      ladder.insertAdjacentHTML(
        'beforeend',
        `<li class="sio-done">Now say the whole word${audio ? ', then tap 🔊 to check' : ''}. Does it make sense in the sentence?</li>`,
      );
    }
  };

  next?.addEventListener('click', () => {
    shown = Math.min(steps.length, shown + 1);
    render();
    playSound(graphemes[sounding[shown - 1]]?.sound);
  });
  again?.addEventListener('click', () => {
    shown = 0;
    render();
    next.focus();
  });
  p.querySelectorAll('.tile').forEach((t) =>
    t.addEventListener('click', () => {
      const g = graphemes[Number(t.dataset.i)];
      t.classList.add('is-tapped');
      setTimeout(() => t.classList.remove('is-tapped'), 300);
      playSound(g.sound);
    }),
  );
  soundsBtn?.addEventListener('click', () => playSounds(graphemes.map((g) => g.sound)));
  sayBtn?.addEventListener('click', () => say(word.word, { rate: rate() }));
  p.querySelector('.sio-close').addEventListener('click', closeSoundItOut);
  p.querySelector('.sio-back')?.addEventListener('click', () => {
    closeSoundItOut();
    opts.onBack?.();
  });

  render();
  p.hidden = false;
  document.body.classList.add('sio-open'); // room to scroll the word above the panel
  (sight ? sayBtn ?? p.querySelector('.sio-close') : next).focus({ preventScroll: true });

  // Keep the tapped word in sight, just above the panel, so the child can
  // see it in its sentence while blending.
  if (from?.isConnected) {
    const r = from.getBoundingClientRect();
    const panelTop = p.getBoundingClientRect().top;
    if (r.bottom > panelTop - 16) {
      window.scrollBy({
        top: r.bottom - panelTop + 32,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  }
}
