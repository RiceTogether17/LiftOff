/**
 * Progress kept in this browser only (localStorage). Every access is wrapped
 * so the app still works when storage is blocked (private mode, previews).
 */

const KEY = 'liftoff-story-mode-v1';

const EMPTY = {
  read: {}, // storyId -> ISO date first finished
  quiz: {}, // storyId -> { best, total, last }
  fluency: {}, // storyId -> [{ wcpm, seconds, date }]
  meet: {}, // storyId -> 'YYYY-MM-DD' Meet-the-Words completed
  prefs: { coding: true, ruler: false, size: 1, sound: true, rate: 0.85 },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed, prefs: { ...EMPTY.prefs, ...parsed.prefs } };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export const store = {
  get prefs() {
    return state.prefs;
  },
  setPref(key, value) {
    state.prefs[key] = value;
    save();
  },

  isRead: (id) => Boolean(state.read[id]),
  markRead(id) {
    if (!state.read[id]) {
      state.read[id] = today();
      save();
    }
  },

  quizResult: (id) => state.quiz[id] ?? null,
  saveQuiz(id, score, total) {
    const prev = state.quiz[id];
    state.quiz[id] = { best: Math.max(prev?.best ?? 0, score), total, last: score };
    save();
  },

  fluency: (id) => state.fluency[id] ?? [],
  bestWcpm: (id) => Math.max(0, ...(state.fluency[id] ?? []).map((f) => f.wcpm)),
  saveFluency(id, wcpm, seconds) {
    (state.fluency[id] ??= []).push({ wcpm, seconds: Math.round(seconds), date: today() });
    state.fluency[id] = state.fluency[id].slice(-20);
    save();
  },

  metWordsToday: (id) => state.meet[id] === today(),
  setMetWords(id) {
    state.meet[id] = today();
    save();
  },

  summary() {
    return {
      read: Object.keys(state.read).length,
      quizzes: Object.values(state.quiz),
      fluency: state.fluency,
    };
  },
  reset() {
    state = structuredClone(EMPTY);
    save();
  },
};
