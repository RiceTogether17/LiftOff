import './styles.css';
import lockedContent from 'virtual:locked-content';
import { storyById, setContent } from './content.js';
import { deriveKey, decryptWithKey, exportKey, importKey } from './lock.js';
import { renderHome, renderShelf, renderWho, renderSetup, renderParent, renderDone } from './library.js';
import { renderReader, leaveReader } from './reader.js';
import { closeSoundItOut } from './soundItOut.js';
import { stopAudio } from './audio.js';
import { store } from './store.js';
import { esc } from './render.js';

const root = document.getElementById('app');
let viewEl = null;

/** App bar (who is reading, grown-ups) + the save warning + the view. */
function chrome() {
  if (!viewEl || !root.contains(viewEl)) {
    root.innerHTML = `
      <header class="appbar">
        <a class="appbar-home" href="#/">🚀 <span>LiftOff</span></a>
        <a class="who-chip" href="#/who" title="Switch reader"></a>
        <a class="btn btn--ghost btn--small appbar-parent" href="#/parent">👪 Grown-ups</a>
      </header>
      <p class="save-warn" role="alert" hidden>⚠️ Progress can’t be saved on this device right now (the browser is blocking storage — for example in private browsing).
        Reading still works, but answers and progress will be lost when this page closes.</p>
      <div class="view"></div>`;
    viewEl = root.querySelector('.view');
    showSaveStatus(store.saveOk);
  }
  const p = store.active;
  const chip = root.querySelector('.who-chip');
  chip.hidden = !p;
  chip.innerHTML = p ? `<span aria-hidden="true">${esc(p.avatar)}</span> ${esc(p.name)}<span class="sr-only"> — switch reader</span>` : '';
  return viewEl;
}

function showSaveStatus(ok) {
  const warn = root.querySelector('.save-warn');
  if (warn) warn.hidden = ok;
}
store.onSaveStatus(showSaveStatus);

function route() {
  leaveReader();
  stopAudio();
  closeSoundItOut();
  const [, view, id] = (location.hash.replace(/^#\/?/, '') || '').match(/^([^/]*)\/?(.*)$/) ?? [];
  if (view === 'lock') return lock();
  const out = chrome();
  const go = (hash) => {
    if (location.hash === hash) route();
    else location.hash = hash;
  };
  window.scrollTo(0, 0);

  // No reader yet (first visit): set one up before anything else.
  if (!store.active && view !== 'setup') return go('#/setup');

  if (view === 'story') {
    const story = storyById(decodeURIComponent(id));
    if (story) {
      renderReader(out, story);
      document.title = `${story.title} · LiftOff Stories`;
      return;
    }
  }
  const screens = {
    setup: () => renderSetup(out, () => go('#/')),
    who: () => renderWho(out, () => go('#/')),
    parent: () => renderParent(out, () => route()),
    progress: () => renderParent(out, () => route()),
    done: () => renderDone(out),
    wb: () => renderShelf(out, decodeURIComponent(id)),
  };
  (screens[view] ?? (() => renderHome(out)))();
  chrome(); // refresh the reader chip after profile changes
  const name = { parent: 'Grown-ups', progress: 'Grown-ups', who: 'Who’s reading?', setup: 'Add a reader' }[view];
  document.title = name ? `${name} · LiftOff Stories` : 'LiftOff Stories';
}

// ── Password lock ───────────────────────────────────────────────────────
// The stories are encrypted; they are only readable after the right password
// is entered. The derived key (not the password) can be remembered so the
// child is not asked every time.

const KEY_STORE = 'liftoff-key';

function storedKey() {
  try {
    return localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE);
  } catch {
    return null;
  }
}

function saveKey(b64, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY_STORE, b64);
  } catch {
    /* storage blocked: ask again next visit */
  }
}

function lock() {
  try {
    localStorage.removeItem(KEY_STORE);
    sessionStorage.removeItem(KEY_STORE);
  } catch {
    /* ignore */
  }
  location.hash = '';
  location.reload();
}

async function open(key) {
  const texts = JSON.parse(await decryptWithKey(key, lockedContent));
  setContent(texts);
  window.addEventListener('hashchange', route);
  route();
}

function showLockScreen() {
  document.title = 'LiftOff Stories · Locked';
  root.innerHTML = `
    <section class="lock">
      <form class="lock-card" autocomplete="off">
        <div class="lock-icon" aria-hidden="true">🔒</div>
        <h1>LiftOff Stories</h1>
        <p>Enter the password to open the stories.</p>
        <label class="lock-field">
          <span class="sr-only">Password</span>
          <input type="password" name="pw" placeholder="Password" required autofocus />
        </label>
        <label class="lock-remember"><input type="checkbox" name="remember" checked /> Remember this device</label>
        <p class="lock-error" role="alert" hidden>That password is not right. Please try again.</p>
        <button class="btn btn--primary btn--big" type="submit">Unlock</button>
      </form>
    </section>`;
  const form = root.querySelector('form');
  const err = root.querySelector('.lock-error');
  const btn = form.querySelector('button');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const key = await deriveKey(form.pw.value, lockedContent.salt);
      await open(key); // throws if the password is wrong
      saveKey(await exportKey(key), form.remember.checked);
    } catch {
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Unlock';
      form.pw.select();
    }
  });
}

(async () => {
  const saved = storedKey();
  if (saved) {
    try {
      await open(await importKey(saved));
      return;
    } catch {
      // Saved key no longer fits (the site was rebuilt): ask again.
    }
  }
  showLockScreen();
})();
