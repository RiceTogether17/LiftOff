/**
 * Everything outside the reader:
 *
 *   #/          Home — Continue reading · Today’s story · a favourite · all workbooks
 *   #/wb/ID     One workbook’s lessons and stories
 *   #/who       Who’s reading? (switch child)
 *   #/setup     Add a reader: name, avatar, where to start
 *   #/parent    Grown-ups: what was practised, help used, what next, settings, backup
 *   #/done      Finish for today
 */

import { WORKBOOKS, STORIES, storyById, workbookById } from './content.js';
import { store, AVATARS } from './store.js';
import { esc, wordsHtml } from './render.js';
import { todaysStory, favourite, suggestNext, tryTogether, inOrder } from './insights.js';

// Darkened so white text on them meets 4.5:1 contrast.
const SHELF_COLOURS = ['#c84c28', '#9b6a0b', '#218556', '#2877c5', '#8e44ad', '#c64e00'];
const shelfColour = (wbId) => SHELF_COLOURS[Number(String(wbId).replace(/\D/g, '')) % SHELF_COLOURS.length];
const wbNum = (id) => String(id).replace(/\D/g, '');

const today = () => new Date().toISOString().slice(0, 10);
function niceDate(d) {
  if (!d) return '';
  if (d === today()) return 'Today';
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (d === y) return 'Yesterday';
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shelvesHtml(activeId) {
  return `<nav class="shelves" aria-label="Workbooks">
    ${WORKBOOKS.map((w) => {
      const stories = STORIES.filter((s) => s.workbook === w.id);
      const read = stories.filter((s) => store.isRead(s.id)).length;
      return `<a class="shelf${w.id === activeId ? ' is-active' : ''}" href="#/wb/${esc(w.id)}"
                ${w.id === activeId ? 'aria-current="page"' : ''} style="--shelf:${shelfColour(w.id)}">
                <span class="shelf-n">${esc(wbNum(w.id))}</span><span class="shelf-t">Workbook</span>
                <span class="shelf-read">${read}/${stories.length}</span></a>`;
    }).join('')}
  </nav>`;
}

// ── Home ───────────────────────────────────────────────────────────────────

export function renderHome(root) {
  const p = store.active;
  const resume = store.resume ? storyById(store.resume) : null;
  const todays = todaysStory(STORIES, p?.start ?? null, store.isRead);
  const fav = favourite(STORIES, p);
  const resumeRec = resume ? store.record(resume.id) : null;
  const resumeWhat = resumeRec?.quiz && !resumeRec.quiz.done && store.isRead(resume.id) ? 'Your questions are waiting.' : 'Carry on from where you stopped.';

  const hero = (cls, kicker, s, meta, cta) => `
    <a class="hero ${cls}" href="#/story/${esc(s.id)}" style="--shelf:${shelfColour(s.workbook)}">
      <span class="hero-k">${kicker}</span>
      <span class="hero-title">${wordsHtml(s.titleWords)}</span>
      <span class="hero-meta">${meta}</span>
      <span class="btn btn--primary hero-cta">${cta}</span>
    </a>`;

  root.innerHTML = `
    <section class="home">
      <h1 class="hello"><span class="hello-a" aria-hidden="true">${esc(p?.avatar ?? '🚀')}</span> Hi ${esc(p?.name ?? 'there')}!</h1>
      <div class="home-cards">
        ${resume ? hero('hero--continue', '▶ Continue reading', resume, resumeWhat, 'Continue') : ''}
        ${
          todays && todays.id !== resume?.id
            ? hero(
                'hero--today',
                '⭐ Today’s story',
                todays,
                `Workbook ${esc(wbNum(todays.workbook))} · Lesson ${esc(todays.lesson)} · ${todays.wordCount} words${todays.roles ? ' · 🎭 a play' : ''}`,
                'Start',
              )
            : ''
        }
        ${!todays ? '<p class="hero hero--note">🎉 Every story from your starting point has been read! Pick a favourite, or any story below.</p>' : ''}
        ${fav && fav.id !== resume?.id ? hero('hero--fav', '💛 Read a favourite again', fav, `You’ve read it ${store.timesFinished(fav.id) === 1 ? 'once' : `${store.timesFinished(fav.id)} times`}. Reading a story again makes it smoother.`, 'Read again') : ''}
      </div>
      <h2 class="home-h">📚 All workbooks</h2>
      ${shelvesHtml(null)}
    </section>`;
}

// ── One workbook ───────────────────────────────────────────────────────────

export function renderShelf(root, activeId) {
  const wb = workbookById(activeId) ?? WORKBOOKS[0];
  const stories = STORIES.filter((s) => s.workbook === wb.id);
  const readCount = stories.filter((s) => store.isRead(s.id)).length;
  const todays = todaysStory(STORIES, store.active?.start ?? null, store.isRead);
  const pct = stories.length ? Math.round((readCount / stories.length) * 100) : 0;

  root.innerHTML = `
    <section class="library" style="--shelf:${shelfColour(wb.id)}">
      <a class="btn btn--ghost" href="#/">← Home</a>
      ${shelvesHtml(wb.id)}
      <div class="lib-strip">
        <strong>${esc(wb.title)}</strong><span>${esc(wb.subtitle)}</span>
        <span class="lib-progress">${readCount}/${stories.length} read
          <span class="bar"><span style="width:${pct}%"></span></span></span>
      </div>
      ${wb.lessons
        .filter((l) => l.stories.length)
        .map(
          (l) => `
        <section class="lesson">
          <h2 class="lesson-h"><span class="lesson-n">Lesson ${esc(l.number)}</span> ${esc(l.title)}</h2>
          <div class="cards">
            ${l.stories.map((s) => card(storyById(s.id), s.id === todays?.id)).join('')}
          </div>
        </section>`,
        )
        .join('')}
    </section>`;
}

function card(s, isToday) {
  const times = store.timesFinished(s.id);
  const q = store.lastQuiz(s.id);
  const minutes = Math.max(1, Math.round(s.wordCount / 60));
  return `
    <a class="card${times ? ' is-read' : ''}${isToday ? ' is-next' : ''}" href="#/story/${esc(s.id)}">
      ${isToday ? '<span class="card-flag">⭐ Today</span>' : ''}
      <span class="card-title">${wordsHtml(s.titleWords)}</span>
      <span class="card-meta">${s.wordCount} words · about ${minutes} min${s.roles ? ' · 🎭 play' : ''}</span>
      <span class="card-badges">
        ${times ? `<span class="pill pill--ok">✓ Read${times > 1 ? ` ×${times}` : ''}</span>` : ''}
        ${q ? '<span class="pill">✏️ Questions done</span>' : ''}
        ${store.resume === s.id ? '<span class="pill">▶ In progress</span>' : ''}
      </span>
    </a>`;
}

// ── Who's reading? ─────────────────────────────────────────────────────────

export function renderWho(root, onPick) {
  root.innerHTML = `
    <section class="who">
      <h1>Who’s reading?</h1>
      <div class="who-grid">
        ${store.profiles
          .map(
            (p) => `<button class="who-card${p.id === store.active?.id ? ' is-active' : ''}" type="button" data-id="${esc(p.id)}">
              <span class="who-a" aria-hidden="true">${esc(p.avatar)}</span><span class="who-n">${esc(p.name)}</span></button>`,
          )
          .join('')}
        <a class="who-card who-card--add" href="#/setup"><span class="who-a" aria-hidden="true">＋</span><span class="who-n">Add a reader</span></a>
      </div>
      <p class="who-note">Each reader has their own progress and settings on this device.</p>
    </section>`;
  root.querySelectorAll('[data-id]').forEach((b) =>
    b.addEventListener('click', () => {
      store.switchProfile(b.dataset.id);
      onPick?.();
    }),
  );
}

// ── Add a reader ───────────────────────────────────────────────────────────

function startPicker(start) {
  const wb = start?.workbook ?? WORKBOOKS[0]?.id;
  return `
    <div class="start-pick">
      <label>Workbook
        <select name="wb">${WORKBOOKS.map((w) => `<option value="${esc(w.id)}" ${w.id === wb ? 'selected' : ''}>${esc(w.title)} — ${esc(w.subtitle)}</option>`).join('')}</select></label>
      <label>Lesson <select name="lesson"></select></label>
    </div>
    <details class="not-sure"><summary>I’m not sure where to start</summary>
      <p>Your child’s teacher can tell you which LiftOff workbook and lesson the class is on — start there.
      If you can’t ask, start at <strong>Workbook 1, Lesson 1</strong>. The first stories are short, and you can move the starting point
      forward any time in <em>Grown-ups</em>. The app doesn’t test or guess your child’s level.</p></details>`;
}

function wireStartPicker(form, start) {
  const fill = () => {
    const wb = workbookById(form.wb.value);
    const lessons = (wb?.lessons ?? []).filter((l) => l.stories.length);
    form.lesson.innerHTML = lessons
      .map((l) => `<option value="${l.number}" ${start?.workbook === wb.id && start?.lesson === l.number ? 'selected' : ''}>Lesson ${l.number} — ${esc(l.title)}</option>`)
      .join('');
  };
  form.wb.addEventListener('change', fill);
  fill();
  return () => ({ workbook: form.wb.value, lesson: Number(form.lesson.value) });
}

export function renderSetup(root, onDone) {
  const first = store.profiles.length === 0;
  root.innerHTML = `
    <section class="setup">
      <form class="setup-card" autocomplete="off">
        <h1>${first ? '👋 Welcome! Who’s reading?' : '➕ Add a reader'}</h1>
        <p class="lib-sub">A grown-up can fill this in. It stays on this device.</p>
        <label class="setup-field">Child’s name or nickname
          <input name="name" maxlength="24" required placeholder="e.g. Mia" /></label>
        <fieldset class="setup-field"><legend>Pick a picture</legend>
          <div class="avatar-grid">${AVATARS.map((a, i) => `<label class="avatar-opt"><input type="radio" name="avatar" value="${a}" ${i === 0 ? 'checked' : ''} /><span aria-hidden="true">${a}</span><span class="sr-only">${a}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset class="setup-field"><legend>Where should we start?</legend>${startPicker(null)}</fieldset>
        <div class="setup-actions">
          ${first ? '' : '<a class="btn btn--ghost" href="#/who">Cancel</a>'}
          <button class="btn btn--primary btn--big" type="submit">Let’s read →</button>
        </div>
      </form>
    </section>`;
  const form = root.querySelector('form');
  const getStart = wireStartPicker(form, null);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    store.createProfile(form.name.value, form.avatar.value, getStart());
    onDone?.();
  });
  form.name.focus();
}

// ── Grown-ups ──────────────────────────────────────────────────────────────

const WHAT = {
  opened: 'opened',
  finished: 'read to the end',
  reread: 'read again',
  listened: 'listened to it read aloud',
  'warm-up': 'did the word warm-up',
  'warm-up skipped': 'skipped the warm-up',
  pace: 'reading pace timed',
  questions: 'answered the questions',
};

function recentActivity(log, n = 8) {
  const groups = [];
  for (const e of [...log].reverse()) {
    let g = groups.find((x) => x.story === e.story && x.date === e.date);
    if (!g) {
      if (groups.length >= n) continue;
      g = { story: e.story, date: e.date, whats: [], quiz: null };
      groups.push(g);
    }
    if (!g.whats.includes(e.what)) g.whats.push(e.what);
    if (e.what === 'questions' && !g.quiz) g.quiz = e;
  }
  return groups;
}

function activityText(g) {
  const whats = g.whats.filter((w) => w !== 'opened' || g.whats.length === 1).reverse();
  return whats
    .map((w) =>
      w === 'questions' && g.quiz
        ? `answered ${g.quiz.total} questions (${g.quiz.firstTry} right first time${g.quiz.withHelp ? `, ${g.quiz.withHelp} with a clue` : ''})`
        : WHAT[w] ?? w,
    )
    .join(', ');
}

export function renderParent(root, rerender) {
  const p = store.active;
  if (!p) return renderSetup(root, rerender);
  const recent = recentActivity(p.log);
  const helpWords = {};
  let listenedStories = 0;
  for (const r of Object.values(p.stories)) {
    for (const [w, n] of Object.entries(r.help ?? {})) helpWords[w] = (helpWords[w] ?? 0) + n;
    if (r.listened) listenedStories++;
  }
  const topHelp = Object.entries(helpWords).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const paces = Object.entries(p.stories).flatMap(([id, r]) => (r.pace ?? []).map((e) => ({ id, ...e })));
  const sugg = suggestNext(STORIES, p);
  const saveOk = store.checkSave();

  root.innerHTML = `
    <section class="parent">
      <header class="lib-head">
        <div><h1>👪 Grown-ups</h1>
        <p class="lib-sub">For <strong>${esc(p.avatar)} ${esc(p.name)}</strong> · <a href="#/who">switch reader</a></p></div>
        <a class="btn btn--ghost" href="#/">← Home</a>
      </header>

      <div class="p-grid">
        <section class="p-card p-card--next">
          <h2>➡️ Suggested next</h2>
          ${sugg.story ? `<p><a class="p-story" href="#/story/${esc(sugg.story.id)}">${esc(sugg.story.title)}</a></p>` : ''}
          <p>${esc(sugg.reason)}</p>
        </section>
        <section class="p-card">
          <h2>🤝 One thing to try together</h2>
          <p>${esc(tryTogether(sugg.story, p))}</p>
        </section>
        <section class="p-card">
          <h2>🗓️ Recently practised</h2>
          ${
            recent.length
              ? `<ul class="p-list">${recent
                  .map((g) => `<li><span class="p-date">${esc(niceDate(g.date))}</span> <strong>${esc(storyById(g.story)?.title ?? g.story)}</strong> — ${esc(activityText(g))}</li>`)
                  .join('')}</ul>`
              : '<p>Nothing yet. Open a story to begin.</p>'
          }
        </section>
        <section class="p-card">
          <h2>🛟 Help used</h2>
          ${topHelp.length ? `<p>Words looked at in Sound It Out: ${topHelp.map(([w, n]) => `<b>${esc(w)}</b>${n > 1 ? ` (${n})` : ''}`).join(', ')}.</p>` : '<p>No words looked at in Sound It Out yet.</p>'}
          <p>${listenedStories ? `Listened to ${listenedStories} stor${listenedStories > 1 ? 'ies' : 'y'} read aloud.` : 'Hasn’t used Listen yet.'}</p>
          ${
            paces.length
              ? `<p>Reading pace you timed: ${paces
                  .slice(-3)
                  .map((e) => `${esc(storyById(e.id)?.title ?? '')} — ${e.wpm} words/min${e.accuracy != null ? `, ${e.accuracy}% accurate` : ''}${e.support ? ` (${e.support === 'independent' ? 'on their own' : 'with help'})` : ''}`)
                  .join('; ')}.</p>`
              : ''
          }
          <p class="p-note">Looking at a word shows your child checked it — not that they can’t read it. Reading pace is words per minute; it only shows accuracy when you counted mistakes.</p>
        </section>
      </div>

      <section class="p-card">
        <h2>📍 Where to start</h2>
        <form class="start-form">${startPicker(p.start)}
          <button class="btn btn--primary btn--small" type="submit">Save starting point</button>
          <span class="start-saved" role="status"></span></form>
      </section>

      <section class="p-card">
        <h2>🧒 Readers on this device</h2>
        <ul class="p-readers">
          ${store.profiles
            .map(
              (x) => `<li><span class="who-a" aria-hidden="true">${esc(x.avatar)}</span> <strong>${esc(x.name)}</strong>${x.id === p.id ? ' <span class="pill">reading now</span>' : ''}
                <span class="p-reader-actions">
                  <button class="btn btn--small btn--ghost" type="button" data-rename="${esc(x.id)}">Rename</button>
                  <button class="btn btn--small btn--ghost" type="button" data-delete="${esc(x.id)}">Remove</button></span></li>`,
            )
            .join('')}
        </ul>
        <a class="btn btn--small" href="#/setup">➕ Add a reader</a>
      </section>

      <section class="p-card">
        <h2>💾 Saving and backup</h2>
        <p class="save-status ${saveOk ? 'is-ok' : 'is-bad'}">${
          saveOk
            ? '✓ Progress is saved on this device (in this browser).'
            : '⚠️ Progress can’t be saved on this device right now — the browser is blocking storage (for example, private browsing).'
        }</p>
        <p>Progress stays on this device only. Download a backup to keep it safe or move it to another device.</p>
        <div class="p-actions">
          <button class="btn btn--small" type="button" data-export>⬇️ Download backup</button>
          <label class="btn btn--small">⬆️ Restore a backup<input type="file" accept="application/json,.json" data-import hidden /></label>
        </div>
        <p class="import-msg" role="status"></p>
        <div class="p-actions p-actions--danger">
          <button class="btn btn--small btn--ghost" type="button" data-reset>Reset ${esc(p.name)}’s progress</button>
          <a class="btn btn--small btn--ghost" href="#/lock">🔒 Lock the stories</a>
        </div>
      </section>

      <details class="p-all"><summary>📊 View all activity</summary>${allActivity()}</details>
    </section>`;

  const form = root.querySelector('.start-form');
  const getStart = wireStartPicker(form, p.start);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    store.updateProfile(p.id, { start: getStart() });
    root.querySelector('.start-saved').textContent = '✓ Saved — Today’s story now starts from here.';
  });
  root.querySelectorAll('[data-rename]').forEach((b) =>
    b.addEventListener('click', () => {
      const x = store.profiles.find((y) => y.id === b.dataset.rename);
      const name = prompt('New name', x?.name ?? '');
      if (name) {
        store.updateProfile(x.id, { name });
        rerender();
      }
    }),
  );
  root.querySelectorAll('[data-delete]').forEach((b) =>
    b.addEventListener('click', () => {
      const x = store.profiles.find((y) => y.id === b.dataset.delete);
      if (x && confirm(`Remove ${x.name} and all their progress from this device?`)) {
        store.deleteProfile(x.id);
        rerender();
      }
    }),
  );
  root.querySelector('[data-reset]').addEventListener('click', () => {
    if (confirm(`Clear all of ${p.name}’s reading progress on this device? Settings are kept.`)) {
      store.resetActive();
      rerender();
    }
  });
  root.querySelector('[data-export]').addEventListener('click', () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `liftoff-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  root.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const msg = root.querySelector('.import-msg');
    if (!file) return;
    if (!confirm('Restoring replaces all readers and progress on this device with the backup. Continue?')) return;
    try {
      store.importJson(await file.text());
      rerender();
    } catch (err) {
      msg.textContent = `⚠️ ${err.message.startsWith('This file') ? err.message : 'That file could not be read as a backup.'}`;
    }
  });
}

function allActivity() {
  return WORKBOOKS.map((wb) => {
    const stories = inOrder(STORIES.filter((s) => s.workbook === wb.id));
    return `<h3>${esc(wb.title)} <small>${esc(wb.subtitle)}</small></h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Lesson</th><th>Story</th><th>Opened</th><th>Read</th><th>Questions</th><th>Pace</th></tr></thead>
        <tbody>${stories
          .map((s) => {
            const r = store.active?.stories[s.id];
            const q = r?.quizHistory?.at(-1);
            const pace = r?.pace?.at(-1);
            return `<tr><td>${esc(s.lesson)}</td><td><a href="#/story/${esc(s.id)}">${esc(s.title)}</a></td>
              <td>${r?.opened ? niceDate(r.lastOpened) || '✓' : '—'}</td>
              <td>${r?.finished?.length ? `${r.finished.length}×` : '—'}</td>
              <td>${q ? `${q.firstTry}/${q.total} first try${q.withHelp ? ` · +${q.withHelp} with clue` : ''}` : '—'}</td>
              <td>${pace ? `${pace.wpm} wpm${pace.accuracy != null ? ` · ${pace.accuracy}%` : ''}` : '—'}</td></tr>`;
          })
          .join('')}</tbody>
      </table></div>`;
  }).join('');
}

// ── Finish for today ───────────────────────────────────────────────────────

export function renderDone(root) {
  const p = store.active;
  const todays = recentActivity(p?.log ?? [], 20).filter((g) => g.date === today());
  const read = todays.filter((g) => g.whats.includes('finished') || g.whats.includes('reread'));
  root.innerHTML = `
    <section class="done">
      <div class="done-card">
        <div class="done-i" aria-hidden="true">🏁</div>
        <h1>Well done today${p ? `, ${esc(p.name)}` : ''}!</h1>
        ${
          read.length
            ? `<p>Today you read:</p><ul>${read.map((g) => `<li>📖 ${esc(storyById(g.story)?.title ?? '')}</li>`).join('')}</ul>`
            : '<p>Thanks for reading today.</p>'
        }
        <p>See you next time. Your place is saved.</p>
        <a class="btn btn--primary btn--big" href="#/">🏠 Home</a>
      </div>
    </section>`;
}
