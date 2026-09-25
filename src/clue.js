/**
 * Find the sentence in a story that answers a question — the "clue" a child
 * is sent back to after a wrong answer ("Let's look at the sentence about the
 * sand"). It is a plain word-overlap match: the sentence sharing the most
 * meaningful words with the question (and its right answer) wins.
 */

const STOP = new Set(
  `a an the and or but so to of in on at by for with from up down out over into is are was were be been am
   it its it's this that these those he she they we you i me my his her their our your him them us
   do does did not no yes what who where when why how which there here then than as if too very
   can could will would should has have had just all some any one true false story`.split(/\s+/),
);

const stem = (w) =>
  w
    .toLowerCase()
    .replace(/[^a-z']/g, '')
    .replace(/'s$/, '')
    .replace(/(ing|ed|es|s|ly)$/, '')
    .replace(/(.)\1$/, '$1');

export function keywords(text) {
  return new Set(
    String(text)
      .split(/[\s\-—–/]+/)
      .map((w) => w.toLowerCase().replace(/[^a-z']/g, ''))
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length > 1),
  );
}

/**
 * Split a story into sentences.
 * @returns {Array<{block:number, from:number, to:number, text:string}>} word ranges (inclusive)
 */
export function sentences(story) {
  const out = [];
  story.blocks.forEach((b, bi) => {
    if (b.type === 'note' || !b.words.length) return;
    let from = 0;
    b.words.forEach((w, wi) => {
      const end = /[.!?]["'”’)]*$/.test(w.text) || wi === b.words.length - 1;
      if (end) {
        const text = b.words
          .slice(from, wi + 1)
          .map((x) => x.text)
          .join(' ');
        out.push({ block: bi, from, to: wi, text });
        from = wi + 1;
      }
    });
  });
  return out;
}

/**
 * @param {object} story parsed story
 * @param {string} text question text
 * @param {string} [answer] the right answer, when known — its words count most
 * @returns {{block:number, from:number, to:number, text:string}|null}
 */
export function findClue(story, text, answer = '') {
  const want = keywords(`${text} ${answer}`);
  const key = keywords(answer);
  if (!want.size) return null;
  let best = null;
  let bestScore = 0;
  for (const s of sentences(story)) {
    const have = keywords(s.text);
    let score = 0;
    want.forEach((w) => {
      if (have.has(w)) score += (w.length > 3 ? 2 : 1) * (key.has(w) ? 3 : 1);
    });
    // Prefer shorter sentences on a tie: they point more precisely.
    if (score > bestScore || (score === bestScore && best && score > 0 && s.text.length < best.text.length)) {
      best = s;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}
