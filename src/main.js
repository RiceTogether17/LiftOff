import './styles.css';
import { WORKBOOKS, storyById } from './content.js';
import { renderLibrary, renderProgress } from './library.js';
import { renderReader, stopTimer } from './reader.js';
import { closeSoundItOut } from './soundItOut.js';

const root = document.getElementById('app');

function route() {
  stopTimer();
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

window.addEventListener('hashchange', route);
route();
