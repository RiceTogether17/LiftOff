import { parseWorkbook, storyWordCount } from './parser.js';

// Every /content/wbN.txt transcription is picked up automatically.
const sources = import.meta.glob('../content/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const WORKBOOKS = Object.values(sources)
  .map(parseWorkbook)
  .sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')));

export const STORIES = WORKBOOKS.flatMap((wb) =>
  wb.lessons.flatMap((lesson) =>
    lesson.stories.map((story) => ({ ...story, wordCount: storyWordCount(story), lessonInfo: lesson })),
  ),
);

export const storyById = (id) => STORIES.find((s) => s.id === id) ?? null;
export const workbookById = (id) => WORKBOOKS.find((w) => w.id === id) ?? null;
