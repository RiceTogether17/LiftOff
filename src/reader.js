/**
 * Story reader — the LiftOff take on PhonicsQuest's story reader.
 *
 *   🤝 Meet the Words   the lesson's vocabulary page, before reading
 *   📖 Read             the child reads aloud; colour coding + reading ruler
 *   🔤 Sound It Out     tap a word to blend it one sound at a time (with audio)
 *   🎧 Listen           the story is read aloud, word by word highlighted
 *   📏 Reading Ruler    word / line / window, follows the voice in Listen
 *   ⏱ Fluency timer     words correct per minute, saved per story
 *   ✏️ Check            the workbook's own comprehension activity
 */

import { store } from './store.js';
import { esc, wordHtml, wordsHtml } from './render.js';
import { openSoundItOut, closeSoundItOut } from './soundItOut.js';
import { renderQuiz } from './quiz.js';
import { say, soundOn, stopAudio, canSpeak } from './audio.js';
import { createRuler, RULER_MODES } from './ruler.js';

let mode = 'read'; // 'read' | 'decode' | 'listen'
let listen = null; // { index, playing, gen }
let timer = null;
let ruler = null; // live Reading Ruler, when switched on
let rulerAt = null; // { story, word } — where the ruler was, per story
let rulerState = null; // last position reported by the ruler

const LEGEND_ITEMS = `
    <span><b class="c-long">a</b> long vowel</span>
    <span><b class="c-short">o</b> other vowel sound (small letter shows it)</span>
    <span><b class="c-diph">ar</b> diphthong</span>
    <span><b class="c-silent">e</b> silent</span>
    <span><b class="c-alt">ph</b> says the small letter above</span>`;

const MODE_HINT = {
  read: 'Read the story aloud. Turn on 📏 Ruler to help you keep your place.',
  decode: 'Tap any word you are stuck on to sound it out.',
  listen: 'Press ▶ Play and follow the words with your eyes. Tap a line to hear it from there.',
};

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rulerMode = () => RULER_MODES.find((m) => m.id === store.prefs.rulerMode) ?? RULER_MODES[1];

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
  if (rulerAt?.story !== story.id) rulerAt = null;
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
        (w) =>
          `<button class="word-chip${w.keyWord ? ' word-chip--key' : ''}" type="button" data-word="${esc(w.word)}">${wordHtml(w)}</button>`,
      )
      .join('');

  dyn.innerHTML = `
    <section class="gate" aria-labelledby="gate-title">
      <h2 id="gate-title">🤝 Meet the Words</h2>
      <p>Read these words aloud before the story. Tap a word you're unsure of to <strong>sound it out</strong>${soundOn() ? ' and hear it' : ''}.
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
    dyn.querySelector('.story')?.focus({ preventScroll: true });
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
        : `<span class="${cls}" data-w="${wi}">${inner}</span>`;
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

const tool = (attrs, icon, label, extra = '') =>
  `<button type="button" class="tool" ${attrs} ${extra}><span class="tool-i" aria-hidden="true">${icon}</span><span class="tool-t">${label}</span></button>`;

function rulerNavHtml() {
  const m = rulerMode();
  return `
    <div class="ruler-nav" role="group" aria-label="Reading ruler">
      <button class="btn btn--ghost ruler-style" type="button" data-ruler-style
        aria-label="Ruler style: ${m.label}. Tap to change." title="Change the ruler style">
        <span class="rs-i" aria-hidden="true">${m.icon}</span><small>${m.label}</small></button>
      <button class="btn btn--ghost ruler-back" type="button" data-ruler="-1" aria-label="Back">◀</button>
      <span class="ruler-pos"><small></small><b></b></span>
      <button class="btn btn--primary ruler-next" type="button" data-ruler="1">Next ▶</button>
    </div>`;
}

function renderBody(dyn, story) {
  destroyRuler();
  const keepY = scrollY; // re-rendering must not lose the child's place
  const prefs = store.prefs;
  const roles = story.roles ? Object.entries(story.roles) : [];
  const best = store.bestWcpm(story.id);
  const read = store.isRead(story.id);
  const wide = matchMedia('(min-width: 700px)').matches;
  const hint = prefs.ruler && mode !== 'decode' ? `${rulerMode().icon} ${rulerMode().hint} Drag the ruler, tap a line, or press Next.` : MODE_HINT[mode];
  const seg = (id, icon, label) =>
    `<button type="button" class="seg-btn" data-mode="${id}" aria-pressed="${mode === id}"><span class="seg-i" aria-hidden="true">${icon}</span><span>${label}</span></button>`;

  dyn.innerHTML = `
    <div class="toolbar" role="toolbar" aria-label="Reading tools">
      <div class="seg" role="group" aria-label="Reading mode">
        ${seg('read', '📖', 'Read')}${seg('decode', '🔤', 'Sound It Out')}${seg('listen', '🎧', 'Listen')}
      </div>
      <div class="tools">
        ${tool('data-pref="ruler"', '📏', 'Ruler', `aria-pressed="${prefs.ruler}" title="Reading Ruler: keep your place line by line"`)}
        ${tool('data-pref="coding"', '🎨', 'Colours', `aria-pressed="${prefs.coding}" title="Show the workbook's colour coding"`)}
        ${tool('data-pref="sound"', prefs.sound !== false ? '🔊' : '🔇', 'Sound', `aria-pressed="${prefs.sound !== false}" title="Turn sounds and reading aloud on or off"`)}
        ${tool('data-size="-1"', 'A<small>−</small>', 'Smaller', 'aria-label="Smaller text"')}
        ${tool('data-size="1"', 'A<small>+</small>', 'Bigger', 'aria-label="Bigger text"')}
      </div>
    </div>
    <p class="mode-hint">${hint}</p>
    ${prefs.coding ? `<details class="legend" ${wide ? 'open' : ''}><summary>🎨 Colour key</summary><div class="legend-items">${LEGEND_ITEMS}</div></details>` : ''}
    ${
      roles.length
        ? `<label class="role-pick">🎭 I am reading:
            <select><option value="">— everyone —</option>${roles
              .map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`)
              .join('')}</select></label>`
        : ''
    }
    <div class="story${prefs.coding ? '' : ' coding-off'}${mode === 'decode' ? ' is-decode' : ''}${mode === 'listen' ? ' is-listen' : ''}"
         style="--size:${prefs.size}" tabindex="-1">
      ${story.blocks.map((b, i) => blockHtml(b, i, story)).join('')}
    </div>
    <div class="dock" ${mode === 'listen' || prefs.ruler ? '' : 'hidden'}>
      ${mode === 'listen' ? listenBarHtml() : ''}
      ${prefs.ruler ? rulerNavHtml() : ''}
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
      stopListening();
      renderBody(dyn, story);
    }),
  );

  // Scaffold toggles
  dyn.querySelectorAll('[data-pref]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.pref;
      store.setPref(key, !(store.prefs[key] ?? true));
      if (key === 'sound') stopListening();
      renderBody(dyn, story);
      dyn.querySelector(`[data-pref="${key}"]`)?.focus({ preventScroll: true });
    }),
  );
  dyn.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      const next = Math.min(1.6, Math.max(0.8, store.prefs.size + Number(b.dataset.size) * 0.15));
      store.setPref('size', Math.round(next * 100) / 100);
      storyEl.style.setProperty('--size', store.prefs.size);
      // the ruler re-measures itself (ResizeObserver); keep its line on screen
      if (ruler) setTimeout(() => ruler?.reveal(), 80);
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

  // Taps on the story: move the ruler, sound out a word, or listen from a line
  storyEl.addEventListener('click', (e) => {
    if (e.target.closest('.ruler-layer')) return;
    ruler?.tap(e.clientY, e.target.closest('[data-w]'));
    const btn = e.target.closest('button.w');
    if (btn) {
      storyEl.querySelectorAll('.w.is-active').forEach((w) => w.classList.remove('is-active'));
      btn.classList.add('is-active');
      const word = story.blocks[Number(btn.dataset.b)].words[Number(btn.dataset.w)];
      openSoundItOut(word, btn);
      return;
    }
    const blk = e.target.closest('.blk');
    if (blk && mode === 'listen' && !blk.classList.contains('note')) startListening(dyn, story, Number(blk.dataset.b));
  });

  if (Math.abs(scrollY - keepY) > 1) scrollTo(0, keepY);
  if (mode === 'listen') wireListenBar(dyn, story);
  if (prefs.ruler) startRuler(dyn, story);

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
    quizWrap.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

// ── Reading Ruler ──────────────────────────────────────────────────────────

/** The part of the screen not covered by the toolbar (top) or the dock (bottom). */
function safeArea() {
  const tb = document.querySelector('.toolbar');
  const dock = document.querySelector('.dock:not([hidden])');
  const top = (tb && !tb.classList.contains('is-tucked') ? Math.max(0, tb.getBoundingClientRect().bottom) : 0) + 12;
  const bottom = (dock ? Math.min(innerHeight, dock.getBoundingClientRect().top) : innerHeight) - 12;
  return { top, bottom: Math.max(bottom, top + 120) };
}

function startRuler(dyn, story) {
  const storyEl = dyn.querySelector('.story');
  const nav = dyn.querySelector('.ruler-nav');
  const m = rulerMode();
  const posLabel = nav.querySelector('.ruler-pos small');
  const posNum = nav.querySelector('.ruler-pos b');
  const next = nav.querySelector('.ruler-next');
  const back = nav.querySelector('.ruler-back');

  ruler = createRuler(storyEl, {
    mode: m.id,
    word: rulerAt?.story === story.id ? rulerAt.word : null,
    safeArea,
    onMove(s) {
      rulerState = s;
      rulerAt = { story: story.id, word: s.word };
      const byWord = m.id === 'word';
      posLabel.textContent = byWord ? 'Word' : 'Line';
      posNum.textContent = byWord ? `${s.word + 1} / ${s.words}` : `${s.line + 1} / ${s.lines}`;
      back.disabled = byWord ? s.word === 0 : s.line === 0;
      next.textContent = s.atEnd ? 'The end ✓' : byWord ? 'Next word ▶' : 'Next line ▶';
      next.classList.toggle('is-end', s.atEnd);
    },
  });

  nav.querySelector('[data-ruler="-1"]').addEventListener('click', () => ruler?.prev());
  next.addEventListener('click', () => {
    if (!rulerState?.atEnd) return ruler?.next();
    // Finished the last line: on to "I finished the story".
    const fin = dyn.querySelector('[data-finish]');
    fin?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    fin?.focus({ preventScroll: true });
  });
  nav.querySelector('[data-ruler-style]').addEventListener('click', () => {
    const i = RULER_MODES.indexOf(rulerMode());
    store.setPref('rulerMode', RULER_MODES[(i + 1) % RULER_MODES.length].id);
    renderBody(dyn, story);
    dyn.querySelector('[data-ruler-style]')?.focus({ preventScroll: true });
  });
}

function destroyRuler() {
  ruler?.destroy();
  ruler = null;
  rulerState = null;
}

// Arrow keys move the ruler (↓ ↑ by line; → ← by word in Word mode).
document.addEventListener('keydown', (e) => {
  if (!ruler || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (document.querySelector('.sio:not([hidden])')) return;
  const byWord = rulerMode().id === 'word';
  const act = {
    ArrowDown: () => ruler.nextLine(),
    ArrowUp: () => ruler.prevLine(),
    ArrowRight: () => (byWord ? ruler.next() : ruler.nextLine()),
    ArrowLeft: () => (byWord ? ruler.prev() : ruler.prevLine()),
  }[e.key];
  if (act) {
    e.preventDefault();
    act();
  }
});

// On small screens the toolbar slides away while reading down the page and
// comes back as soon as the child scrolls up.
let lastY = 0;
addEventListener(
  'scroll',
  () => {
    const tb = document.querySelector('.toolbar');
    if (!tb) return;
    const y = scrollY;
    const small = matchMedia('(max-width: 700px), (max-height: 500px)').matches;
    const stuck = tb.getBoundingClientRect().top <= 1;
    if (!small || !stuck || y < 80) {
      tb.classList.remove('is-tucked');
      lastY = y;
      return;
    }
    if (Math.abs(y - lastY) < 10) return;
    tb.classList.toggle('is-tucked', y > lastY);
    lastY = y;
  },
  { passive: true },
);

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function stopTimer() {
  if (timer) clearInterval(timer.id);
  timer = null;
  stopListening();
}

/** Leaving the reader: stop everything that is running. */
export function leaveReader() {
  stopTimer();
  destroyRuler();
}

// ── Listen ─────────────────────────────────────────────────────────────────

function listenBarHtml() {
  if (!soundOn()) {
    return `<div class="listen-bar listen-bar--off"><span>🔇 Sound is off. Turn on 🔊 Sound to hear the story.</span></div>`;
  }
  if (!canSpeak()) {
    return `<div class="listen-bar listen-bar--off"><span>This device can't read aloud. Try another browser.</span></div>`;
  }
  const slow = (store.prefs.rate ?? 0.85) < 0.8;
  return `
    <div class="listen-bar" role="group" aria-label="Listen controls">
      <button class="btn btn--primary listen-play" type="button" data-listen="play">▶ Play</button>
      <button class="btn btn--ghost" type="button" data-listen="restart" aria-label="From the start">⏮ <span class="wide-only">From the start</span></button>
      <button class="btn btn--ghost" type="button" data-listen="speed" aria-pressed="${slow}">🐢 Slower</button>
    </div>`;
}

function wireListenBar(dyn, story) {
  listen = { index: listen?.story === story.id ? listen.index : 0, playing: false, gen: 0, story: story.id };
  dyn.querySelector('[data-listen="play"]')?.addEventListener('click', () => {
    if (listen.playing) stopListening(true);
    else startListening(dyn, story, listen.index);
  });
  dyn.querySelector('[data-listen="restart"]')?.addEventListener('click', () => startListening(dyn, story, 0));
  dyn.querySelector('[data-listen="speed"]')?.addEventListener('click', (e) => {
    const slow = (store.prefs.rate ?? 0.85) < 0.8;
    store.setPref('rate', slow ? 0.85 : 0.65);
    e.currentTarget.setAttribute('aria-pressed', String(!slow));
  });
}

function setPlayLabel(dyn, text) {
  const b = dyn.querySelector('[data-listen="play"]');
  if (b) b.textContent = text;
}

function clearSpeaking(dyn) {
  dyn.querySelectorAll('.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
}

async function startListening(dyn, story, from) {
  if (!listen) return;
  stopAudio();
  const gen = (listen.gen = (listen.gen ?? 0) + 1);
  listen.playing = true;
  listen.index = from;
  setPlayLabel(dyn, '⏸ Pause');
  const role = dyn.querySelector('.role-pick select')?.value;

  for (let bi = from; bi < story.blocks.length; bi++) {
    if (gen !== listen.gen) return;
    const block = story.blocks[bi];
    const el = dyn.querySelector(`.story .blk[data-b="${bi}"]`);
    if (block.type === 'note' || !el) continue;
    listen.index = bi;
    clearSpeaking(dyn);
    el.classList.add('is-speaking');
    const spans = [...el.querySelectorAll('[data-w]')];
    // With the ruler on, it follows the voice; otherwise bring the part into view.
    if (ruler) ruler.follow(spans[0]);
    else el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });

    // Readers theatre: pause on the child's own lines so they read their part.
    if (role && block.type === 'script' && (block.role === role || block.role === 'N2')) {
      listen.index = bi + 1;
      listen.playing = false;
      setPlayLabel(dyn, '▶ Your turn! Tap when you have read it');
      return;
    }

    // Build the spoken text and remember where each word starts.
    let text = '';
    const starts = [];
    block.words.forEach((w) => {
      starts.push(text.length);
      text += w.text + ' ';
    });
    const ok = await say(text, {
      rate: store.prefs.rate ?? 0.85,
      onWord: (ci) => {
        let wi = 0;
        while (wi + 1 < starts.length && starts[wi + 1] <= ci) wi++;
        spans.forEach((s) => s.classList.toggle('is-speaking', Number(s.dataset.w) === wi));
        const cur = spans.find((s) => Number(s.dataset.w) === wi);
        if (cur) ruler?.follow(cur);
      },
    });
    if (!ok || gen !== listen.gen) return;
  }
  listen.index = 0;
  listen.playing = false;
  clearSpeaking(dyn);
  setPlayLabel(dyn, '▶ Play again');
}

function stopListening(keepPlace = false) {
  if (!listen) return;
  listen.gen = (listen.gen ?? 0) + 1;
  listen.playing = false;
  stopAudio();
  const dyn = document.querySelector('.reader-dynamic');
  if (dyn) {
    if (!keepPlace) clearSpeaking(dyn);
    else dyn.querySelectorAll('.w.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
    setPlayLabel(dyn, keepPlace ? '▶ Carry on' : '▶ Play');
  }
}
