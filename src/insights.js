/**
 * Plain, explainable logic behind the parent screens and the warm-up.
 * Nothing here guesses a child's reading level: suggestions follow the
 * lesson order the grown-up chose and what was actually recorded.
 */

/**
 * Reading pace from a timed read-through.
 * Words per minute counts every word; accuracy and words correct per minute
 * are only given when a grown-up counted mistakes.
 * @param {number} words words in the story
 * @param {number} seconds time taken
 * @param {number|null} errors mistakes counted (null = not counted)
 */
export function readingPace(words, seconds, errors = null) {
  const minutes = seconds / 60;
  const wpm = Math.round(words / minutes);
  if (errors == null || Number.isNaN(errors)) return { wpm, accuracy: null, wcpm: null };
  const e = Math.max(0, Math.min(words, Math.round(errors)));
  return {
    wpm,
    accuracy: Math.round(((words - e) / words) * 100),
    wcpm: Math.round((words - e) / minutes),
  };
}

/**
 * Three words for the warm-up: the story's key words first, then lesson
 * words that appear in this story, then other lesson words.
 * @param {object} story
 * @param {number} [n]
 */
export function warmupWords(story, n = 3) {
  const seen = new Set();
  const picked = [];
  const add = (w, key = false) => {
    const k = w.word.toLowerCase();
    if (!k || seen.has(k) || picked.length >= n) return;
    seen.add(k);
    picked.push({ ...w, keyWord: key });
  };
  const storyWords = story.blocks.flatMap((b) => b.words);
  storyWords.filter((w) => w.key).forEach((w) => add(w, true));
  const inStory = new Set(storyWords.map((w) => w.word.toLowerCase()));
  const vocab = story.lessonInfo?.words ?? [];
  vocab.filter((w) => inStory.has(w.word.toLowerCase())).forEach((w) => add(w));
  vocab.forEach((w) => add(w));
  return picked;
}

/** Every lesson word (for "See all lesson words"). */
export function allLessonWords(story) {
  const seen = new Set();
  return [...story.blocks.flatMap((b) => b.words).filter((w) => w.key), ...(story.lessonInfo?.words ?? [])].filter((w) => {
    const k = w.word.toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const wbNum = (id) => Number(String(id).replace(/\D/g, ''));

/** Stories in reading order: workbook, then lesson, then as printed. */
export function inOrder(stories) {
  return [...stories].sort((a, b) => wbNum(a.workbook) - wbNum(b.workbook) || a.lesson - b.lesson);
}

/**
 * Today's story: the first unfinished story from the grown-up's starting
 * point onwards (or from the start if none was chosen).
 * @param {Array} stories all stories
 * @param {{workbook:string, lesson:number}|null} start
 * @param {(id:string)=>boolean} isRead
 */
export function todaysStory(stories, start, isRead) {
  const list = inOrder(stories);
  const from = start
    ? Math.max(
        0,
        list.findIndex(
          (s) => wbNum(s.workbook) > wbNum(start.workbook) || (s.workbook === start.workbook && s.lesson >= start.lesson),
        ),
      )
    : 0;
  return list.slice(from).find((s) => !isRead(s.id)) ?? null;
}

/** The story after this one in reading order. */
export function nextStory(stories, id) {
  const list = inOrder(stories);
  const i = list.findIndex((s) => s.id === id);
  return i >= 0 ? (list[i + 1] ?? null) : null;
}

/** A story they have finished, most-read first, then most recent. */
export function favourite(stories, profile) {
  const done = stories
    .map((s) => ({ s, r: profile?.stories?.[s.id] }))
    .filter(({ r }) => r?.finished?.length)
    .sort((a, b) => b.r.finished.length - a.r.finished.length || String(b.r.finished.at(-1)).localeCompare(String(a.r.finished.at(-1))));
  return done[0]?.s ?? null;
}

/**
 * What to do next, with the reason in plain words.
 * @returns {{story:object|null, reason:string}}
 */
export function suggestNext(stories, profile) {
  const recs = profile?.stories ?? {};
  // A story whose questions were mostly worked out with help → talk it through again.
  const recent = [...(profile?.log ?? [])].reverse().find((e) => e.what === 'questions');
  if (recent && recent.total && recent.firstTry / recent.total < 0.6) {
    const s = stories.find((x) => x.id === recent.story);
    if (s) {
      return {
        story: s,
        reason: `In “${s.title}”, ${recent.firstTry} of ${recent.total} answers were right first time and the rest were worked out with a clue. Reading it again together and talking about what happens is a good next step.`,
      };
    }
  }
  const resume = profile?.resume && stories.find((s) => s.id === profile.resume);
  if (resume) return { story: resume, reason: `“${resume.title}” was started but not finished.` };
  const next = todaysStory(stories, profile?.start ?? null, (id) => Boolean(recs[id]?.finished?.length));
  if (!next) return { story: null, reason: 'Every story from the starting point has been read. Rereading favourites builds fluency.' };
  const where = profile?.start ? 'from the starting point you chose' : 'in lesson order';
  return { story: next, reason: `It is the next unread story ${where} (Workbook ${wbNum(next.workbook)}, Lesson ${next.lesson}).` };
}

/** One specific thing a grown-up can do with the child for this story. */
export function tryTogether(story, profile) {
  if (!story) return 'Ask your child to choose a favourite story and read it to you.';
  const help = Object.entries(profile?.stories?.[story.id]?.help ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  if (help.length) {
    return `Write ${help.map((w) => `“${w}”`).join(', ')} on cards. Take turns reading them, then find them in the story.`;
  }
  const lesson = story.lessonInfo?.title;
  if (story.roles) return 'Pick a part each and read the play aloud together. Swap parts the second time.';
  if (lesson) {
    return `This lesson practises ${lesson}. Before reading, look at the title together and find a word with that sound. Afterwards, ask your child to tell you what happened in three sentences.`;
  }
  return 'After reading, ask your child to tell you what happened at the beginning, middle and end.';
}
