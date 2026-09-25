/** Story library: workbook shelves → lessons → story cards. */

import { WORKBOOKS, STORIES } from './content.js';
import { store } from './store.js';
import { esc, wordsHtml } from './render.js';

const SHELF_COLOURS = ['#e4572e', '#f3a712', '#29a36a', '#2e86de', '#8e44ad', '#d35400'];

export function renderLibrary(root, activeId) {
  const wb = WORKBOOKS.find((w) => w.id === activeId) ?? WORKBOOKS[0];
  const stories = STORIES.filter((s) => s.workbook === wb.id);
  const readCount = stories.filter((s) => store.isRead(s.id)).length;
  const nextUp = stories.find((s) => !store.isRead(s.id));
  const pct = stories.length ? Math.round((readCount / stories.length) * 100) : 0;
  const colour = SHELF_COLOURS[Number(wb.id.replace(/\D/g, '')) % SHELF_COLOURS.length];

  root.innerHTML = `
    <section class="library" style="--shelf:${colour}">
      <header class="lib-head">
        <div>
          <h1>🚀 LiftOff Stories</h1>
          <p class="lib-sub">Read the Learn-to-Read workbook stories. You read aloud; the app helps you track, decode and check.</p>
        </div>
        <span class="lib-actions">
          <a class="btn btn--ghost" href="#/progress">📊 Progress</a>
          <a class="btn btn--ghost" href="#/lock" title="Lock the stories on this device">🔒 Lock</a>
        </span>
      </header>
      <nav class="shelves" aria-label="Workbooks">
        ${WORKBOOKS.map((w) => {
          const n = w.id.replace(/\D/g, '');
          return `<a class="shelf${w.id === wb.id ? ' is-active' : ''}" href="#/wb/${esc(w.id)}"
                     ${w.id === wb.id ? 'aria-current="page"' : ''} style="--shelf:${SHELF_COLOURS[Number(n) % SHELF_COLOURS.length]}">
                    <span class="shelf-n">${esc(n)}</span><span class="shelf-t">Workbook</span></a>`;
        }).join('')}
      </nav>
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
            ${l.stories.map((s) => card(STORIES.find((x) => x.id === s.id), s.id === nextUp?.id)).join('')}
          </div>
        </section>`,
        )
        .join('')}
    </section>`;
}

function card(s, isNext) {
  const read = store.isRead(s.id);
  const quiz = store.quizResult(s.id);
  const best = store.bestWcpm(s.id);
  const minutes = Math.max(1, Math.round(s.wordCount / 60));
  return `
    <a class="card${read ? ' is-read' : ''}${isNext ? ' is-next' : ''}" href="#/story/${esc(s.id)}">
      ${isNext ? '<span class="card-flag">Next up</span>' : ''}
      <span class="card-title">${wordsHtml(s.titleWords)}</span>
      <span class="card-meta">${s.wordCount} words · about ${minutes} min${s.roles ? ' · 🎭 play' : ''}</span>
      <span class="card-badges">
        ${read ? '<span class="pill pill--ok">✓ Read</span>' : ''}
        ${quiz ? `<span class="pill">✏️ ${quiz.best}/${quiz.total}</span>` : ''}
        ${best ? `<span class="pill">⏱ ${best} wpm</span>` : ''}
      </span>
    </a>`;
}

export function renderProgress(root) {
  const byWb = WORKBOOKS.map((wb) => {
    const stories = STORIES.filter((s) => s.workbook === wb.id);
    return { wb, stories };
  });
  root.innerHTML = `
    <section class="progress">
      <header class="lib-head">
        <div><h1>📊 Reading progress</h1>
        <p class="lib-sub">For teachers and parents. Saved on this device only.</p></div>
        <a class="btn btn--ghost" href="#/">← Stories</a>
      </header>
      ${byWb
        .map(
          ({ wb, stories }) => `
        <h2>${esc(wb.title)} <small>${esc(wb.subtitle)}</small></h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Lesson</th><th>Story</th><th>Read</th><th><abbr title="Best comprehension score">Quiz</abbr></th><th><abbr title="Best words correct per minute">Words/min</abbr></th></tr></thead>
          <tbody>${stories
            .map((s) => {
              const q = store.quizResult(s.id);
              const best = store.bestWcpm(s.id);
              return `<tr><td>${esc(s.lesson)}</td><td><a href="#/story/${esc(s.id)}">${esc(s.title)}</a></td>
                <td>${store.isRead(s.id) ? '✓' : '—'}</td>
                <td>${q ? `${q.best}/${q.total}` : '—'}</td>
                <td>${best || '—'}</td></tr>`;
            })
            .join('')}</tbody>
        </table></div>`,
        )
        .join('')}
      <p><button class="btn btn--ghost" type="button" data-reset>Reset all progress on this device</button></p>
    </section>`;
  root.querySelector('[data-reset]').addEventListener('click', () => {
    if (confirm('Clear all reading progress saved on this device?')) {
      store.reset();
      renderProgress(root);
    }
  });
}
