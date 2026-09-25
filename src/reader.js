/**
 * Story reader — one continuous activity:
 *
 *   🤝 Warm-up        three words from the story: hear it, try it, tick it
 *   📖 Read           the child reads aloud; stuck? tap any word for help
 *   🎧 Listen         the story is read aloud with the words highlighted
 *   📏 Ruler          word / line / window reading ruler
 *   ⚙️ Settings       colours, text size, sound, voice speed, colour key
 *   ✏️ Questions      forgiving: check, look at the clue, try again
 *   🌟 Ending         read again · next story · finish for today
 *   ⏱ Reading pace   an optional, grown-up-led timing (not a child reward)
 *
 * The story is built once per visit. Settings change it in place, so answers,
 * reading place, the chosen part, the timer and playback are never lost to a
 * re-render. Place and answers are also saved for next time.
 */

import { store } from './store.js';
import { STORIES } from './content.js';
import { esc, wordHtml, wordsHtml } from './render.js';
import { openSoundItOut, closeSoundItOut } from './soundItOut.js';
import { renderQuiz } from './quiz.js';
import { say, soundOn, stopAudio, canSpeak } from './audio.js';
import { createRuler, RULER_MODES } from './ruler.js';
import { readingPace, warmupWords, allLessonWords, nextStory } from './insights.js';

let listen = null; // { index, playing, gen, story }
let timer = null; // reading-pace stopwatch
let ruler = null; // live Reading Ruler, when switched on
let rulerState = null; // last position reported by the ruler
let view = null; // { story, dyn, storyEl, words, helped:Set }

const LEGEND_ITEMS = `
    <span><b class="c-long">a</b> long vowel</span>
    <span><b class="c-short">o</b> other vowel sound (small letter shows it)</span>
    <span><b class="c-diph">ar</b> diphthong</span>
    <span><b class="c-silent">e</b> silent (dotted underline)</span>
    <span><b class="c-alt">ph</b> says the small letter above</span>`;

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = () => (reduceMotion() ? 'auto' : 'smooth');
const legendOpen = () => store.prefs.legend ?? matchMedia('(min-width: 700px)').matches;
const rulerMode = () => RULER_MODES.find((m) => m.id === store.prefs.rulerMode) ?? RULER_MODES[1];

export function renderReader(root, story) {
  leaveReader();
  store.markOpened(story.id);
  const wbNum = story.workbook.replace(/\D/g, '');
  root.innerHTML = `
    <article class="reader">
      <header class="reader-head">
        <a class="btn btn--ghost" href="#/wb/${esc(story.workbook)}">← Stories</a>
        <span class="badge">Workbook ${esc(wbNum)} · Lesson ${esc(story.lesson)}</span>
        <span class="badge badge--soft">${esc(story.lessonInfo?.title ?? '')}</span>
      </header>
      <h1 class="reader-title">${wordsHtml(story.titleWords)}</h1>
      <div class="reader-dynamic"></div>
    </article>`;
  const dyn = root.querySelector('.reader-dynamic');
  const words = warmupWords(story);
  if (words.length && !store.warmupDone(story.id)) renderWarmup(dyn, story, words);
  else renderBody(dyn, story);
}

// ── Warm-up: three words, one small step each ─────────────────────────────

function renderWarmup(dyn, story, words) {
  const done = new Set();
  const all = allLessonWords(story);
  const audio = soundOn() && canSpeak();
  dyn.innerHTML = `
    <section class="gate" aria-labelledby="gate-title">
      <h2 id="gate-title">🤝 Warm up with ${words.length} word${words.length > 1 ? 's' : ''}</h2>
      <p class="gate-lead">These words are in the story. For each one: ${audio ? '<b>hear it</b>, ' : ''}<b>try it</b>, then tick it.</p>
      <div class="warm-cards">
        ${words
          .map(
            (w, i) => `
          <div class="warm-card" data-i="${i}">
            <div class="warm-word">${wordHtml(w)}</div>
            ${w.keyWord ? '<p class="warm-key">💬 Key word: what does it mean? Say a sentence with it.</p>' : ''}
            <div class="warm-actions">
              ${audio ? '<button class="btn btn--ghost" type="button" data-hear>🔊 Hear it</button>' : ''}
              <button class="btn btn--ghost" type="button" data-try>🔤 Try it</button>
            </div>
            <button class="btn warm-tick" type="button" data-tick aria-pressed="false">✓ I’ve practised this word</button>
          </div>`,
          )
          .join('')}
      </div>
      <div class="gate-row">
        <span class="gate-progress" aria-live="polite">0 of ${words.length} practised</span>
        <button class="btn btn--ghost" type="button" data-skip>Skip warm-up</button>
        <button class="btn btn--primary" type="button" data-go disabled>Start reading →</button>
      </div>
      ${
        all.length > words.length
          ? `<details class="warm-all"><summary>See all lesson words (${all.length})</summary>
              <p>For grown-ups and confident readers. Tap a word to sound it out.</p>
              <div class="chip-wrap">${all
                .map((w, i) => `<button class="word-chip${w.key ? ' word-chip--key' : ''}" type="button" data-all="${i}">${wordHtml(w)}</button>`)
                .join('')}</div></details>`
          : ''
      }
    </section>`;

  const progress = dyn.querySelector('.gate-progress');
  const go = dyn.querySelector('[data-go]');
  const tick = (card) => {
    const i = Number(card.dataset.i);
    done.add(i);
    card.classList.add('is-done');
    const b = card.querySelector('[data-tick]');
    b.setAttribute('aria-pressed', 'true');
    b.textContent = '✓ Practised';
    progress.textContent =
      done.size >= words.length ? '🌟 All warmed up — ready to read!' : `${done.size} of ${words.length} practised`;
    go.disabled = done.size < words.length;
    if (!go.disabled) go.focus({ preventScroll: true });
  };
  dyn.querySelectorAll('.warm-card').forEach((card) => {
    const w = words[Number(card.dataset.i)];
    card.querySelector('[data-hear]')?.addEventListener('click', () => say(w.word, { rate: 0.8 }));
    card.querySelector('[data-try]').addEventListener('click', (e) => openSoundItOut(w, e.currentTarget, { backLabel: '↩ Back to the warm-up' }));
    card.querySelector('[data-tick]').addEventListener('click', () => tick(card));
  });
  dyn.querySelectorAll('[data-all]').forEach((chip) =>
    chip.addEventListener('click', () => openSoundItOut(all[Number(chip.dataset.all)], chip, { backLabel: '↩ Back to the warm-up' })),
  );
  const proceed = (how) => {
    closeSoundItOut();
    store.setWarmup(story.id, how);
    renderBody(dyn, story);
    dyn.querySelector('.story')?.focus({ preventScroll: true });
  };
  go.addEventListener('click', () => proceed('done'));
  dyn.querySelector('[data-skip]').addEventListener('click', () => proceed('skipped'));
}

// ── Story body ─────────────────────────────────────────────────────────────

function blockHtml(block, bi, story) {
  if (block.type === 'note') return `<p class="blk note" data-b="${bi}">📝 ${esc(block.text)}</p>`;
  const words = block.words
    .map((w, wi) => {
      const cls = `w${w.bold ? ' w--bold' : ''}${w.key ? ' w--key' : ''}${/[A-Za-z]/.test(w.text) ? ' w--tap' : ''}`;
      return `<span class="${cls}" data-b="${bi}" data-w="${wi}">${wordHtml(w)}</span>`;
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

const tbBtn = (act, icon, label, pressed) =>
  `<button type="button" class="tb-btn" data-act="${act}" ${act === 'settings' ? `aria-expanded="${pressed}"` : `aria-pressed="${pressed}"`}>
     <span class="tb-i" aria-hidden="true">${icon}</span><span>${label}</span></button>`;

const toggle = (key, label, on) =>
  `<button type="button" class="switch" data-set="${key}" aria-pressed="${on}"><span class="switch-t">${label}</span><span class="switch-k" aria-hidden="true"></span></button>`;

function settingsHtml() {
  const p = store.prefs;
  const slow = (p.rate ?? 0.85) < 0.8;
  return `
    <div class="settings" id="reader-settings" role="group" aria-label="Settings" hidden>
      ${toggle('coding', '🎨 Colour coding', p.coding)}
      ${toggle('legend', '🗝️ Colour key', legendOpen())}
      ${toggle('sound', '🔊 Sounds and reading aloud', p.sound !== false)}
      <div class="set-row"><span>🔤 Text size</span>
        <span class="set-pair"><button class="btn btn--small" type="button" data-size="-1" aria-label="Smaller text">A−</button>
        <button class="btn btn--small" type="button" data-size="1" aria-label="Bigger text">A+</button></span></div>
      <div class="set-row"><span>🐢 Reading-aloud speed</span>
        <span class="set-pair" role="group" aria-label="Reading-aloud speed">
        <button class="btn btn--small" type="button" data-rate="0.85" aria-pressed="${!slow}">Normal</button>
        <button class="btn btn--small" type="button" data-rate="0.65" aria-pressed="${slow}">Slower</button></span></div>
      <button class="btn btn--primary btn--small settings-done" type="button">Done</button>
    </div>`;
}

function paceHtml(story) {
  const last = store.record(story.id).pace.at(-1);
  return `
    <details class="pace">
      <summary>⏱ Reading pace <small>for grown-ups</small></summary>
      <div class="pace-body">
        <p>Time one read-aloud of the whole story (${story.wordCount} words). The app works out
          <strong>words per minute</strong>. It can’t hear mistakes, so if you count them it can also show accuracy.</p>
        <div class="pace-row"><span class="clock" aria-live="off">0:00</span>
          <button class="btn btn--ghost" type="button" data-timer>Start timing</button></div>
        <form class="pace-form" hidden>
          <p class="pace-time"></p>
          <label class="pace-field">Mistakes you counted <small>(optional)</small>
            <input type="number" name="errors" min="0" max="${story.wordCount}" inputmode="numeric" /></label>
          <fieldset class="pace-field"><legend>How did they read?</legend>
            <label><input type="radio" name="support" value="independent" /> On their own</label>
            <label><input type="radio" name="support" value="supported" /> With some help</label></fieldset>
          <div class="pace-row"><button class="btn btn--primary btn--small" type="submit">Save</button>
            <button class="btn btn--ghost btn--small" type="button" data-discard>Don’t save</button></div>
        </form>
        <p class="pace-result" aria-live="polite">${last ? `Last time: ${paceText(last)}` : ''}</p>
      </div>
    </details>`;
}

function paceText(e) {
  const secs = `${fmt(e.seconds)}`;
  let t = `${e.wpm} words per minute (${secs})`;
  if (e.accuracy != null) t += ` · ${e.errors} mistake${e.errors === 1 ? '' : 's'}: ${e.accuracy}% accurate, ${e.wcpm} words correct per minute`;
  if (e.support) t += ` · ${e.support === 'independent' ? 'on their own' : 'with some help'}`;
  return t;
}

function renderBody(dyn, story) {
  const prefs = store.prefs;
  const rec = store.record(story.id);
  const roles = story.roles ? Object.entries(story.roles) : [];
  const read = store.isRead(story.id);
  const quizStarted = Boolean(rec.quiz);
  const place = rec.place ?? 0;
  const showTip = !store.seen('tap-help');

  dyn.innerHTML = `
    <div class="toolbar" role="toolbar" aria-label="Reading tools">
      <div class="tb-row">
        ${tbBtn('listen', '🎧', 'Listen', false)}
        ${tbBtn('ruler', '📏', 'Ruler', prefs.ruler)}
        ${tbBtn('settings', '⚙️', 'Settings', false)}
      </div>
      ${settingsHtml()}
    </div>
    ${
      showTip
        ? `<div class="tap-tip" role="note"><span class="tap-tip-i" aria-hidden="true">👆</span>
             <p><strong>Stuck? Tap a word.</strong> You can hear its sounds and blend it. Try the glowing word!</p>
             <button class="btn btn--small" type="button" data-tip-ok>Got it</button></div>`
        : ''
    }
    ${place > 0 && !read ? `<p class="welcome-back">📍 Welcome back! We’ve gone to where you stopped. <button class="link-btn" type="button" data-from-start>Start from the beginning</button></p>` : ''}
    <details class="legend" ${legendOpen() ? 'open' : ''} ${prefs.coding ? '' : 'hidden'}><summary>🗝️ Colour key</summary><div class="legend-items">${LEGEND_ITEMS}</div></details>
    ${
      roles.length
        ? `<label class="role-pick">🎭 I am reading:
            <select><option value="">— everyone —</option>${roles
              .map(([k, v]) => `<option value="${esc(k)}" ${rec.role === k ? 'selected' : ''}>${esc(v)}</option>`)
              .join('')}</select></label>`
        : ''
    }
    ${paceHtml(story)}
    <div class="story${prefs.coding ? '' : ' coding-off'}" style="--size:${prefs.size}" tabindex="-1">
      ${story.blocks.map((b, i) => blockHtml(b, i, story)).join('')}
    </div>
    <div class="dock" hidden><div class="dock-listen"></div><div class="dock-ruler"></div></div>
    <div class="finish">
      <button class="btn btn--primary btn--big" type="button" data-finish>${read ? '✓ I’ve read it again' : '✓ I’ve read the story'}</button>
      <p class="finish-note">Tap this when you get to the end.</p>
    </div>
    <div class="quiz-wrap" ${read || quizStarted ? '' : 'hidden'}></div>
    <section class="ending" hidden aria-live="polite"></section>
    <button class="btn btn--primary back-to-q" type="button" hidden>↩ Back to the question</button>`;

  const storyEl = dyn.querySelector('.story');
  view = { story, dyn, storyEl, words: [...storyEl.querySelectorAll('.blk [data-w]')], helped: new Set(), listened: false };
  listen = { index: 0, playing: false, gen: 0, story: story.id };

  wireToolbar(dyn, story, storyEl);

  // Readers theatre: remember the part and highlight its lines
  const roleSel = dyn.querySelector('.role-pick select');
  const applyRole = () => {
    const r = roleSel.value;
    storyEl.classList.toggle('has-role', Boolean(r));
    storyEl.querySelectorAll('.blk--script').forEach((p) => {
      const mine = p.dataset.role === r || (p.dataset.role === 'N2' && r);
      p.classList.toggle('is-mine', Boolean(r) && mine);
    });
  };
  roleSel?.addEventListener('change', () => {
    applyRole();
    store.saveRole(story.id, roleSel.value);
  });
  if (roleSel) applyRole();

  // Tap a word → help. Works while reading, listening or using the ruler.
  storyEl.addEventListener('click', (e) => {
    if (e.target.closest('.ruler-layer')) return;
    const w = e.target.closest('[data-w]');
    ruler?.tap(e.clientY, w);
    if (w?.classList.contains('w--tap')) wordHelp(w);
  });

  // First-time tip: one glowing word to try
  if (showTip) {
    const demo = view.words.find((w) => w.classList.contains('w--tap') && w.textContent.replace(/[^A-Za-z]/g, '').length >= 4);
    demo?.classList.add('is-demo');
    dyn.querySelector('[data-tip-ok]').addEventListener('click', dismissTip);
  }

  // Pace (grown-up)
  wirePace(dyn, story);

  // Finish → questions → ending
  const quizWrap = dyn.querySelector('.quiz-wrap');
  const finish = dyn.querySelector('[data-finish]');
  const showQuiz = () => {
    quizWrap.hidden = false;
    if (!story.quiz.length) {
      quizWrap.innerHTML = '';
      showEnding(dyn, story);
      return;
    }
    renderQuiz(quizWrap, story, { onLook: (clue, li) => lookAtStory(clue, li), onComplete: () => showEnding(dyn, story) });
    if (!story.quiz.some((q) => ['tf', 'mc', 'cloze', 'order'].includes(q.type))) showEnding(dyn, story);
  };
  if (read || quizStarted) showQuiz();
  finish.addEventListener('click', () => {
    const times = store.markFinished(story.id);
    stopListening();
    finish.disabled = true;
    finish.textContent = times > 1 ? `✓ Read ${times} times — well done!` : '✓ Read — well done!';
    dyn.querySelector('.finish-note').textContent = story.quiz.length ? 'Now answer the questions below.' : '';
    dyn.querySelector('.welcome-back')?.remove();
    showQuiz();
    (story.quiz.length ? quizWrap : dyn.querySelector('.ending')).scrollIntoView({ behavior: smooth(), block: 'start' });
  });

  // Where they stopped: back to it (and keep saving it)
  dyn.querySelector('[data-from-start]')?.addEventListener('click', (e) => {
    e.currentTarget.parentElement.remove();
    store.savePlace(story.id, 0);
    goToWord(0);
  });
  if (place > 0 && !read) requestAnimationFrame(() => goToWord(place));
  else if (quizStarted && !rec.quiz.done) requestAnimationFrame(() => quizWrap.querySelector('.q')?.scrollIntoView({ block: 'center' }));

  drawDock(dyn, story);
  if (prefs.ruler) startRuler(dyn, story, place > 0 && !read ? place : null);
}

// ── Toolbar and settings (change the page in place) ──────────────────────

function wireToolbar(dyn, story, storyEl) {
  const panel = dyn.querySelector('.settings');
  const setBtn = dyn.querySelector('[data-act="settings"]');
  const closeSettings = () => {
    panel.hidden = true;
    setBtn.setAttribute('aria-expanded', 'false');
  };

  dyn.querySelector('[data-act="listen"]').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (!on) stopListening();
    drawDock(dyn, story);
    if (on) dyn.querySelector('[data-listen="play"]')?.focus({ preventScroll: true });
  });
  dyn.querySelector('[data-act="ruler"]').addEventListener('click', (e) => {
    const on = !store.prefs.ruler;
    store.setPref('ruler', on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    destroyRuler();
    drawDock(dyn, story);
    if (on) startRuler(dyn, story, null);
  });
  setBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    setBtn.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) panel.querySelector('button')?.focus({ preventScroll: true });
  });
  panel.querySelector('.settings-done').addEventListener('click', () => {
    closeSettings();
    setBtn.focus({ preventScroll: true });
  });

  panel.querySelectorAll('[data-set]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.set;
      const on = key === 'legend' ? !legendOpen() : !(store.prefs[key] ?? true);
      store.setPref(key, on);
      b.setAttribute('aria-pressed', String(on));
      const legend = dyn.querySelector('.legend');
      if (key === 'coding') {
        storyEl.classList.toggle('coding-off', !on);
        legend.hidden = !on;
      }
      if (key === 'legend') legend.open = on;
      if (key === 'sound') {
        stopListening(true);
        drawDock(dyn, story);
      }
    }),
  );
  panel.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      const next = Math.min(1.6, Math.max(0.8, store.prefs.size + Number(b.dataset.size) * 0.15));
      store.setPref('size', Math.round(next * 100) / 100);
      storyEl.style.setProperty('--size', store.prefs.size);
      if (ruler) setTimeout(() => ruler?.reveal(), 80); // the ruler re-measures itself
    }),
  );
  panel.querySelectorAll('[data-rate]').forEach((b) =>
    b.addEventListener('click', () => {
      store.setPref('rate', Number(b.dataset.rate));
      panel.querySelectorAll('[data-rate]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
}

function dismissTip() {
  store.markSeen('tap-help');
  view?.dyn.querySelector('.tap-tip')?.remove();
  view?.storyEl.querySelectorAll('.is-demo').forEach((w) => w.classList.remove('is-demo'));
}

// ── Word help ──────────────────────────────────────────────────────────────

function wordHelp(el) {
  const { story, storyEl } = view;
  const word = story.blocks[Number(el.dataset.b)]?.words[Number(el.dataset.w)];
  if (!word) return;
  if (!store.seen('tap-help')) dismissTip();
  const wasPlaying = listen?.playing;
  if (wasPlaying) stopListening(true); // pause the voice while the child works on the word
  storyEl.querySelectorAll('.w.is-active').forEach((w) => w.classList.remove('is-active'));
  el.classList.add('is-active');
  store.noteHelp(story.id, word.word);
  view.helped.add(word.word.toLowerCase());
  openSoundItOut(word, el, {
    backLabel: wasPlaying ? '▶ Continue reading' : '↩ Back to my story',
    onBack: () => {
      el.classList.remove('is-active');
      if (wasPlaying) startListening(view.dyn, story, listen.index);
    },
  });
}

// ── Reading place ──────────────────────────────────────────────────────────

/** Bring a word into the calm upper part of the screen. */
function goToWord(i) {
  if (!view) return;
  if (ruler) return ruler.goTo(i);
  const el = view.words[Math.max(0, Math.min(view.words.length - 1, i))];
  if (!el) return;
  const safe = safeArea();
  const top = el.getBoundingClientRect().top;
  window.scrollBy({ top: top - (safe.top + (safe.bottom - safe.top) * 0.28), behavior: smooth() });
  el.classList.add('is-here');
  setTimeout(() => el.classList.remove('is-here'), 2500);
}

// The ruler reports its own position; otherwise the first line on screen is the place.
let placeTimer = 0;
addEventListener(
  'scroll',
  () => {
    if (!view || ruler) return;
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => {
      if (!view) return;
      const box = view.storyEl.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight) return; // reading the questions, not the story
      const safe = safeArea();
      const i = view.words.findIndex((w) => w.getBoundingClientRect().top >= safe.top);
      if (i >= 0 && !store.isRead(view.story.id)) store.savePlace(view.story.id, i);
    }, 500);
  },
  { passive: true },
);

// ── Look at the story (from a question) ───────────────────────────────────

function lookAtStory(clue, li) {
  if (!view) return;
  const { storyEl, dyn } = view;
  storyEl.querySelectorAll('.is-clue').forEach((w) => w.classList.remove('is-clue'));
  const clueWords = [...storyEl.querySelectorAll(`[data-b="${clue.block}"][data-w]`)].filter((w) => {
    const k = Number(w.dataset.w);
    return k >= clue.from && k <= clue.to;
  });
  clueWords.forEach((w) => w.classList.add('is-clue'));
  const first = clueWords[0];
  if (!first) return;
  if (ruler) ruler.follow(first);
  else {
    const safe = safeArea();
    window.scrollBy({ top: first.getBoundingClientRect().top - (safe.top + (safe.bottom - safe.top) * 0.3), behavior: smooth() });
  }
  const back = dyn.querySelector('.back-to-q');
  back.hidden = false;
  back.onclick = () => {
    back.hidden = true;
    storyEl.querySelectorAll('.is-clue').forEach((w) => w.classList.remove('is-clue'));
    li.scrollIntoView({ behavior: smooth(), block: 'center' });
    li.querySelector('.chip:not(:disabled), select:not(:disabled), textarea')?.focus({ preventScroll: true });
  };
}

// ── Ending ─────────────────────────────────────────────────────────────────

function showEnding(dyn, story) {
  const el = dyn.querySelector('.ending');
  if (!el || !store.isRead(story.id)) return;
  const name = store.active?.name ?? '';
  const times = store.timesFinished(story.id);
  const quiz = store.lastQuiz(story.id);
  const helped = view?.helped.size ?? 0;
  const next = nextStory(STORIES, story.id);
  const facts = [
    `You read <strong>“${esc(story.title)}”</strong> — ${story.wordCount} words${times > 1 ? `, for the ${ordinal(times)} time` : ''}.`,
  ];
  if (helped) facts.push(`You worked on ${helped} word${helped > 1 ? 's' : ''} with Sound It Out.`);
  if (quiz?.total && store.quiz(story.id)?.done) facts.push(`You answered ${quiz.total} question${quiz.total > 1 ? 's' : ''} about the story.`);
  if (story.roles && store.record(story.id).role) facts.push(`You read the part of ${esc(story.roles[store.record(story.id).role] ?? '')}.`);
  el.hidden = false;
  el.innerHTML = `
    <h2>🌟 Great reading${name ? `, ${esc(name)}` : ''}!</h2>
    <ul class="ending-facts">${facts.map((f) => `<li>${f}</li>`).join('')}</ul>
    <div class="ending-actions">
      <button class="btn btn--ghost" type="button" data-again>📖 Read it again</button>
      ${next ? `<a class="btn btn--ghost" href="#/story/${esc(next.id)}">➡️ Next: ${esc(next.title)}</a>` : ''}
      <a class="btn btn--primary" href="#/done">🏁 Finish for today</a>
    </div>`;
  el.querySelector('[data-again]').addEventListener('click', () => {
    const fin = dyn.querySelector('[data-finish]');
    fin.disabled = false;
    fin.textContent = '✓ I’ve read it again';
    dyn.querySelector('.finish-note').textContent = 'Tap this when you get to the end.';
    view.helped.clear();
    window.scrollTo({ top: view.storyEl.getBoundingClientRect().top + scrollY - 140, behavior: smooth() });
    if (ruler) ruler.goTo(0);
  });
}

const ordinal = (n) => `${n}${n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : n % 10 === 1 && n % 100 !== 11 ? 'st' : 'th'}`;

// ── Dock: listen + ruler controls ─────────────────────────────────────────

function drawDock(dyn, story) {
  const listening = dyn.querySelector('[data-act="listen"]')?.getAttribute('aria-pressed') === 'true';
  const dock = dyn.querySelector('.dock');
  dock.querySelector('.dock-listen').innerHTML = listening ? listenBarHtml() : '';
  if (listening) wireListenBar(dyn, story);
  if (!store.prefs.ruler) dock.querySelector('.dock-ruler').innerHTML = '';
  dock.hidden = !listening && !store.prefs.ruler;
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

function startRuler(dyn, story, word) {
  const storyEl = dyn.querySelector('.story');
  const holder = dyn.querySelector('.dock-ruler');
  holder.innerHTML = rulerNavHtml();
  const nav = holder.querySelector('.ruler-nav');
  const m = rulerMode();
  const posLabel = nav.querySelector('.ruler-pos small');
  const posNum = nav.querySelector('.ruler-pos b');
  const next = nav.querySelector('.ruler-next');
  const back = nav.querySelector('.ruler-back');
  let saveT = 0;

  ruler = createRuler(storyEl, {
    mode: m.id,
    word,
    safeArea,
    onMove(s) {
      rulerState = s;
      const byWord = m.id === 'word';
      posLabel.textContent = byWord ? 'Word' : 'Line';
      posNum.textContent = byWord ? `${s.word + 1} / ${s.words}` : `${s.line + 1} / ${s.lines}`;
      back.disabled = byWord ? s.word === 0 : s.line === 0;
      next.textContent = s.atEnd ? 'The end ✓' : byWord ? 'Next word ▶' : 'Next line ▶';
      next.classList.toggle('is-end', s.atEnd);
      clearTimeout(saveT);
      saveT = setTimeout(() => !store.isRead(story.id) && store.savePlace(story.id, s.word), 400);
    },
  });

  nav.querySelector('[data-ruler="-1"]').addEventListener('click', () => ruler?.prev());
  next.addEventListener('click', () => {
    if (!rulerState?.atEnd) return ruler?.next();
    // Finished the last line: on to "I've read the story".
    const fin = dyn.querySelector('[data-finish]');
    fin?.scrollIntoView({ behavior: smooth(), block: 'center' });
    fin?.focus({ preventScroll: true });
  });
  nav.querySelector('[data-ruler-style]').addEventListener('click', () => {
    const at = rulerState?.word ?? 0;
    const i = RULER_MODES.indexOf(rulerMode());
    store.setPref('rulerMode', RULER_MODES[(i + 1) % RULER_MODES.length].id);
    destroyRuler();
    startRuler(dyn, story, at);
    dyn.querySelector('[data-ruler-style]')?.focus({ preventScroll: true });
  });
}

function destroyRuler() {
  ruler?.destroy();
  ruler = null;
  rulerState = null;
}

// Escape closes the settings panel.
document.addEventListener('keydown', (e) => {
  const panel = view?.dyn.querySelector('.settings');
  if (e.key !== 'Escape' || !panel || panel.hidden || document.querySelector('.sio:not([hidden])')) return;
  panel.hidden = true;
  view.dyn.querySelector('[data-act="settings"]')?.setAttribute('aria-expanded', 'false');
});

// Arrow keys move the ruler (↓ ↑ by line; → ← by word in Word mode);
// Enter opens help for the word the ruler points at.
document.addEventListener('keydown', (e) => {
  if (!ruler || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.target.closest?.('input, textarea, select, button, a, summary, [contenteditable="true"]')) {
    if (e.key === 'Enter' || !/^Arrow/.test(e.key)) return;
  }
  if (document.querySelector('.sio:not([hidden])')) return;
  const byWord = rulerMode().id === 'word';
  const act = {
    ArrowDown: () => ruler.nextLine(),
    ArrowUp: () => ruler.prevLine(),
    ArrowRight: () => (byWord ? ruler.next() : ruler.nextLine()),
    ArrowLeft: () => (byWord ? ruler.prev() : ruler.prevLine()),
    Enter: () => {
      const w = ruler.current();
      if (w?.classList.contains('w--tap')) wordHelp(w);
    },
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
    if (!small || !stuck || y < 80 || !tb.querySelector('.settings').hidden) {
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

// ── Reading pace (grown-up led) ────────────────────────────────────────────

function wirePace(dyn, story) {
  const clock = dyn.querySelector('.pace .clock');
  const btn = dyn.querySelector('[data-timer]');
  const form = dyn.querySelector('.pace-form');
  const result = dyn.querySelector('.pace-result');
  let secs = 0;
  btn.addEventListener('click', () => {
    if (!timer) {
      const start = performance.now();
      timer = { start, id: setInterval(() => (clock.textContent = fmt((performance.now() - start) / 1000)), 250) };
      btn.textContent = 'Stop';
      btn.classList.add('btn--primary');
      form.hidden = true;
      result.textContent = 'Timing… press Stop on the last word.';
      return;
    }
    secs = (performance.now() - timer.start) / 1000;
    stopTimer();
    btn.textContent = 'Time again';
    btn.classList.remove('btn--primary');
    clock.textContent = fmt(secs);
    if (secs < 5) {
      result.textContent = 'That was very quick. Start timing when reading begins.';
      return;
    }
    result.textContent = '';
    form.hidden = false;
    form.querySelector('.pace-time').textContent = `${story.wordCount} words in ${fmt(secs)}.`;
    form.errors.focus({ preventScroll: true });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errors = form.errors.value === '' ? null : Number(form.errors.value);
    const p = readingPace(story.wordCount, secs, errors);
    const entry = { words: story.wordCount, seconds: Math.round(secs), ...p, errors, support: form.support.value || null };
    store.savePace(story.id, entry);
    form.hidden = true;
    form.reset();
    result.textContent = `Saved: ${paceText(entry)}.`;
  });
  form.querySelector('[data-discard]').addEventListener('click', () => {
    form.hidden = true;
    form.reset();
    result.textContent = 'Not saved.';
  });
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function stopTimer() {
  if (timer) clearInterval(timer.id);
  timer = null;
}

/** Leaving the reader: stop everything that is running. */
export function leaveReader() {
  stopTimer();
  stopListening();
  destroyRuler();
  closeSoundItOut();
  view = null;
}

// ── Listen ─────────────────────────────────────────────────────────────────

function listenBarHtml() {
  if (!soundOn()) {
    return `<div class="listen-bar listen-bar--off"><span>🔇 Sound is off. Turn it on in ⚙️ Settings to hear the story.</span></div>`;
  }
  if (!canSpeak()) {
    return `<div class="listen-bar listen-bar--off"><span>This device can't read aloud. Try another browser.</span></div>`;
  }
  return `
    <div class="listen-bar" role="group" aria-label="Listen controls">
      <button class="btn btn--primary listen-play" type="button" data-listen="play">${listen?.index ? '▶ Carry on' : '▶ Play'}</button>
      <button class="btn btn--ghost" type="button" data-listen="restart">⏮ From the start</button>
    </div>`;
}

function wireListenBar(dyn, story) {
  dyn.querySelector('[data-listen="play"]')?.addEventListener('click', () => {
    if (listen.playing) return stopListening(true);
    startListening(dyn, story, listen.index || startBlock(story));
  });
  dyn.querySelector('[data-listen="restart"]')?.addEventListener('click', () => startListening(dyn, story, 0));
}

/** Where Play starts: the ruler's line, or the first part on screen. */
function startBlock(story) {
  if (!view) return 0;
  const el = ruler?.current() ?? view.words.find((w) => w.getBoundingClientRect().top >= safeArea().top);
  return el ? Number(el.dataset.b) : 0;
}

function setPlayLabel(dyn, text) {
  const b = dyn.querySelector('[data-listen="play"]');
  if (b) b.textContent = text;
}

function clearSpeaking(dyn) {
  dyn.querySelectorAll('.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
}

async function startListening(dyn, story, from) {
  if (!listen || !view) return;
  stopAudio();
  const gen = (listen.gen = (listen.gen ?? 0) + 1);
  listen.playing = true;
  listen.index = from;
  setPlayLabel(dyn, '⏸ Pause');
  if (!view.listened) {
    view.listened = true;
    store.noteListen(story.id);
  }
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
    else el.scrollIntoView({ block: 'center', behavior: smooth() });

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
  const was = listen.playing;
  listen.playing = false;
  if (was) stopAudio();
  const dyn = view?.dyn;
  if (dyn) {
    if (!keepPlace) {
      clearSpeaking(dyn);
      listen.index = 0;
    } else dyn.querySelectorAll('.w.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
    setPlayLabel(dyn, keepPlace && listen.index ? '▶ Carry on' : '▶ Play');
  }
}
