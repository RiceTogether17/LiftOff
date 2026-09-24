import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseToken, parseLine, plainText, parseWorkbook, storyWordCount } from '../src/parser.js';
import { toGraphemes, blendSteps, suffixHint } from '../src/graphemes.js';

describe('parseToken', () => {
  it('reads long, short, diphthong and silent coding with cues', () => {
    expect(parseToken('m{o}^un(ey)^e')).toEqual([
      { text: 'm', kind: 'plain' },
      { text: 'o', kind: 'short', cue: 'u' },
      { text: 'n', kind: 'plain' },
      { text: 'ey', kind: 'long', cue: 'e' },
    ]);
    expect(parseToken('m<ar>k[e]d')).toEqual([
      { text: 'm', kind: 'plain' },
      { text: 'ar', kind: 'diph' },
      { text: 'k', kind: 'plain' },
      { text: 'e', kind: 'silent' },
      { text: 'd', kind: 'plain' },
    ]);
  });

  it('puts a cue on the last plain letter only', () => {
    expect(parseToken('mag^jic')).toEqual([
      { text: 'ma', kind: 'plain' },
      { text: 'g', kind: 'plain', cue: 'j' },
      { text: 'ic', kind: 'plain' },
    ]);
  });

  it('supports multi-letter cues and escaped brackets', () => {
    expect(parseToken('s(oo)n')[1]).toEqual({ text: 'oo', kind: 'long' });
    expect(parseToken('p<a>^{ar}st')[1]).toEqual({ text: 'a', kind: 'diph', cue: 'ar' });
    expect(parseToken('\\(crushed\\)')).toEqual([{ text: '(crushed)', kind: 'plain' }]);
  });
});

describe('parseLine / plainText', () => {
  it('keeps punctuation with the word and records bold/key markers', () => {
    const [w1, w2, w3] = parseLine('"H(e)llo, *big* ~world~!');
    expect(w1.text).toBe('"Hello,');
    expect(w1.word).toBe('Hello');
    expect(w2.bold).toBe(true);
    expect(w3.key).toBe(true);
    expect(w3.text).toBe('world!');
  });
  it('strips coding for plain text', () => {
    expect(plainText('M(y)^i Offic^s[e] is in Sp(a)c^s[e]')).toBe('My Office is in Space');
  });
});

describe('graphemes', () => {
  it('keeps digraphs and doubled letters together, skips silent letters when blending', () => {
    const g = toGraphemes(parseToken('sh(e)ll[e]'));
    expect(g.map((x) => x.text)).toEqual(['sh', 'e', 'll', 'e']);
    expect(blendSteps(g)).toEqual(['sh', 'she', 'shell']);
  });
  it('blends cumulatively like LiftOff Stage 3', () => {
    expect(blendSteps(toGraphemes(parseToken('maftu')))).toEqual(['m', 'ma', 'maf', 'maft', 'maftu']);
  });
  it('spots a word inside -ing / -ed words', () => {
    expect(suffixHint('hopped')).toEqual({ base: 'hop', suffix: 'ed' });
    expect(suffixHint('looking')).toEqual({ base: 'look', suffix: 'ing' });
    expect(suffixHint('red')).toBeNull();
  });
});

// ── Content integrity: every transcription must parse cleanly ──────────────

const dir = new URL('../content/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.txt'));

describe.each(files)('content/%s', (file) => {
  const wb = parseWorkbook(readFileSync(new URL(file, dir), 'utf8'));
  const stories = wb.lessons.flatMap((l) => l.stories);

  it('has a workbook header, lessons and stories', () => {
    expect(wb.id).toMatch(/^WB\d+$/);
    expect(wb.lessons.length).toBeGreaterThan(0);
    expect(stories.length).toBeGreaterThan(0);
  });

  it('has unique story ids', () => {
    const ids = stories.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves no unbalanced coding marks in the text', () => {
    for (const s of stories) {
      for (const b of s.blocks) {
        for (const w of b.words) {
          const stray = w.segs.some((seg) => seg.kind === 'plain' && /[{}<>^~*]/.test(seg.text));
          expect(stray, `${s.id}: "${w.raw}"`).toBe(false);
        }
      }
      expect(storyWordCount(s), s.id).toBeGreaterThan(20);
    }
  });

  it('has well-formed quiz items', () => {
    for (const s of stories) {
      for (const q of s.quiz) {
        if (q.type === 'mc') {
          expect(q.options.length, `${s.id}: ${q.prompt}`).toBeGreaterThanOrEqual(2);
          expect(q.answer, `${s.id}: ${q.prompt}`).toBeGreaterThanOrEqual(0);
        }
        if (q.type === 'cloze') {
          const gaps = q.prompt.split('___').length - 1;
          expect(q.answers.length, `${s.id}: ${q.prompt}`).toBe(gaps);
          const bank = q.bank.map((x) => x.toLowerCase());
          if (bank.length) for (const a of q.answers) expect(bank, `${s.id}: ${a}`).toContain(a.toLowerCase());
        }
        if (q.type === 'order') {
          const pos = q.items.map((i) => i.position).sort();
          expect(pos).toEqual(q.items.map((_, i) => i + 1));
        }
        if (q.type === 'tf') expect(typeof q.answer).toBe('boolean');
      }
    }
  });
});
