# LiftOff Stories

An interactive reader for the stories in the LCentral **LiftOff Learn-to-Read**
WorkBooks. It holds 58 stories from all six Learn-to-Read WorkBooks (Lessons 1–43). It is modelled on the Story mode in
[PhonicsQuest](https://github.com/RiceTogether17/phonicsquest). The child
reads aloud with the workbook coding, and can hear any sound, word, line or
question when they need help.

**For the child**

| Feature | What it does | LiftOff method it follows |
|---|---|---|
| 🤝 **Warm-up** | Three words from the story on large cards. For each one: hear it, try it, then tick "I've practised this word". Key words ask "what does it mean?". *See all lesson words* keeps the full vocabulary page, and *Skip warm-up* is always there | "Teaching vocabulary before reading a passage improves … comprehension" |
| 👆 **Tap a word** | Tapping any word while reading opens Sound It Out: see its sounds and add them one at a time (`m → ma → maf → maft`), tap a tile to hear a sound again. *Just hear the word* is always an option, and *Back to my story* returns to the text. A glowing word teaches this the first time | Grapheme blending Stage 3 |
| 🎧 **Listen** | Reads the story aloud, highlighting each word. Tapping a word for help pauses the voice and offers *Continue reading*. In a Readers Theatre it pauses on the child's own lines | Modelled fluent reading |
| 📏 **Ruler** | An on-screen Reading Ruler under the line on screen, in three styles: **Word** (a pointer under each word), **Line** (covers the lines still to come) and **Window** (only the current line is bright). Move it with *Next line / Next word*, the arrow keys, a tap, or by dragging | Reading Ruler tracking |
| ⚙️ **Settings** | Colour coding on or off, colour key, text size, sound, and reading-aloud speed, saved for each child | Diacritical marking: blue long vowels, red other vowel sounds, green diphthongs, grey silent letters (with a dotted underline) and small cue letters |
| ✏️ **Questions** | The workbook's own true/false, multiple-choice, word-bank, ordering and written-answer activities. Choose, then *Check*. If it's not right, *Look at the story* highlights the sentence with the clue, then the child tries again. If it's still not right, the answer is shown with the sentence that proves it. Ordering answers can be taken back. Every answer and written draft is saved | Comprehension |
| 🌟 **Ending** | Says what the child did (words read, words worked on, questions answered), then offers *Read it again*, *Next story* or *Finish for today* | — |

**For grown-ups**

| Feature | What it does |
|---|---|
| 🧒 **Readers** | A profile for each child, with a name and a picture, each with their own progress and settings. The child reading now is always shown at the top |
| 🏠 **Home** | *Continue reading* (the place where they stopped, or questions still waiting), *Today's story* (the next unread story from the lesson a grown-up chose), and *Read a favourite again* |
| 👪 **Grown-ups** | Suggested next story with the reason, one thing to try together, recent practice, help used (words looked at, Listen), the starting lesson, readers, backup and restore, reset, and lock. *View all activity* has the full table |
| ⏱ **Reading pace** | Optional and led by a grown-up: time one read-aloud to get words per minute. If you enter the mistakes you counted, it also shows accuracy and words correct per minute. You can record whether they read on their own or with help. It is not shown to the child as a score |
| 💾 **Saving** | Progress is saved in this browser (localStorage). If the browser blocks saving, a warning says so. *Download backup* and *Restore a backup* move progress between devices |


## Audio

Single sounds are recordings in `public/audio/phonemes/` (46 files, shared
with PhonicsQuest). Whole words, story lines and questions use the device's
speech voice, preferring a British English one. ⚙️ Settings → Sounds turns
all audio on or off.

Which recording a letter plays comes from the workbook coding
(`src/phonemes.js`): a cue letter is the sound (`{u}^oo` → short oo,
`[ph]^f` → f), blue vowels are long, red vowels short, green letters their
r-controlled or gliding sound, grey letters silent. Text the books no longer
code follows the CheckOut rules (vowel teams, magic e, final y, soft c/g,
-ed, -tion). `npm test` checks that every letter in every story maps to a
recording or is silent.

## Password lock

The stories are encrypted when the site is built (AES-GCM, key derived from
the password with PBKDF2), so the published files never contain them in
readable form. Visitors must enter the password to open the app; "Remember
this device" keeps them signed in, and 🔒 Lock on the library page signs out.

The password is **not** stored in the repository. Before running or
building, create a `.env` file (git-ignored) next to `package.json`:

```bash
cp .env.example .env    # then set LIFTOFF_PASSWORD=... in .env
```

Changing the password only needs a new `.env` value and a rebuild; devices
that were remembered will be asked for the password again.

## Publish on GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the site on every push to
`main`. One-time setup in the repository settings:

1. **Settings → Secrets and variables → Actions → New repository secret**:
   name `LIFTOFF_PASSWORD`, value = the password.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.

(“Deploy from a branch” does not work: it publishes the unbuilt source files,
which shows a blank page.)

## Run it

```bash
npm install
npm run dev      # local development
npm test         # parser and content checks
npm run build    # static site in dist/ (works from any folder)
```

## Content

Each workbook is a plain-text transcription in `content/wbN.txt`. The file
format is documented at the top of `src/parser.js`. The coding marks work
like this:

```
(ai)  long vowel       {o}  other vowel sound   <ar>  diphthong   [e]  silent
[ph]^f  dark grey: letters that make the small cue sound (ph → f, ti → sh)
^j    small cue letter above the grapheme before it   (^{oo} for longer cues)
m{o}^un(ey)^e  →  m · o (red, cue "u") · n · ey (blue, cue "e")
```

To add a workbook, create a new `content/wbN.txt` file. The app picks it up
automatically, and `npm test` checks that the coding marks are balanced and
the quiz answers are valid.

WorkBooks 1–5 have been checked against the student WorkBook PDFs, which carry
a text layer: every sentence, question and vocabulary word, and the colour of
every letter (about 97% of words; the rest sit where text boxes break mid
sentence). WorkBook 6 is transcribed from the Teacher Copy only.
