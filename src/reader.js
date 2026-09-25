/**
 * Story reader — the LiftOff take on PhonicsQuest's story reader, with all
 * audio removed. Reading happens aloud *by the child*; the app supports it
 * visually:
 *
 *   🤝 Meet the Words   the lesson's vocabulary page, before reading
 *   📖 Read             workbook colour coding + a reading ruler
 *   🔤 Sound It Out     tap a word to blend it one sound at a time
 *   ⏱ Fluency timer     words correct per minute, saved per story
 *   ✏️ Check            the workbook's own comprehension activity
 */

import { store } from './store.js';
import { esc, wordHtml, wordsHtml } from './render.js';
import { openSoundItOut, closeSoundItOut } from './soundItOut.js';
import { renderQuiz } from './quiz.js';

let mode = 'read'; // 'read' | 'decode'
let rulerIndex = 0;
let timer = null;

const LEGEND = `
  <div class="legend" aria-label="Colour key">
    <span><b class="c-long">a</b> long vowel</span>
    <span><b class="c-short">o</b> other vowel sound (small letter shows it)</span>
    <span><b class="c-diph">ar</b> diphthong</span>
    <span><b class="c-silent">e</b> silent</span>
    <span><b class="c-alt">ph</b> says the small letter above</span>
  </div>`;

function meetWords(story) {
  const seen = new Set();
  const out = [];
  const add = (w, key = false) => {
    const k = w.word.toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ ...w, keyWord: key });
  };
  story.blocks.flatMap((b) => b.words).filter((w) => w.key).forEach((w) => add(w, true));
  (story.lessonInfo?.words ?? []).forEach((w) => add(w));
  return out;
}

export function renderReader(root, story, { onBack }) {
  stopTimer();
  closeSoundItOut();
  rulerIndex = 0;
  const wbNum = story.workbook.replace(/\D/g, '');
  root.innerHTML = `
    <article class="reader">
      <header class="reader-head">
        <a class="btn btn--ghost" href="#/wb/${esc(story.workbook)}" data-back>← Stories</a>
        <span class="badge">Workbook ${esc(wbNum)} · Lesson ${esc(story.lesson)}</span>
        <span class="badge badge--soft">${esc(story.lessonInfo?.title ?? '')}</span>
      </header>
      <h1 class="reader-title">${wordsHtml(story.titleWords)}</h1>
      <div class="reader-dynamic"></div>
    </article>`;
  root.querySelector('[data-back]').addEventListener('click', () => onBack?.());

  const dyn = root.querySelector('.reader-dynamic');
  const words = meetWords(story);
  if (words.length && !store.metWordsToday(story.id)) renderGate(dyn, story, words);
  else renderBody(dyn, story);
}

// ── Meet the Words ─────────────────────────────────────────────────────────

function renderGate(dyn, story, words) {
  const target = Math.min(3, words.length);
  const tapped = new Set();
  const keyWords = words.filter((w) => w.keyWord);
  const vocab = words.filter((w) => !w.keyWord);
  const chips = (list) =>
    list
      .map(
        (w, i) =>
          `<button class="word-chip${w.keyWord ? ' word-chip--key' : ''}" type="button" data-word="${esc(w.word)}">${wordHtml(w)}</button>`,
      )
      .join('');

  dyn.innerHTML = `
    <section class="gate" aria-labelledby="gate-title">
      <h2 id="gate-title">🤝 Meet the Words</h2>
      <p>Read these words aloud before the story. Tap a word you're unsure of to <strong>sound it out</strong>.
         Read or tap <strong>any ${target}</strong> to warm up.</p>
      ${keyWords.length ? `<h3 class="gate-sub">📚 Key words in this story — talk about what they mean</h3><div class="chip-wrap">${chips(keyWords)}</div>` : ''}
      ${vocab.length ? `<h3 class="gate-sub">🔤 Lesson ${esc(story.lesson)} vocabulary page</h3><div class="chip-wrap">${chips(vocab)}</div>` : ''}
      <div class="gate-row">
        <span class="gate-progress" aria-live="polite">0 of ${target} warmed up</span>
        <button class="btn btn--ghost" type="button" data-skip>I know these →</button>
        <button class="btn btn--primary" type="button" data-go disabled>Start reading →</button>
      </div>
    </section>`;

  const progress = dyn.querySelector('.gate-progress');
  const go = dyn.querySelector('[data-go]');
  dyn.querySelectorAll('.word-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const w = words.find((x) => x.word === chip.dataset.word);
      openSoundItOut(w, chip);
      chip.classList.add('is-done');
      tapped.add(chip.dataset.word);
      progress.textContent =
        tapped.size >= target ? `✓ Warmed up (${tapped.size})` : `${tapped.size} of ${target} warmed up`;
      go.disabled = tapped.size < target;
    });
  });
  const proceed = () => {
    closeSoundItOut();
    store.setMetWords(story.id);
    renderBody(dyn, story);
    dyn.querySelector('.story')?.focus();
  };
  go.addEventListener('click', proceed);
  dyn.querySelector('[data-skip]').addEventListener('click', proceed);
}

// ── Story body ─────────────────────────────────────────────────────────────

function blockHtml(block, bi, story) {
  if (block.type === 'note') return `<p class="blk note" data-b="${bi}">📝 ${esc(block.text)}</p>`;
  const words = block.words
    .map((w, wi) => {
      const cls = `w${w.bold ? ' w--bold' : ''}${w.key ? ' w--key' : ''}`;
      const inner = wordHtml(w);
      return mode === 'decode' && /[A-Za-z]/.test(w.text)
        ? `<button type="button" class="${cls}" data-b="${bi}" data-w="${wi}">${inner}</button>`
        : `<span class="${cls}">${inner}</span>`;
    })
    .join(' ');
  if (block.type === 'h') return `<h3 class="blk blk--h" data-b="${bi}">${words}</h3>`;
  if (block.type === 'li') return `<p class="blk blk--li" data-b="${bi}">${words}</p>`;
  if (block.type === 'script') {
    const name = story.roles?.[block.role] ?? block.role;
    return `<p class="blk blk--script role-${esc(block.role)}" data-b="${bi}" data-role="${esc(block.role)}">
      <span class="role-tag" title="${esc(name)}">${esc(block.role)}</span><span class="line">${words}</span></p>`;
  }
  return `<p class="blk" data-b="${bi}">${words}</p>`;
}

function renderBody(dyn, story) {
  const prefs = store.prefs;
  const roles = story.roles ? Object.entries(story.roles) : [];
  const best = store.bestWcpm(story.id);
  const read = store.isRead(story.id);

  dyn.innerHTML = `
    <div class="toolbar" role="toolbar" aria-label="Reading tools">
      <div class="seg" role="group" aria-label="Reading mode">
        <button type="button" class="seg-btn" data-mode="read" aria-pressed="${mode === 'read'}">
          <span>📖 Read</span><small>you read aloud</small></button>
        <button type="button" class="seg-btn" data-mode="decode" aria-pressed="${mode === 'decode'}">
          <span>🔤 Sound It Out</span><small>tap a tricky word</small></button>
      </div>
      <div class="tools">
        <button type="button" class="tool" data-pref="coding" aria-pressed="${prefs.coding}" title="Show the workbook's colour coding">🎨 Coding</button>
        <button type="button" class="tool" data-pref="ruler" aria-pressed="${prefs.ruler}" title="Focus on one part at a time, like your Reading Ruler">📏 Ruler</button>
        <button type="button" class="tool" data-size="-1" aria-label="Smaller text">A−</button>
        <button type="button" class="tool" data-size="1" aria-label="Bigger text">A+</button>
      </div>
    </div>
    ${prefs.coding ? LEGEND : ''}
    ${
      roles.length
        ? `<label class="role-pick">🎭 I am reading:
            <select><option value="">— everyone —</option>${roles
              .map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`)
              .join('')}</select></label>`
        : ''
    }
    <div class="story${prefs.coding ? '' : ' coding-off'}${prefs.ruler ? ' ruler-on' : ''}${mode === 'decode' ? ' is-decode' : ''}"
         style="--size:${prefs.size}" tabindex="-1">
      ${story.blocks.map((b, i) => blockHtml(b, i, story)).join('')}
    </div>
    <div class="ruler-nav" ${prefs.ruler ? '' : 'hidden'}>
      <button class="btn btn--ghost" type="button" data-ruler="-1" aria-label="Previous part">◀ Back</button>
      <span class="ruler-pos" aria-live="polite"></span>
      <button class="btn btn--primary" type="button" data-ruler="1" aria-label="Next part">Next ▶</button>
    </div>
    <section class="fluency" aria-label="Fluency timer">
      <div>
        <strong>⏱ Fluency timer</strong>
        <small>Read the whole story aloud. Stop the timer on the last word.</small>
      </div>
      <span class="clock" aria-live="off">0:00</span>
      <button class="btn btn--ghost" type="button" data-timer>Start</button>
      <span class="fluency-result" aria-live="polite">${best ? `Best: <b>${best}</b> words/min` : ''}</span>
    </section>
    <div class="finish">
      <button class="btn btn--primary btn--big" type="button" data-finish>${read ? '✓ Read — check again' : '✓ I finished the story'}</button>
    </div>
    <div class="quiz-wrap" ${read ? '' : 'hidden'}></div>`;

  const storyEl = dyn.querySelector('.story');

  // Mode switch
  dyn.querySelectorAll('.seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      closeSoundItOut();
      renderBody(dyn, story);
    }),
  );

  // Scaffold toggles
  dyn.querySelectorAll('[data-pref]').forEach((b) =>
    b.addEventListener('click', () => {
      store.setPref(b.dataset.pref, !store.prefs[b.dataset.pref]);
      renderBody(dyn, story);
    }),
  );
  dyn.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      const next = Math.min(1.6, Math.max(0.8, store.prefs.size + Number(b.dataset.size) * 0.15));
      store.setPref('size', Math.round(next * 100) / 100);
      storyEl.style.setProperty('--size', store.prefs.size);
    }),
  );

  // Readers theatre: highlight my lines
  dyn.querySelector('.role-pick select')?.addEventListener('change', (e) => {
    const r = e.target.value;
    storyEl.classList.toggle('has-role', Boolean(r));
    storyEl.querySelectorAll('.blk--script').forEach((p) => {
      const mine = p.dataset.role === r || (p.dataset.role === 'N2' && r);
      p.classList.toggle('is-mine', Boolean(r) && mine);
    });
  });

  // Sound It Out
  storyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button.w');
    if (btn) {
      storyEl.querySelectorAll('.w.is-active').forEach((w) => w.classList.remove('is-active'));
      btn.classList.add('is-active');
      const word = story.blocks[Number(btn.dataset.b)].words[Number(btn.dataset.w)];
      openSoundItOut(word, btn);
      return;
    }
    const blk = e.target.closest('.blk');
    if (blk && storyEl.classList.contains('ruler-on')) setRuler(dyn, Number(blk.dataset.b));
  });

  // Reading ruler
  const blocks = [...storyEl.querySelectorAll('.blk')];
  rulerIndex = Math.min(rulerIndex, blocks.length - 1);
  dyn.querySelectorAll('[data-ruler]').forEach((b) =>
    b.addEventListener('click', () => setRuler(dyn, rulerIndex + Number(b.dataset.ruler))),
  );
  storyEl.addEventListener('keydown', (e) => {
    if (!storyEl.classList.contains('ruler-on')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setRuler(dyn, rulerIndex + 1), e.preventDefault();
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setRuler(dyn, rulerIndex - 1), e.preventDefault();
  });
  if (store.prefs.ruler) setRuler(dyn, rulerIndex, false);

  // Fluency timer
  const clock = dyn.querySelector('.clock');
  const tBtn = dyn.querySelector('[data-timer]');
  const result = dyn.querySelector('.fluency-result');
  tBtn.addEventListener('click', () => {
    if (!timer) {
      const start = performance.now();
      timer = { start, id: setInterval(() => (clock.textContent = fmt((performance.now() - start) / 1000)), 250) };
      tBtn.textContent = 'Stop';
      tBtn.classList.add('btn--primary');
      result.textContent = 'Reading…';
      return;
    }
    const secs = (performance.now() - timer.start) / 1000;
    stopTimer();
    tBtn.textContent = 'Start again';
    tBtn.classList.remove('btn--primary');
    clock.textContent = fmt(secs);
    if (secs < 5) {
      result.textContent = 'That was very quick — start the timer when you begin reading.';
      return;
    }
    const wcpm = Math.round((story.wordCount / secs) * 60);
    const prevBest = store.bestWcpm(story.id);
    store.saveFluency(story.id, wcpm, secs);
    result.innerHTML = `<b>${wcpm}</b> words/min${wcpm > prevBest && prevBest ? ' — 🎉 new best!' : prevBest ? ` · best ${prevBest}` : ''}`;
  });

  // Finish → comprehension
  const quizWrap = dyn.querySelector('.quiz-wrap');
  if (read) renderQuiz(quizWrap, story);
  dyn.querySelector('[data-finish]').addEventListener('click', (e) => {
    store.markRead(story.id);
    e.currentTarget.textContent = '✓ Read — well done!';
    quizWrap.hidden = false;
    renderQuiz(quizWrap, story);
    if (!story.quiz.length) quizWrap.innerHTML = '<p class="quiz-none">🌟 Great reading! Tell someone what happened in the story.</p>';
    quizWrap.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
}

function setRuler(dyn, i, scroll = true) {
  const blocks = [...dyn.querySelectorAll('.story .blk')];
  if (!blocks.length) return;
  rulerIndex = Math.max(0, Math.min(blocks.length - 1, i));
  blocks.forEach((b, k) => b.classList.toggle('is-current', k === rulerIndex));
  const pos = dyn.querySelector('.ruler-pos');
  if (pos) pos.textContent = `${rulerIndex + 1} of ${blocks.length}`;
  if (scroll) blocks[rulerIndex].scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function stopTimer() {
  if (timer) clearInterval(timer.id);
  timer = null;
}
