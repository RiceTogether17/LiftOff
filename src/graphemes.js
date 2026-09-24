/**
 * Split a parsed word into graphemes for the "Sound It Out" panel.
 *
 * Coded segments are already one grapheme each (the workbook marks "ai",
 * "igh", "ear" … as a unit). Plain runs are split letter by letter, keeping
 * common consonant digraphs and doubled letters together so that "shell"
 * becomes sh · e · ll, matching how LiftOff students blend.
 */

const DIGRAPHS = ['tch', 'dge', 'sh', 'ch', 'th', 'wh', 'ph', 'ck', 'ng', 'qu', 'wr', 'kn'];

function splitPlain(text) {
  const out = [];
  let i = 0;
  const lower = text.toLowerCase();
  while (i < text.length) {
    const hit = DIGRAPHS.find((d) => lower.startsWith(d, i));
    if (hit) {
      out.push(text.slice(i, i + hit.length));
      i += hit.length;
    } else if (/[bcdfglmnprstvz]/.test(lower[i]) && lower[i + 1] === lower[i]) {
      out.push(text.slice(i, i + 2)); // ll, ss, ff, tt …
      i += 2;
    } else {
      out.push(text[i]);
      i += 1;
    }
  }
  return out;
}

/**
 * @param {Array<{text:string, kind:string, cue?:string}>} segs
 * @returns {Array<{text:string, kind:string, cue?:string}>} letters only
 */
export function toGraphemes(segs) {
  const out = [];
  for (const seg of segs) {
    const letters = seg.text.replace(/[^A-Za-z']/g, '').replace(/'/g, '');
    if (!letters) continue;
    if (seg.kind === 'plain' && !seg.cue) {
      for (const g of splitPlain(letters)) out.push({ text: g, kind: 'plain' });
    } else {
      out.push({ ...seg, text: letters });
    }
  }
  return out;
}

/**
 * Cumulative blending steps, LiftOff "Stage 3" style: each new sound is
 * added to the sounds already blended. Silent letters are skipped.
 *   m · a · f · t  →  ["m", "ma", "maf", "maft"]
 */
export function blendSteps(graphemes) {
  const steps = [];
  let acc = '';
  for (const g of graphemes) {
    // A grey letter with a cue above it still makes the cue's sound.
    if (g.kind === 'silent' && !g.cue) continue;
    acc += g.text;
    steps.push(acc);
  }
  return steps;
}

/**
 * If a word is a smaller word plus -ing / -ed / -s, return the parts so the
 * reader can prompt "Can you see a word inside?" (CDM: using sight words and
 * suffixes as a word-attack skill).
 */
export function suffixHint(word) {
  const w = word.toLowerCase();
  const m = w.match(/^([a-z]{2,}?)(ing|ed)$/);
  if (!m) return null;
  let [, base, suffix] = m;
  // hopped → hop, making → make isn't recoverable; keep it simple and honest.
  if (/([bdgmnprt])\1$/.test(base)) base = base.slice(0, -1);
  if (base.length < 2) return null;
  return { base, suffix };
}
