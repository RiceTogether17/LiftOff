/**
 * The workbook's own comprehension activities, made interactive.
 *
 *   tf    True / False            (auto-marked)
 *   mc    Multiple choice         (auto-marked)
 *   cloze Word-bank gap fill      (auto-marked)
 *   order Put events in order     (auto-marked)
 *   qa    Written answer          (think, then compare with the model answer)
 *   talk  Talk about it           (discussion prompt, no marking)
 */

import { esc } from './render.js';
import { store } from './store.js';

const SCORED = new Set(['tf', 'mc', 'cloze', 'order']);

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

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

export function renderQuiz(container, story) {
  const qs = story.quiz;
  if (!qs.length) {
    container.innerHTML = '';
    return;
  }
  const scoredCount = qs.filter((q) => SCORED.has(q.type)).reduce((n, q) => n + marks(q), 0);
  const results = new Map(); // question index -> marks earned

  container.innerHTML = `
    <section class="quiz" aria-labelledby="quiz-title">
      <h3 id="quiz-title">${qs.every((q) => q.type === 'talk') ? '💬 Talk about it' : '✏️ Check your understanding'}</h3>
      <ol class="quiz-list">${qs.map((q, i) => `<li class="q q--${q.type}" data-i="${i}"></li>`).join('')}</ol>
      <div class="quiz-score" aria-live="polite" hidden></div>
    </section>`;

  const scoreEl = container.querySelector('.quiz-score');
  const update = () => {
    if (!scoredCount) return;
    const answered = [...results.keys()].length;
    const scored = qs.filter((q) => SCORED.has(q.type)).length;
    const got = [...results.values()].reduce((a, b) => a + b, 0);
    scoreEl.hidden = answered === 0;
    scoreEl.innerHTML =
      answered < scored
        ? `${got} / ${scoredCount} so far`
        : `<strong>${got} / ${scoredCount}</strong> ${got === scoredCount ? '🌟 Brilliant!' : '— go back to the story to check the ones you missed.'}`;
    if (answered === scored) store.saveQuiz(story.id, got, scoredCount);
  };

  qs.forEach((q, i) => {
    const li = container.querySelector(`.q[data-i="${i}"]`);
    const done = (earned) => {
      results.set(i, earned);
      update();
    };
    ({ tf, mc, cloze, order, qa, talk })[q.type]?.(li, q, i, done);
  });
}

function marks(q) {
  if (q.type === 'cloze') return q.answers.length;
  if (q.type === 'order') return 1;
  return 1;
}

function feedback(li, ok, text) {
  let fb = li.querySelector('.q-fb');
  if (!fb) {
    fb = document.createElement('p');
    fb.className = 'q-fb';
    fb.setAttribute('role', 'status');
    li.appendChild(fb);
  }
  fb.className = `q-fb ${ok ? 'is-ok' : 'is-no'}`;
  fb.textContent = text;
}

function tf(li, q, i, done) {
  li.innerHTML = `<p class="q-prompt">${esc(q.prompt)}</p>
    <div class="q-choices" role="group" aria-label="True or false">
      <button class="chip" type="button" data-v="true">True</button>
      <button class="chip" type="button" data-v="false">False</button>
    </div>`;
  li.querySelectorAll('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      const ok = (b.dataset.v === 'true') === q.answer;
      li.querySelectorAll('.chip').forEach((c) => (c.disabled = true));
      b.classList.add(ok ? 'is-ok' : 'is-no');
      if (!ok) li.querySelector(`[data-v="${q.answer}"]`).classList.add('is-answer');
      feedback(li, ok, ok ? 'Correct!' : `It's ${q.answer ? 'true' : 'false'}. Find the sentence in the story that tells you.`);
      done(ok ? 1 : 0);
    }),
  );
}

function mc(li, q, i, done) {
  li.innerHTML = `<p class="q-prompt">${esc(q.prompt)}</p>
    <div class="q-choices q-choices--stack" role="group">
      ${q.options.map((o, k) => `<button class="chip" type="button" data-k="${k}"><span class="chip-letter">${'abcd'[k]}</span> ${esc(o)}</button>`).join('')}
    </div>`;
  li.querySelectorAll('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      const ok = Number(b.dataset.k) === q.answer;
      li.querySelectorAll('.chip').forEach((c) => (c.disabled = true));
      b.classList.add(ok ? 'is-ok' : 'is-no');
      if (!ok) li.querySelector(`[data-k="${q.answer}"]`).classList.add('is-answer');
      feedback(li, ok, ok ? 'Correct!' : 'Not quite — the right answer is highlighted.');
      done(ok ? 1 : 0);
    }),
  );
}

function cloze(li, q, i, done) {
  const parts = q.prompt.split('___');
  const bank = q.bank.length ? q.bank : q.answers;
  const options = [...new Set(shuffle(bank, i + 7))];
  li.innerHTML = `<p class="q-prompt q-cloze">${parts
    .map(
      (p, k) =>
        esc(p) +
        (k < parts.length - 1
          ? `<select class="gap" aria-label="Gap ${k + 1}"><option value="">choose…</option>${options
              .map((o) => `<option>${esc(o)}</option>`)
              .join('')}</select>`
          : ''),
    )
    .join('')}</p>
    <button class="btn btn--small q-check" type="button">Check</button>`;
  li.querySelector('.q-check').addEventListener('click', (e) => {
    const gaps = [...li.querySelectorAll('.gap')];
    if (gaps.some((g) => !g.value)) {
      feedback(li, false, 'Fill every gap first.');
      return;
    }
    let got = 0;
    gaps.forEach((g, k) => {
      const ok = norm(g.value) === norm(q.answers[k] ?? '');
      got += ok ? 1 : 0;
      g.classList.add(ok ? 'is-ok' : 'is-no');
      g.disabled = true;
    });
    e.currentTarget.remove();
    feedback(
      li,
      got === gaps.length,
      got === gaps.length ? 'All correct!' : `Answer: ${q.answers.join(', ')}`,
    );
    done(got);
  });
}

function order(li, q, i, done) {
  const items = shuffle(
    q.items.map((it, k) => ({ ...it, k })),
    i + 3,
  );
  const picked = [];
  li.innerHTML = `<p class="q-prompt">Tap the events in the order they happened.</p>
    <div class="q-order">${items
      .map((it) => `<button class="chip chip--block" type="button" data-k="${it.k}"><span class="order-n"></span>${esc(it.text)}</button>`)
      .join('')}</div>`;
  li.querySelectorAll('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.disabled) return;
      picked.push(Number(b.dataset.k));
      b.disabled = true;
      b.querySelector('.order-n').textContent = picked.length;
      if (picked.length === q.items.length) {
        const ok = picked.every((k, n) => q.items[k].position === n + 1);
        if (!ok) {
          li.querySelectorAll('.chip').forEach((c) => {
            c.querySelector('.order-n').textContent = q.items[Number(c.dataset.k)].position;
          });
        }
        feedback(li, ok, ok ? 'Perfect order!' : 'The numbers now show the right order.');
        done(ok ? 1 : 0);
      }
    }),
  );
}

function qa(li, q) {
  li.innerHTML = `<p class="q-prompt">${esc(q.prompt)}</p>
    <textarea class="q-answer" rows="2" placeholder="Say your answer in a full sentence, or write it here."></textarea>
    <details class="q-model"><summary>Show a model answer</summary><p>${esc(q.answer || 'Answers will vary.')}</p></details>`;
}

function talk(li, q) {
  li.innerHTML = `<p class="q-prompt">💬 ${esc(q.prompt)}</p>`;
}
