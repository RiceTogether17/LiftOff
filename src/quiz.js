/**
 * The workbook's own comprehension activities, made interactive — and
 * forgiving. Every scored question follows the same path:
 *
 *   choose → Check → (not quite) look at the clue in the story → try again
 *          → (still not) the answer, with the sentence that shows it
 *
 * Answers are saved as they happen, so changing a setting, leaving the story
 * or closing the tablet never loses them. For grown-ups, "right first time"
 * and "worked out with a clue" are recorded separately.
 *
 *   tf    True / False            mc    Multiple choice
 *   cloze Word-bank gap fill      order Put events in order
 *   qa    Written / spoken answer (think, then compare with a model answer)
 *   talk  Talk about it           (discussion prompt, no marking)
 */

import { esc } from './render.js';
import { store } from './store.js';
import { say, soundOn } from './audio.js';
import { findClue } from './clue.js';

const SCORED = new Set(['tf', 'mc', 'cloze', 'order']);

/** Checks allowed before the answer is shown. */
const maxTries = (q) => (q.type === 'mc' ? Math.max(2, q.options.length - 1) : 2);

function sayBtn(text) {
  if (!soundOn()) return '';
  const spoken = text.replace(/_{2,}/g, ', blank, ');
  return `<button class="q-say" type="button" data-say="${esc(spoken)}" aria-label="Read the question aloud">🔊</button>`;
}

function shuffle(list, seed) {
  // Stable shuffle so the order doesn't jump around on re-render.
  const a = [...list];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');

/** The text that best locates the answer in the story. */
function clueFor(story, q) {
  if (q.type === 'tf') return findClue(story, q.prompt);
  if (q.type === 'mc') return findClue(story, q.prompt, q.options[q.answer] ?? '');
  if (q.type === 'cloze') return findClue(story, q.prompt.replace(/_{3,}/g, ' '), q.answers.join(' '));
  if (q.type === 'qa') return findClue(story, q.prompt, q.answer);
  return null;
}

function answerText(q) {
  if (q.type === 'tf') return q.answer ? 'True' : 'False';
  if (q.type === 'mc') return q.options[q.answer];
  if (q.type === 'cloze') return q.answers.join(', ');
  if (q.type === 'order')
    return [...q.items]
      .sort((a, b) => a.position - b.position)
      .map((it) => it.text)
      .join(' → ');
  return '';
}

/**
 * @param {HTMLElement} container
 * @param {object} story
 * @param {{onLook?:(clue:object, back:HTMLElement)=>void, onComplete?:(r:{firstTry:number,withHelp:number,total:number})=>void}} [hooks]
 */
export function renderQuiz(container, story, hooks = {}) {
  const qs = story.quiz;
  if (!qs.length) {
    container.innerHTML = '';
    return;
  }
  const saved = store.quiz(story.id);
  const state = qs.map((q, i) => structuredClone(saved?.answers?.[i] ?? {}));
  const scored = qs.map((q, i) => i).filter((i) => SCORED.has(qs[i].type));
  const clues = qs.map((q) => clueFor(story, q));

  container.innerHTML = `
    <section class="quiz" aria-labelledby="quiz-title">
      <h3 id="quiz-title">${qs.every((q) => q.type === 'talk') ? '💬 Talk about it' : '✏️ Check your understanding'}</h3>
      <p class="quiz-intro">Take your time. If you're not sure, you can look back at the story.</p>
      <ol class="quiz-list">${qs.map((q, i) => `<li class="q q--${q.type}" data-i="${i}"></li>`).join('')}</ol>
      <div class="quiz-score" aria-live="polite" hidden></div>
    </section>`;
  const scoreEl = container.querySelector('.quiz-score');

  const persist = (i) => store.saveAnswer(story.id, i, state[i]);

  const summary = () => {
    if (!scored.length) return;
    const done = scored.filter((i) => state[i].done);
    if (done.length < scored.length) {
      scoreEl.hidden = done.length === 0;
      scoreEl.textContent = `${done.length} of ${scored.length} done`;
      return;
    }
    const firstTry = scored.filter((i) => state[i].first).length;
    const withHelp = scored.filter((i) => state[i].done && !state[i].first && !state[i].revealed).length;
    const total = scored.length;
    const parts = [];
    if (firstTry) parts.push(`${firstTry} right first time`);
    if (withHelp) parts.push(`${withHelp} worked out with a clue`);
    const shown = total - firstTry - withHelp;
    if (shown) parts.push(`${shown} we looked at together`);
    scoreEl.hidden = false;
    scoreEl.innerHTML = `<strong>🌟 You answered all ${total} questions!</strong><span>${parts.join(' · ')}</span>
      <button class="btn btn--small btn--ghost q-again" type="button">Try the questions again</button>`;
    scoreEl.querySelector('.q-again').addEventListener('click', () => {
      store.resetQuiz(story.id);
      renderQuiz(container, story, hooks);
      container.querySelector('.q')?.scrollIntoView({ block: 'center' });
    });
    store.finishQuiz(story.id, firstTry, withHelp, total);
    hooks.onComplete?.({ firstTry, withHelp, total });
  };

  const draw = (i) => {
    const li = container.querySelector(`.q[data-i="${i}"]`);
    DRAW[qs[i].type]?.(li, qs[i], state[i], i);
    const st = state[i];
    if (!SCORED.has(qs[i].type) && qs[i].type !== 'qa') return;
    // Feedback line + clue controls
    let fb = '';
    if (st.done && st.revealed) {
      fb = `<p class="q-fb is-shown">The answer is <strong>${esc(answerText(qs[i]))}</strong>.${
        clues[i] ? ` The story says: <q>${esc(clues[i].text)}</q>` : ''
      }</p>`;
    } else if (st.done) {
      fb = `<p class="q-fb is-ok">${st.first ? '✓ Yes, that’s right!' : '✓ You found the clue!'}</p>`;
    } else if (st.tries > 0) {
      fb = `<p class="q-fb is-no">Not quite${st.partial ? ' — the green ones are right' : ''}. Let’s look at the story, then try again.</p>`;
    }
    const canLook = clues[i] && hooks.onLook && (qs[i].type === 'qa' || (st.tries > 0 && !st.done) || st.revealed);
    li.insertAdjacentHTML(
      'beforeend',
      `${fb}${canLook ? `<button class="btn btn--small btn--ghost q-look" type="button">🔍 ${qs[i].type === 'qa' ? 'Find it in the story' : 'Look at the story'}</button>` : ''}`,
    );
    li.querySelector('.q-look')?.addEventListener('click', () => hooks.onLook(clues[i], li));
  };

  /** After a Check: record the attempt and redraw. */
  const checked = (i, right, partial = false) => {
    const st = state[i];
    st.tries = (st.tries ?? 0) + 1;
    st.partial = partial;
    if (right) {
      st.done = true;
      st.first = st.tries === 1;
    } else if (st.tries >= maxTries(qs[i])) {
      st.done = true;
      st.revealed = true;
    }
    persist(i);
    draw(i);
    summary();
  };

  // ── Question types ──
  const DRAW = {
    tf(li, q, st, i) {
      const choice = (v, label) => {
        const wrong = st.wrong?.includes(v);
        const right = st.done && q.answer === v;
        const sel = !st.done && st.pick === v;
        return `<button class="chip${right ? ' is-ok' : ''}${wrong ? ' is-no' : ''}" type="button" data-v="${v}"
          aria-pressed="${sel}" ${st.done || wrong ? 'disabled' : ''}>${wrong ? '✗ ' : ''}${label}</button>`;
      };
      li.innerHTML = `<p class="q-prompt">${sayBtn(q.prompt + ' True or false?')}${esc(q.prompt)}</p>
        <div class="q-choices" role="group" aria-label="True or false">${choice(true, 'True')}${choice(false, 'False')}</div>
        ${st.done ? '' : `<button class="btn btn--primary btn--small q-check" type="button" ${st.pick == null ? 'disabled' : ''}>Check</button>`}`;
      wireChoice(li, st, i, (v) => v === 'true', () => st.pick === q.answer);
    },
    mc(li, q, st, i) {
      const spoken = `${q.prompt} ${q.options.map((o, k) => `${'abcd'[k]}: ${o}.`).join(' ')}`;
      li.innerHTML = `<p class="q-prompt">${sayBtn(spoken)}${esc(q.prompt)}</p>
        <div class="q-choices q-choices--stack" role="group">
          ${q.options
            .map((o, k) => {
              const wrong = st.wrong?.includes(k);
              const right = st.done && q.answer === k;
              return `<button class="chip${right ? ' is-ok' : ''}${wrong ? ' is-no' : ''}" type="button" data-v="${k}"
                aria-pressed="${!st.done && st.pick === k}" ${st.done || wrong ? 'disabled' : ''}>
                <span class="chip-letter">${wrong ? '✗' : 'abcd'[k]}</span> ${esc(o)}</button>`;
            })
            .join('')}
        </div>
        ${st.done ? '' : `<button class="btn btn--primary btn--small q-check" type="button" ${st.pick == null ? 'disabled' : ''}>Check</button>`}`;
      wireChoice(li, st, i, Number, () => st.pick === q.answer);
    },
    cloze(li, q, st, i) {
      const parts = q.prompt.split('___');
      const bank = q.bank.length ? q.bank : q.answers;
      const options = [...new Set(shuffle(bank, i + 7))];
      st.values ??= [];
      st.locked ??= [];
      const reveal = st.revealed;
      li.innerHTML = `<p class="q-prompt q-cloze">${sayBtn(q.prompt)}${parts
        .map((p, k) => {
          if (k === parts.length - 1) return esc(p);
          const locked = st.locked[k] || st.done;
          const val = reveal ? q.answers[k] : (st.values[k] ?? '');
          const cls = locked ? (reveal && !st.locked[k] ? ' is-answer' : ' is-ok') : st.tries && st.values[k] ? ' is-no' : '';
          return `${esc(p)}<select class="gap${cls}" aria-label="Gap ${k + 1}" data-k="${k}" ${locked ? 'disabled' : ''}>
            <option value="">choose…</option>${options.map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        })
        .join('')}</p>
        ${st.done ? '' : '<button class="btn btn--primary btn--small q-check" type="button">Check</button>'}`;
      li.querySelectorAll('.gap').forEach((g) =>
        g.addEventListener('change', () => {
          st.values[Number(g.dataset.k)] = g.value;
          g.classList.remove('is-no');
          persist(i);
        }),
      );
      li.querySelector('.q-check')?.addEventListener('click', () => {
        const gaps = [...li.querySelectorAll('.gap')];
        if (gaps.some((g) => !g.value)) {
          const fb = li.querySelector('.q-fb') ?? li.appendChild(Object.assign(document.createElement('p'), { className: 'q-fb is-no' }));
          fb.textContent = 'Choose a word for every gap first.';
          return;
        }
        gaps.forEach((g, k) => (st.locked[k] = norm(g.value) === norm(q.answers[k] ?? '')));
        const all = st.locked.slice(0, gaps.length).every(Boolean);
        checked(i, all, !all && st.locked.some(Boolean));
      });
    },
    order(li, q, st, i) {
      const items = shuffle(
        q.items.map((it, k) => ({ ...it, k })),
        i + 3,
      );
      const n = q.items.length;
      st.slots ??= Array(n).fill(null);
      st.locked ??= Array(n).fill(false);
      const slotOf = (k) => st.slots.indexOf(k);
      const full = st.slots.every((s) => s != null);
      li.innerHTML = `<p class="q-prompt">${sayBtn('Tap the events in the order they happened. ' + q.items.map((it) => it.text).join(' '))}Tap the events in the order they happened. Tap one again to take it back.</p>
        <div class="q-order">${items
          .map((it) => {
            const pos = st.done ? q.items[it.k].position - 1 : slotOf(it.k);
            const locked = st.done || (pos >= 0 && st.locked[pos]);
            return `<button class="chip chip--block${locked ? ' is-ok' : ''}" type="button" data-k="${it.k}" ${locked ? 'disabled' : ''}
              aria-label="${esc(it.text)}${pos >= 0 ? `, number ${pos + 1}` : ''}"><span class="order-n">${pos >= 0 ? pos + 1 : ''}</span>${esc(it.text)}</button>`;
          })
          .join('')}</div>
        ${st.done ? '' : `<button class="btn btn--primary btn--small q-check" type="button" ${full ? '' : 'disabled'}>Check</button>`}`;
      li.querySelectorAll('.chip').forEach((b) =>
        b.addEventListener('click', () => {
          const k = Number(b.dataset.k);
          const at = slotOf(k);
          if (at >= 0) st.slots[at] = null; // take it back
          else st.slots[st.slots.indexOf(null)] = k;
          persist(i);
          draw(i);
        }),
      );
      li.querySelector('.q-check')?.addEventListener('click', () => {
        st.slots.forEach((k, pos) => {
          st.locked[pos] = q.items[k].position === pos + 1;
          if (!st.locked[pos]) st.slots[pos] = null;
        });
        const all = st.locked.every(Boolean);
        checked(i, all, !all && st.locked.some(Boolean));
      });
    },
    qa(li, q, st, i) {
      li.innerHTML = `<p class="q-prompt">${sayBtn(q.prompt)}${esc(q.prompt)}</p>
        <textarea class="q-answer" rows="2" placeholder="Say your answer in a full sentence, or write it here.">${esc(st.draft ?? '')}</textarea>
        <details class="q-model"><summary>Show a model answer</summary><p>${esc(q.answer || 'Answers will vary.')}</p></details>`;
      let t = 0;
      li.querySelector('.q-answer').addEventListener('input', (e) => {
        st.draft = e.target.value;
        clearTimeout(t);
        t = setTimeout(() => persist(i), 300);
      });
    },
    talk(li, q) {
      li.innerHTML = `<p class="q-prompt">${sayBtn(q.prompt)}💬 ${esc(q.prompt)}</p>`;
    },
  };

  /** Shared wiring for single-choice questions (tf, mc). */
  function wireChoice(li, st, i, parse, isRight) {
    li.querySelectorAll('.chip').forEach((b) =>
      b.addEventListener('click', () => {
        st.pick = parse(b.dataset.v);
        li.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
        li.querySelector('.q-check').disabled = false;
      }),
    );
    li.querySelector('.q-check')?.addEventListener('click', () => {
      const right = isRight();
      if (!right) (st.wrong ??= []).push(st.pick);
      st.pick = null;
      checked(i, right);
      li.querySelector('.q-look, .chip:not(:disabled)')?.focus({ preventScroll: true });
    });
  }

  qs.forEach((q, i) => draw(i));
  summary();

  if (!container.dataset.sayWired) {
    container.dataset.sayWired = '1';
    container.addEventListener('click', (e) => {
      const b = e.target.closest('[data-say]');
      if (b) say(b.dataset.say, { rate: Math.min(store.prefs.rate ?? 0.85, 0.85) });
    });
  }
}
