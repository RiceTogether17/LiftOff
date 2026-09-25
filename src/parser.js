/**
 * Parser for the LiftOff story transcriptions in /content/*.txt.
 *
 * The workbooks mark every word with colour-coded "diacritical" cues. The
 * transcription keeps that coding with a small inline markup:
 *
 *   (ai)   blue   – long vowel sound
 *   {o}    red    – vowel making a different sound (usually with a cue)
 *   <ar>   green  – diphthong
 *   [e]    grey   – silent letters
 *   [ph]^f dark grey – letters that make the cue's sound (ph → f, ti → sh)
 *   ^j     cue    – small letter(s) printed above the previous grapheme
 *   ^{oo}         (braces for multi-letter cues)
 *
 * Example: "m{o}^un(ey)^e" → m · o(red, cue "u") · n · ey(blue, cue "e")
 *
 * Document structure (one workbook per file):
 *
 *   # WB3 | Workbook 3 | Long Vowels        workbook header
 *   ## L14 | Long vowel /u/ · soft g /j/     lesson header
 *   focus: u, j                              lesson focus sounds
 *   words: p(u)r[e] t(u)n[e] …               vocabulary page words
 *   ### Title                                story (title may be coded)
 *   Paragraph text…                          blank line separates paragraphs
 *   + Heading                                sub-heading inside a story
 *   - item                                   list item inside a story
 *   > N1: line                               script line (readers theatre)
 *   ?tf Statement | T                        true / false
 *   ?mc Question  (then "* right" / "- wrong" option lines)
 *   ?qa Question  (then "= model answer")
 *   ?talk Question                           discuss-together prompt (no answer)
 *   ! Note                                   editor's note shown to adults
 *   *word*                                   word printed in bold
 *   ~word~                                   highlighted key vocabulary
 *   \( \[ \<                                 literal bracket (not coding)
 *   roles: N1=Narrator 1, BL=Bob Lizard      readers-theatre cast (lesson level)
 *   ?bank a, b, c                            word bank for following cloze items
 *   ?cloze Text with ___ gaps | ans1, ans2
 *   ?order Event text | 2                    put events in order
 */

const KIND_BY_OPEN = { '(': 'long', '{': 'short', '<': 'diph', '[': 'silent' };
const CLOSE_BY_OPEN = { '(': ')', '{': '}', '<': '>', '[': ']' };

/**
 * Parse one coded token (a word plus any attached punctuation) into segments.
 * @param {string} token
 * @returns {Array<{text:string, kind:'plain'|'long'|'short'|'diph'|'silent', cue?:string}>}
 */
export function parseToken(token) {
  const segs = [];
  let plain = '';
  const flushPlain = () => {
    if (plain) segs.push({ text: plain, kind: 'plain' });
    plain = '';
  };
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === '\\' && i + 1 < token.length) {
      // "\(" prints a literal bracket, e.g. "\(crushed\)"
      plain += token[i + 1];
      i += 1;
    } else if (KIND_BY_OPEN[ch]) {
      const close = token.indexOf(CLOSE_BY_OPEN[ch], i + 1);
      if (close === -1) {
        plain += ch;
        continue;
      }
      flushPlain();
      segs.push({ text: token.slice(i + 1, close), kind: KIND_BY_OPEN[ch] });
      i = close;
    } else if (ch === '^') {
      let cue;
      if (token[i + 1] === '{') {
        const close = token.indexOf('}', i + 2);
        cue = token.slice(i + 2, close === -1 ? token.length : close);
        i = close === -1 ? token.length : close;
      } else {
        cue = token[i + 1] ?? '';
        i += 1;
      }
      // A cue sits above the grapheme right before it. For a plain run, that
      // is only the last letter ("mag^jic" puts the j over the g).
      if (plain) {
        const last = plain.slice(-1);
        plain = plain.slice(0, -1);
        flushPlain();
        segs.push({ text: last, kind: 'plain', cue });
      } else if (segs.length) {
        segs[segs.length - 1].cue = cue;
      }
    } else {
      plain += ch;
    }
  }
  flushPlain();
  return segs;
}

/** Plain spelling of a coded token, e.g. "m{o}^un(ey)^e" → "money". */
export function plainText(coded) {
  return coded
    .replace(/\^\{[^}]*\}/g, '')
    .replace(/\^./g, '')
    .replace(/\\(.)|[()[\]{}<>]/g, (_, esc) => esc ?? '');
}

/**
 * Split a coded paragraph into word tokens. Each token keeps its punctuation
 * so it renders exactly as printed; `word` is the bare word for look-ups.
 */
export function parseLine(line) {
  return line
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      // *word* = printed in bold (a reading-with-expression cue)
      // ~word~ = highlighted key vocabulary
      const bold = /\*[^*]+\*/.test(raw);
      const key = /~[^~]+~/.test(raw);
      const segs = parseToken(raw.replace(/[*~]/g, ''));
      const text = segs.map((s) => s.text).join('');
      const word = text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
      const out = { raw, segs, text, word };
      if (bold) out.bold = true;
      if (key) out.key = true;
      return out;
    });
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse a whole workbook transcription.
 * @param {string} src
 */
export function parseWorkbook(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const wb = { id: '', title: '', subtitle: '', lessons: [] };
  let lesson = null;
  let story = null;
  let para = [];
  let bank = null;
  let pendingQ = null;

  const flushPara = () => {
    if (story && para.length) story.blocks.push({ type: 'p', words: parseLine(para.join(' ')) });
    para = [];
  };
  const endQuestion = () => {
    if (pendingQ && story) story.quiz.push(pendingQ);
    pendingQ = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const t = line.trim();

    if (t.startsWith('### ')) {
      flushPara();
      endQuestion();
      bank = null;
      const titleCoded = t.slice(4).trim();
      const title = plainText(titleCoded);
      story = {
        id: `${wb.id.toLowerCase()}-${lesson?.number ?? 0}-${slug(title)}`,
        title,
        titleWords: parseLine(titleCoded),
        lesson: lesson?.number,
        workbook: wb.id,
        roles: lesson?.roles ?? null,
        blocks: [],
        quiz: [],
      };
      lesson?.stories.push(story);
      continue;
    }
    if (t.startsWith('## ')) {
      flushPara();
      endQuestion();
      story = null;
      bank = null;
      const [code, ...rest] = t.slice(3).split('|').map((s) => s.trim());
      lesson = {
        number: Number(code.replace(/\D/g, '')),
        title: rest.join(' | '),
        focus: [],
        words: [],
        stories: [],
      };
      wb.lessons.push(lesson);
      continue;
    }
    if (t.startsWith('# ')) {
      const [id, title, subtitle] = t.slice(2).split('|').map((s) => s.trim());
      Object.assign(wb, { id, title, subtitle: subtitle ?? '' });
      continue;
    }
    if (!story && lesson) {
      if (t.startsWith('focus:')) {
        lesson.focus = t
          .slice(6)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        continue;
      }
      if (t.startsWith('roles:')) {
        lesson.roles = Object.fromEntries(
          t
            .slice(6)
            .split(',')
            .map((s) => s.split('=').map((x) => x.trim()))
            .filter(([k, v]) => k && v),
        );
        continue;
      }
      if (t.startsWith('words:')) {
        lesson.words = parseLine(t.slice(6));
        continue;
      }
    }
    if (!story) continue;

    if (t.startsWith('?')) {
      flushPara();
      endQuestion();
      const m = t.match(/^\?(\w+)\s*(.*)$/);
      if (!m) continue;
      const [, kind, body] = m;
      const [left, right = ''] = body.split(/\s\|\s/);
      if (kind === 'tf') {
        story.quiz.push({ type: 'tf', prompt: left.trim(), answer: right.trim().toUpperCase() === 'T' });
      } else if (kind === 'mc') {
        pendingQ = { type: 'mc', prompt: left.trim(), options: [], answer: -1 };
      } else if (kind === 'qa') {
        pendingQ = { type: 'qa', prompt: left.trim(), answer: '' };
      } else if (kind === 'talk') {
        story.quiz.push({ type: 'talk', prompt: left.trim() });
      } else if (kind === 'bank') {
        bank = body.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (kind === 'cloze') {
        story.quiz.push({
          type: 'cloze',
          prompt: left.trim(),
          answers: right.split(',').map((s) => s.trim()).filter(Boolean),
          bank: bank ?? [],
        });
      } else if (kind === 'order') {
        const last = story.quiz[story.quiz.length - 1];
        const item = { text: left.trim(), position: Number(right) };
        if (last?.type === 'order') last.items.push(item);
        else story.quiz.push({ type: 'order', items: [item] });
      }
      continue;
    }
    if (pendingQ?.type === 'mc' && /^[*-]\s/.test(t)) {
      if (t.startsWith('*')) pendingQ.answer = pendingQ.options.length;
      pendingQ.options.push(t.slice(2).trim());
      continue;
    }
    if (pendingQ?.type === 'qa' && t.startsWith('= ')) {
      pendingQ.answer = t.slice(2).trim();
      continue;
    }

    if (!t) {
      flushPara();
      continue;
    }
    endQuestion();
    if (t.startsWith('! ')) {
      flushPara();
      story.blocks.push({ type: 'note', text: t.slice(2).trim(), words: [] });
    } else if (t.startsWith('+ ')) {
      flushPara();
      story.blocks.push({ type: 'h', words: parseLine(t.slice(2)) });
    } else if (t.startsWith('- ')) {
      flushPara();
      story.blocks.push({ type: 'li', words: parseLine(t.slice(2)) });
    } else if (t.startsWith('> ')) {
      flushPara();
      const m = t.slice(2).match(/^([^:]+):\s*(.*)$/);
      story.blocks.push({
        type: 'script',
        role: m ? m[1].trim() : '',
        words: parseLine(m ? m[2] : t.slice(2)),
      });
    } else {
      para.push(t);
    }
  }
  flushPara();
  endQuestion();
  return wb;
}

/** Count the readable words in a story (for words-per-minute). */
export function storyWordCount(story) {
  return story.blocks.reduce(
    (n, b) => n + b.words.filter((w) => /[A-Za-z0-9]/.test(w.text)).length,
    0,
  );
}
