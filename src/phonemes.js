/**
 * Which recorded sound each grapheme makes.
 *
 * The workbook coding already says how a letter sounds, so it is used first:
 *   - a cue letter above a grapheme IS its sound ({u}^oo → /ʊ/, [ph]^f → /f/)
 *   - blue (long) vowels say their name, red (short) vowels their short sound
 *   - green diphthongs map to their r-controlled / gliding recording
 *   - grey (silent) letters make no sound
 *
 * Text the books no longer code (after each CheckOut) follows the rules the
 * CheckOut lessons teach: vowel teams, magic e, final y, soft c / g before
 * e·i·y, the three sounds of -ed, and -tion.
 *
 * Every key returned here is a file in public/audio/phonemes/<key>.mp3.
 */

export const PHONEME_FILES = new Set(
  `a air ar b c ch d e ear er f g h i j k l long_a long_e long_i long_o long_oo long_u
   m n ng o oi or ow p q r s sh short_oo soft_c soft_g t th u v w x y z`.split(/\s+/),
);

// Multi-letter cues and diphthong spellings → recording
const SOUND_BY_SPELLING = {
  ar: 'ar',
  ah: 'ar',
  or: 'or',
  oar: 'or',
  oor: 'or',
  our: 'or',
  aw: 'or',
  au: 'or',
  ore: 'or',
  er: 'er',
  ir: 'er',
  ur: 'er',
  air: 'air',
  are: 'air',
  ear: 'ear',
  eer: 'ear',
  ere: 'ear',
  ier: 'ear',
  ow: 'ow',
  ou: 'ow',
  oi: 'oi',
  oy: 'oi',
  sh: 'sh',
  ch: 'ch',
  th: 'th',
  ng: 'ng',
  zz: 'z',
};

// Plain consonant spellings
const CONSONANTS = {
  tch: 'ch',
  dge: 'j',
  wh: 'w',
  ph: 'f',
  ck: 'c',
  qu: 'q',
  wr: 'r',
  kn: 'n',
  gn: 'n',
  sh: 'sh',
  ch: 'ch',
  th: 'th',
  ng: 'ng',
};

// Plain vowel teams (the rule "when two vowels go walking…", plus igh)
const VOWEL_TEAMS = {
  igh: 'long_i',
  ai: 'long_a',
  ay: 'long_a',
  ee: 'long_e',
  ea: 'long_e',
  ie: 'long_i',
  oa: 'long_o',
  oe: 'long_o',
  ew: 'long_oo',
  ue: 'long_oo',
  ui: 'long_oo',
  oo: 'long_oo',
};

// 'ow' says /oʊ/ in these words, /aʊ/ elsewhere
const LONG_O_OW = new Set(
  `show know grow snow slow low blow flow glow own owned bowl throw window yellow follow
   followed tomorrow arrow shadow elbow below borrow grown shown known mow row tow towed
   towing tows bow crow owe`.split(/\s+/),
);
// short /ʊ/ 'oo' words (book, look…)
const SHORT_OO = /^(b|c|h|l|n|t|w|g|st|sh|f|br|cr|sh)oo(k|d|t)/;

// 'ea' says short /e/ in these
const EA_SHORT = /^(head|bread|dead|ready|heav|instead|feather|weather|breakfast|spread|thread|sweat|breath|health|wealth|meant|dealt|deaf|breast|leather|pleasant|measure|treasure|meadow|sweater)/;
// 'ear' says /air/ in these
const EAR_AIR = new Set(['bear', 'bears', 'pear', 'pears', 'wear', 'wears', 'swear', 'overbearing', 'underwear']);

// words that end in e but are not magic-e words
const NOT_MAGIC_E = new Set(
  `have give live love come some done gone one none were there where are move lose whose
   prove above glove dove shove become someone something welcome income`.split(/\s+/),
);

// g before e/i/y is usually soft — except in these
const HARD_G = /^(get|give|gift|girl|begin|together|forget|target|tiger|finger|anger|hunger|geese|gear|gecko|giggl|gig|gill)/;

const isVowel = (ch) => /[aeiou]/.test(ch);
const VOICELESS_END = /(p|k|f|s|x|sh|ch|ck|ss|c)$/;

function vowelSound(v, long) {
  if (v === 'oo') return long ? 'long_oo' : 'short_oo';
  if (/^[aeiou]$/.test(v)) return long ? `long_${v}` : v;
  return null;
}

/** Sound from a cue letter (the workbook's own pronunciation guide). */
function fromCue(cue, kind) {
  const c = cue.toLowerCase();
  if (SOUND_BY_SPELLING[c]) return SOUND_BY_SPELLING[c];
  if (c === 'oo' || /^[aeiou]$/.test(c)) return vowelSound(c, kind === 'long');
  if (PHONEME_FILES.has(c)) return c;
  return null;
}

/** Sound for a coded (coloured) grapheme without a cue. */
function fromCoding(text, kind) {
  const t = text.toLowerCase();
  if (kind === 'short') return vowelSound(t === 'oo' ? 'oo' : t[0], false);
  if (kind === 'long') {
    if (t === 'oo' || t === 'ue' || t === 'ew' || t === 'ui') return 'long_oo';
    if (t === 'y') return 'long_i';
    if (t === 'ei') return 'long_e';
    return vowelSound(t.match(/[aeiou]/)?.[0] ?? '', true);
  }
  if (kind === 'diph') return SOUND_BY_SPELLING[t] ?? (t.includes('r') ? 'er' : 'ow');
  return null;
}

/**
 * Give every grapheme a `sound` (a PHONEME_FILES key) or null for silence.
 * @param {Array<{text:string, kind:string, cue?:string}>} gs graphemes of one word
 * @param {string} word the whole word, for context rules
 * @returns the same array, with `sound` set
 */
export function assignSounds(gs, word) {
  const w = word.toLowerCase();
  const plain = (g) => g && g.kind === 'plain' && !g.cue;
  const lettersAfter = (i) => gs.slice(i + 1).map((g) => g.text.toLowerCase()).join('');

  gs.forEach((g, i) => {
    const t = g.text.toLowerCase();
    if (g.cue) return (g.sound = fromCue(g.cue, g.kind));
    if (g.kind === 'silent') return (g.sound = null);
    if (g.kind !== 'plain') return (g.sound = fromCoding(t, g.kind));

    // ── plain (uncoded) text: CheckOut rules ──
    const bare = w.replace(/[^a-z]/g, '');
    if (t === 'ear') {
      if (EAR_AIR.has(bare)) return (g.sound = 'air');
      // ear + consonant says /er/ (heard, learn, early, earth)
      if (/^[^aeiou]/.test(lettersAfter(i)) && lettersAfter(i)) return (g.sound = 'er');
      return (g.sound = 'ear');
    }
    if (t === 'ea' && EA_SHORT.test(bare)) return (g.sound = 'e');
    if (t === 'ie') return (g.sound = i === gs.length - 1 ? 'long_i' : 'long_e'); // pie / field
    if (SOUND_BY_SPELLING[t] && !CONSONANTS[t]) {
      if (t === 'ow') return (g.sound = LONG_O_OW.has(w.replace(/[^a-z]/g, '')) ? 'long_o' : 'ow');
      return (g.sound = SOUND_BY_SPELLING[t]);
    }
    if (VOWEL_TEAMS[t]) {
      if (t === 'oo') return (g.sound = SHORT_OO.test(w) ? 'short_oo' : 'long_oo');
      return (g.sound = VOWEL_TEAMS[t]);
    }
    if (CONSONANTS[t]) return (g.sound = CONSONANTS[t]);
    if (t.length === 2 && t[0] === t[1] && !isVowel(t[0])) return (g.sound = PHONEME_FILES.has(t[0]) ? t[0] : null);

    const next = gs[i + 1]?.text.toLowerCase() ?? '';
    const rest = lettersAfter(i);

    if (t === 'c') return (g.sound = /^[eiy]/.test(next) ? 'soft_c' : 'c');
    if (t === 'g') return (g.sound = /^[eiy]/.test(next) && !HARD_G.test(w) ? 'soft_g' : 'g');

    if (t === 'y') {
      if (i === 0) return (g.sound = 'y');
      const otherVowel = /[aeiou]/.test(w.slice(0, -1));
      if (i === gs.length - 1) return (g.sound = otherVowel ? 'long_e' : 'long_i');
      return (g.sound = 'i');
    }

    if (t === 'e' && i === gs.length - 1) {
      // final e: silent, unless it is the word's only vowel (he, she, we, be)
      return (g.sound = /[aeiouy]/.test(w.slice(0, -1)) ? null : 'long_e');
    }

    if (t === 't' && /^ion/.test(rest)) return (g.sound = 'sh'); // -tion
    if (t === 'i' && gs[i - 1]?.text.toLowerCase() === 't' && /^on/.test(rest)) return (g.sound = null);
    if (t === 'o' && /tion$/.test(w) && gs[i + 1]?.text.toLowerCase() === 'n' && i === gs.length - 2)
      return (g.sound = 'u');

    if (isVowel(t) && t.length === 1) {
      // magic e: vowel + one consonant + final e (make, time, hope, cube)
      const cons = gs[i + 1];
      const e = gs[i + 2];
      const magic =
        cons &&
        plain(cons) &&
        !isVowel(cons.text[0].toLowerCase()) &&
        // one consonant sound only: a doubled letter blocks magic e (hopped, not hoped)
        !(cons.text.length === 2 && cons.text[0].toLowerCase() === cons.text[1].toLowerCase()) &&
        e &&
        e.text.toLowerCase() === 'e' &&
        (i + 2 === gs.length - 1 || /^[sd]$/.test(gs[i + 3]?.text.toLowerCase() ?? '') && i + 3 === gs.length - 1) &&
        !NOT_MAGIC_E.has(w.replace(/[^a-z]/g, ''));
      if (magic) {
        e.silentE = true;
        return (g.sound = vowelSound(t, true));
      }
      return (g.sound = vowelSound(t, false));
    }
    if (PHONEME_FILES.has(t)) return (g.sound = t);
    return (g.sound = null);
  });

  // magic-e 'e's flagged above are silent
  gs.forEach((g) => {
    if (g.silentE) g.sound = null;
  });

  // -ed: /ɪd/ after t or d, /t/ after voiceless sounds, /d/ otherwise
  const n = gs.length;
  if (n >= 3 && gs[n - 1].text.toLowerCase() === 'd' && gs[n - 2].text.toLowerCase() === 'e' && w.length > 3) {
    const e = gs[n - 2];
    const before = gs
      .slice(0, n - 2)
      .map((g) => g.text.toLowerCase())
      .join('');
    if (/[td]$/.test(before)) {
      if (e.kind === 'plain' || e.kind === 'silent') e.sound = 'i';
    } else {
      if (e.kind === 'plain') e.sound = null;
      gs[n - 1].sound = VOICELESS_END.test(before) ? 't' : 'd';
    }
  }
  return gs;
}
