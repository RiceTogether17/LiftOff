import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseWorkbook, parseToken, plainText } from '../src/parser.js';
import { toGraphemes, blendSteps } from '../src/graphemes.js';
import { assignSounds, PHONEME_FILES } from '../src/phonemes.js';

const sounds = (raw) =>
  assignSounds(toGraphemes(parseToken(raw)), plainText(raw))
    .map((g) => `${g.text.toLowerCase()}:${g.sound ?? '-'}`)
    .join(' ');

describe('phoneme audio files', () => {
  it('has a recording for every sound the app can play', () => {
    for (const k of PHONEME_FILES) {
      expect(existsSync(new URL(`../public/audio/phonemes/${k}.mp3`, import.meta.url)), k).toBe(true);
    }
  });
});

describe('sounds from the workbook coding', () => {
  it('uses the cue letter as the sound', () => {
    expect(sounds('f{u}^{oo}ll')).toBe('f:f u:short_oo ll:l');
    expect(sounds('ele[ph]^fant')).toBe('e:e l:l e:e ph:f a:a n:n t:t');
    expect(sounds('mag^jic')).toBe('m:m a:a g:j i:i c:c');
    expect(sounds('w<or>^{er}ld')).toBe('w:w or:er l:l d:d');
    expect(sounds('m{o}^un(ey)^e')).toBe('m:m o:u n:n ey:long_e');
  });
  it('uses the colour when there is no cue', () => {
    expect(sounds('l(a)k[e]')).toBe('l:l a:long_a k:k e:-');
    expect(sounds('c<ar>')).toBe('c:c ar:ar');
    expect(sounds('l{oo}king')).toBe('l:l oo:short_oo k:k i:i ng:ng');
  });
});

describe('sounds for uncoded text (CheckOut rules)', () => {
  it.each([
    ['rain', 'r:r ai:long_a n:n'],
    ['time', 't:t i:long_i m:m e:-'],
    ['hopped', 'h:h o:o pp:p e:- d:t'],
    ['hoped', 'h:h o:long_o p:p e:- d:t'],
    ['wanted', 'w:w a:a n:n t:t e:i d:d'],
    ['played', 'p:p l:l ay:long_a e:- d:d'],
    ['happy', 'h:h a:a pp:p y:long_e'],
    ['my', 'm:m y:long_i'],
    ['night', 'n:n igh:long_i t:t'],
    ['city', 'c:soft_c i:i t:t y:long_e'],
    ['heard', 'h:h ear:er d:d'],
    ['show', 'sh:sh ow:long_o'],
    ['cow', 'c:c ow:ow'],
    ['head', 'h:h ea:e d:d'],
    ['have', 'h:h a:a v:v e:-'],
  ])('%s', (w, want) => expect(sounds(w)).toBe(want));

  it('blends only the sounding graphemes', () => {
    const gs = assignSounds(toGraphemes(parseToken('time')), 'time');
    expect(blendSteps(gs)).toEqual(['t', 'ti', 'tim']);
  });
});

describe('every letter in the stories', () => {
  const dir = new URL('../content/', import.meta.url);
  const quietPlain = new Set(['e', 'i', "'"]); // magic/final e, -ed, the i in -tion
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
    it(`${f}: every coded or consonant grapheme has a sound`, () => {
      const wb = parseWorkbook(readFileSync(new URL(f, dir), 'utf8'));
      const bad = new Set();
      for (const l of wb.lessons)
        for (const w of [...l.words, ...l.stories.flatMap((s) => s.blocks.flatMap((b) => b.words))]) {
          for (const g of assignSounds(toGraphemes(w.segs), w.word)) {
            if (g.sound) {
              if (!PHONEME_FILES.has(g.sound)) bad.add(`${w.text}: ${g.text} → ${g.sound}`);
              continue;
            }
            const silent = g.kind === 'silent' && !g.cue;
            if (!silent && !quietPlain.has(g.text.toLowerCase())) bad.add(`${w.text}: ${g.text} (${g.kind}${g.cue ? '^' + g.cue : ''})`);
          }
        }
      expect([...bad]).toEqual([]);
    });
  }
});
