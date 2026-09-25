/**
 * Progress and settings, kept in this browser only (localStorage).
 *
 * Each child has a profile with their own settings, reading place, answers
 * and history, so siblings sharing a tablet don't share progress. Saving is
 * checked: if the browser blocks storage the app says so instead of silently
 * forgetting (see onSaveStatus).
 *
 * What is recorded is kept honest and specific: a story being opened, read to
 * the end, reread; answers right first time vs. worked out with a hint; words
 * looked at in Sound It Out (not "words the child can't read"); and reading
 * pace sessions a grown-up timed.
 */

const KEY = 'liftoff-v2';
const OLD_KEY = 'liftoff-story-mode-v1';

export const AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐢', '🐬', '🦉', '🐝', '🚀'];

export const DEFAULT_PREFS = {
  coding: true,
  ruler: false,
  rulerMode: 'line',
  size: 1,
  sound: true,
  rate: 0.85,
  legend: null, // null = open on big screens, folded on phones
};

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 9);

function emptyState() {
  return { version: 2, active: null, order: [], profiles: {} };
}

function newProfile(name, avatar, start = null) {
  return {
    id: uid(),
    name: String(name || 'Reader').trim().slice(0, 24) || 'Reader',
    avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0],
    created: today(),
    start, // { workbook, lesson } chosen by a grown-up
    prefs: { ...DEFAULT_PREFS },
    seen: {}, // one-off tips already shown
    stories: {}, // storyId -> record (see storyRecord)
    log: [], // recent activity, newest last
    resume: null, // storyId of an unfinished story to continue
  };
}

function storyRecord() {
  return {
    opened: 0,
    lastOpened: null,
    finished: [], // dates the child read it to the end
    place: null, // word index where they stopped
    role: '', // Readers Theatre part
    warmup: null, // date the warm-up was done or skipped
    help: {}, // word -> times looked at in Sound It Out
    listened: 0, // times the story was played aloud
    quiz: null, // current attempt: { answers: {i: state}, done, date }
    quizHistory: [], // completed attempts: { firstTry, withHelp, total, date }
    pace: [], // grown-up timed readings
  };
}

/** Bring a v1 (single child) record into a first profile. */
export function migrateV1(old) {
  const state = emptyState();
  const hasData =
    old && (Object.keys(old.read ?? {}).length || Object.keys(old.quiz ?? {}).length || Object.keys(old.fluency ?? {}).length);
  if (!hasData) return state;
  const p = newProfile('Reader 1', AVATARS[0]);
  p.prefs = { ...DEFAULT_PREFS, ...(old.prefs ?? {}) };
  const rec = (id) => (p.stories[id] ??= storyRecord());
  for (const [id, date] of Object.entries(old.read ?? {})) {
    rec(id).finished.push(date);
    rec(id).opened = Math.max(1, rec(id).opened);
    p.log.push({ story: id, what: 'finished', date });
  }
  for (const [id, q] of Object.entries(old.quiz ?? {})) {
    rec(id).quizHistory.push({ firstTry: q.best, withHelp: 0, total: q.total, date: null });
  }
  for (const [id, list] of Object.entries(old.fluency ?? {})) {
    rec(id).pace = list.map((f) => ({ wpm: f.wcpm, seconds: f.seconds, date: f.date, words: null }));
  }
  for (const [id, date] of Object.entries(old.meet ?? {})) rec(id).warmup = date;
  state.profiles[p.id] = p;
  state.order.push(p.id);
  state.active = p.id;
  return state;
}

// ── Storage (injectable for tests) ─────────────────────────────────────────

let storage = globalThis.localStorage;
let state = emptyState();
let saveOk = true;
const listeners = new Set();

function load() {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 2) return parsed;
    }
    const old = storage?.getItem(OLD_KEY);
    return migrateV1(old ? JSON.parse(old) : null);
  } catch {
    return emptyState();
  }
}

function save() {
  let ok = true;
  try {
    if (!storage) throw new Error('no storage');
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    ok = false;
  }
  if (ok !== saveOk) {
    saveOk = ok;
    listeners.forEach((fn) => fn(ok));
  }
  return ok;
}

/** For tests: use a different Storage object and reload from it. */
export function useStorage(s) {
  storage = s;
  state = load();
  saveOk = true;
}

state = load();

const P = () => state.profiles[state.active] ?? null;
const rec = (id) => {
  const p = P();
  if (!p) return storyRecord();
  return (p.stories[id] ??= storyRecord());
};
const log = (story, what, extra = {}) => {
  const p = P();
  if (!p) return;
  p.log.push({ story, what, date: today(), ...extra });
  p.log = p.log.slice(-80);
};

export const store = {
  // ── Save status ──
  get saveOk() {
    return saveOk;
  },
  /** Called with true/false when saving starts or stops working. */
  onSaveStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Try a save now (to show the status on a parent screen). */
  checkSave: () => save(),

  // ── Profiles ──
  get profiles() {
    return state.order.map((id) => state.profiles[id]).filter(Boolean);
  },
  get active() {
    return P();
  },
  createProfile(name, avatar, start) {
    const p = newProfile(name, avatar, start);
    state.profiles[p.id] = p;
    state.order.push(p.id);
    state.active = p.id;
    save();
    return p;
  },
  updateProfile(id, fields) {
    const p = state.profiles[id];
    if (!p) return;
    if ('name' in fields) p.name = String(fields.name).trim().slice(0, 24) || p.name;
    if ('avatar' in fields && AVATARS.includes(fields.avatar)) p.avatar = fields.avatar;
    if ('start' in fields) p.start = fields.start;
    save();
  },
  deleteProfile(id) {
    delete state.profiles[id];
    state.order = state.order.filter((x) => x !== id);
    if (state.active === id) state.active = state.order[0] ?? null;
    save();
  },
  switchProfile(id) {
    if (state.profiles[id]) state.active = id;
    save();
  },

  // ── Settings (per child) ──
  get prefs() {
    return P()?.prefs ?? { ...DEFAULT_PREFS };
  },
  setPref(key, value) {
    const p = P();
    if (!p) return;
    p.prefs[key] = value;
    save();
  },
  seen: (tip) => Boolean(P()?.seen?.[tip]),
  markSeen(tip) {
    const p = P();
    if (!p) return;
    (p.seen ??= {})[tip] = today();
    save();
  },

  // ── Per story ──
  record: (id) => rec(id),
  timesFinished: (id) => P()?.stories[id]?.finished.length ?? 0,
  isRead: (id) => (P()?.stories[id]?.finished.length ?? 0) > 0,
  markOpened(id) {
    const r = rec(id);
    r.opened++;
    r.lastOpened = today();
    log(id, 'opened');
    save();
  },
  /** The child says they read to the end. Returns how many times now. */
  markFinished(id) {
    const r = rec(id);
    r.finished.push(today());
    r.place = null;
    log(id, r.finished.length > 1 ? 'reread' : 'finished');
    const p = P();
    if (p?.resume === id && !(r.quiz && !r.quiz.done)) p.resume = null;
    save();
    return r.finished.length;
  },
  savePlace(id, word) {
    const r = rec(id);
    if (r.place === word) return;
    r.place = word;
    const p = P();
    if (p && word > 0) p.resume = id;
    save();
  },
  saveRole(id, role) {
    rec(id).role = role;
    save();
  },
  warmupDone: (id) => P()?.stories[id]?.warmup === today(),
  setWarmup(id, how) {
    rec(id).warmup = today();
    log(id, how === 'skipped' ? 'warm-up skipped' : 'warm-up');
    save();
  },
  noteHelp(id, word) {
    const r = rec(id);
    const w = word.toLowerCase();
    r.help[w] = (r.help[w] ?? 0) + 1;
    save();
  },
  noteListen(id) {
    rec(id).listened++;
    log(id, 'listened');
    save();
  },

  // ── Questions ──
  quiz: (id) => P()?.stories[id]?.quiz ?? null,
  saveAnswer(id, i, answer) {
    const r = rec(id);
    r.quiz ??= { answers: {}, done: false, date: today() };
    r.quiz.answers[i] = answer;
    const p = P();
    if (p && !r.quiz.done) p.resume = id;
    save();
  },
  /** All scored questions answered: keep the result. */
  finishQuiz(id, firstTry, withHelp, total) {
    const r = rec(id);
    if (!r.quiz || r.quiz.done) return;
    r.quiz.done = true;
    r.quizHistory.push({ firstTry, withHelp, total, date: today() });
    log(id, 'questions', { firstTry, withHelp, total });
    const p = P();
    if (p?.resume === id) p.resume = null;
    save();
  },
  resetQuiz(id) {
    rec(id).quiz = null;
    save();
  },
  lastQuiz: (id) => P()?.stories[id]?.quizHistory.at(-1) ?? null,

  // ── Reading pace (grown-up timed) ──
  savePace(id, entry) {
    const r = rec(id);
    r.pace.push({ ...entry, date: today() });
    r.pace = r.pace.slice(-20);
    log(id, 'pace');
    save();
  },

  // ── Whole profile ──
  get log() {
    return P()?.log ?? [];
  },
  get resume() {
    return P()?.resume ?? null;
  },
  resetActive() {
    const p = P();
    if (!p) return;
    Object.assign(p, { stories: {}, log: [], resume: null, seen: {} });
    save();
  },

  // ── Backup ──
  exportJson: () => JSON.stringify({ app: 'liftoff-stories', exported: now(), data: state }, null, 1),
  /** Replace everything with a backup. Throws if the file isn't a backup. */
  importJson(text) {
    const parsed = JSON.parse(text);
    const data = parsed?.data ?? parsed;
    if (data?.version !== 2 || typeof data.profiles !== 'object' || !Array.isArray(data.order)) {
      throw new Error('This file is not a LiftOff Stories backup.');
    }
    state = data;
    if (!state.profiles[state.active]) state.active = state.order[0] ?? null;
    save();
  },
};
