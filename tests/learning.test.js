import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWorkbook, storyWordCount } from '../src/parser.js';
import { findClue, sentences } from '../src/clue.js';
import { readingPace, warmupWords, todaysStory, nextStory, favourite, suggestNext } from '../src/insights.js';
import { store, useStorage, migrateV1 } from '../src/store.js';

const books = [1, 2, 3].map((n) => parseWorkbook(readFileSync(`content/wb${n}.txt`, 'utf8')));
const STORIES = books.flatMap((wb) =>
  wb.lessons.flatMap((lesson) => lesson.stories.map((s) => ({ ...s, wordCount: storyWordCount(s), lessonInfo: lesson }))),
);
const dan = STORIES[0];

/** A tiny in-memory Storage; `broken` makes every write fail. */
function memoryStorage({ broken = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      if (broken) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

describe('findClue', () => {
  it('splits a story into sentences', () => {
    const s = sentences(dan);
    expect(s[0].text).toBe('Dan and Brad grab hands then clap.');
    expect(s.length).toBeGreaterThan(5);
  });

  it('finds the sentence that answers a question', () => {
    const clue = findClue(dan, 'What did Dan do on the sand?', 'sat');
    expect(clue.text).toMatch(/Dan sat on the sand/);
  });

  it('returns null when nothing matches', () => {
    expect(findClue(dan, 'rocket spaceship')).toBeNull();
  });
});

describe('readingPace', () => {
  it('gives words per minute, and accuracy only when mistakes were counted', () => {
    expect(readingPace(120, 60)).toEqual({ wpm: 120, accuracy: null, wcpm: null });
    expect(readingPace(120, 60, 6)).toEqual({ wpm: 120, accuracy: 95, wcpm: 114 });
    expect(readingPace(100, 120, 0)).toEqual({ wpm: 50, accuracy: 100, wcpm: 50 });
  });
});

describe('warm-up and planning', () => {
  it('picks three words, preferring lesson words that are in the story', () => {
    const w = warmupWords(dan);
    expect(w).toHaveLength(3);
    const text = dan.blocks.flatMap((b) => b.words.map((x) => x.word.toLowerCase()));
    w.forEach((x) => expect(text).toContain(x.word.toLowerCase()));
  });

  it("finds today's story from the grown-up's starting point", () => {
    const none = () => false;
    expect(todaysStory(STORIES, null, none).id).toBe(dan.id);
    const wb2 = todaysStory(STORIES, { workbook: 'WB2', lesson: 12 }, none);
    expect(wb2.workbook).toBe('WB2');
    expect(wb2.lesson).toBeGreaterThanOrEqual(12);
    const skipFirst = todaysStory(STORIES, null, (id) => id === dan.id);
    expect(skipFirst.id).toBe(nextStory(STORIES, dan.id).id);
  });

  it('suggests rereading when most answers needed a clue, with a reason', () => {
    const profile = {
      stories: { [dan.id]: { finished: ['2026-01-01'] } },
      log: [{ story: dan.id, what: 'questions', firstTry: 1, withHelp: 3, total: 4 }],
    };
    const s = suggestNext(STORIES, profile);
    expect(s.story.id).toBe(dan.id);
    expect(s.reason).toMatch(/1 of 4/);
    expect(favourite(STORIES, profile).id).toBe(dan.id);
  });
});

describe('store', () => {
  beforeEach(() => useStorage(memoryStorage()));

  it('keeps separate progress and settings per child', () => {
    const a = store.createProfile('Mia', '🦊', { workbook: 'WB1', lesson: 1 });
    store.markFinished(dan.id);
    store.setPref('size', 1.3);
    const b = store.createProfile('Sam', '🐼', null);
    expect(store.active.id).toBe(b.id);
    expect(store.isRead(dan.id)).toBe(false);
    expect(store.prefs.size).toBe(1);
    store.switchProfile(a.id);
    expect(store.isRead(dan.id)).toBe(true);
    expect(store.prefs.size).toBe(1.3);
  });

  it('saves answers so nothing is lost, and records first try vs. with a clue', () => {
    store.createProfile('Mia', '🦊');
    store.saveAnswer(dan.id, 0, { tries: 2, done: true, first: false, wrong: [0] });
    expect(store.quiz(dan.id).answers[0].wrong).toEqual([0]);
    expect(store.resume).toBe(dan.id);
    store.finishQuiz(dan.id, 3, 1, 4);
    expect(store.lastQuiz(dan.id)).toMatchObject({ firstTry: 3, withHelp: 1, total: 4 });
    expect(store.resume).toBeNull();
  });

  it('remembers the reading place until the story is finished', () => {
    store.createProfile('Mia', '🦊');
    store.savePlace(dan.id, 42);
    expect(store.record(dan.id).place).toBe(42);
    expect(store.resume).toBe(dan.id);
    expect(store.markFinished(dan.id)).toBe(1);
    expect(store.record(dan.id).place).toBeNull();
    expect(store.markFinished(dan.id)).toBe(2);
    expect(store.log.at(-1).what).toBe('reread');
  });

  it('reports when saving stops working', () => {
    useStorage(memoryStorage({ broken: true }));
    const seen = [];
    const off = store.onSaveStatus((ok) => seen.push(ok));
    store.createProfile('Mia', '🦊');
    expect(store.saveOk).toBe(false);
    expect(seen).toEqual([false]);
    off();
  });

  it('exports and restores a backup, and rejects other files', () => {
    store.createProfile('Mia', '🦊');
    store.markFinished(dan.id);
    const backup = store.exportJson();
    store.resetActive();
    expect(store.isRead(dan.id)).toBe(false);
    store.importJson(backup);
    expect(store.isRead(dan.id)).toBe(true);
    expect(() => store.importJson('{"hello":1}')).toThrow(/not a LiftOff/);
  });

  it('moves the old single-child record into a first profile', () => {
    const state = migrateV1({
      read: { [dan.id]: '2026-02-01' },
      quiz: { [dan.id]: { best: 3, total: 4 } },
      fluency: { [dan.id]: [{ wcpm: 80, seconds: 70, date: '2026-02-01' }] },
      prefs: { ruler: true },
    });
    const p = state.profiles[state.active];
    expect(p.stories[dan.id].finished).toEqual(['2026-02-01']);
    expect(p.stories[dan.id].quizHistory[0]).toMatchObject({ firstTry: 3, total: 4 });
    expect(p.stories[dan.id].pace[0].wpm).toBe(80);
    expect(p.prefs.ruler).toBe(true);
    expect(migrateV1(null).order).toEqual([]);
  });
});
