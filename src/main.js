import './styles.css';
import lockedContent from 'virtual:locked-content';
import { WORKBOOKS, storyById, setContent } from './content.js';
import { deriveKey, decryptWithKey, exportKey, importKey } from './lock.js';
import { renderLibrary, renderProgress } from './library.js';
import { renderReader, stopTimer } from './reader.js';
import { closeSoundItOut } from './soundItOut.js';
import { stopAudio } from './audio.js';

const root = document.getElementById('app');

function route() {
  stopTimer();
  stopAudio();
  closeSoundItOut();
  const [, view, id] = (location.hash.replace(/^#\/?/, '') || '').match(/^([^/]*)\/?(.*)$/) ?? [];
  if (view === 'story') {
    const story = storyById(decodeURIComponent(id));
    if (story) {
      renderReader(root, story, {});
      document.title = `${story.title} · LiftOff Stories`;
      window.scrollTo(0, 0);
      return;
    }
  }
  if (view === 'lock') {
    lock();
    return;
  }
  if (view === 'progress') {
    renderProgress(root);
    document.title = 'Progress · LiftOff Stories';
    return;
  }
  const wbId = view === 'wb' ? decodeURIComponent(id) : lastShelf();
  renderLibrary(root, wbId);
  remember(wbId);
  document.title = 'LiftOff Stories';
}

function lastShelf() {
  try {
    return localStorage.getItem('liftoff-shelf') || WORKBOOKS[0]?.id;
  } catch {
    return WORKBOOKS[0]?.id;
  }
}
function remember(id) {
  try {
    if (id) localStorage.setItem('liftoff-shelf', id);
  } catch {
    /* ignore */
  }
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
