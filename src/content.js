import { parseWorkbook, storyWordCount } from './parser.js';

// Filled in by setContent() once the stories have been unlocked. These are
// live ES module bindings, so importers see the values after unlocking.
export let WORKBOOKS = [];
export let STORIES = [];

/** @param {string[]} texts raw content/wbN.txt transcriptions */
export function setContent(texts) {
  WORKBOOKS = texts
    .map(parseWorkbook)
    .sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')));
  STORIES = WORKBOOKS.flatMap((wb) =>
    wb.lessons.flatMap((lesson) =>
      lesson.stories.map((story) => ({ ...story, wordCount: storyWordCount(story), lessonInfo: lesson })),
    ),
  );
}

export const storyById = (id) => STORIES.find((s) => s.id === id) ?? null;
export const workbookById = (id) => WORKBOOKS.find((w) => w.id === id) ?? null;
