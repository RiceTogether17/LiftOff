/** Small HTML helpers shared by the library, reader and quiz. */

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * One coded segment as HTML. A cue letter is drawn above the grapheme,
 * exactly where the workbooks print it.
 */
export function segHtml(seg) {
  const text = esc(seg.text);
  const cls = seg.kind === 'plain' ? '' : ` class="c-${seg.kind}"`;
  // The cue floats above the letter (like the workbook) without widening it.
  const inner = seg.cue ? `<span class="cue-base">${text}<span class="cue" aria-hidden="true">${esc(seg.cue)}</span></span>` : text;
  return cls || seg.cue ? `<span${cls || ' class="c-cue"'}>${inner}</span>` : inner;
}

export function wordHtml(word) {
  return word.segs.map(segHtml).join('');
}

/** A run of words as coded text (used for titles and chips). */
export function wordsHtml(words) {
  return words.map(wordHtml).join(' ');
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
