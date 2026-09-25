# LiftOff Stories

An interactive reader for the stories in the LCentral **LiftOff Learn-to-Read**
WorkBooks. It holds 58 stories from all six Learn-to-Read WorkBooks (Lessons 1–43). It is modelled on the Story mode in
[PhonicsQuest](https://github.com/RiceTogether17/phonicsquest). The child
reads aloud with the workbook coding, and can hear any sound, word, line or
question when they need help.

| Feature | What it does | LiftOff method it follows |
|---|---|---|
| 🤝 **Meet the Words** | Shows the lesson's vocabulary page and the story's key words before reading | "Teaching vocabulary before reading a passage improves … comprehension" |
| 🎨 **Coding** | Shows the workbook colour coding: blue for long vowels, red for vowels that make another sound, green for diphthongs, grey for silent letters, and small cue letters above | Diacritical marking; switch it off to practise reading uncoded text |
| 📏 **Ruler** | Keeps one line or paragraph in focus and dims the rest | Reading Ruler tracking |
| 🔤 **Sound It Out** | Tap a word to see its sounds, then add them one at a time: `m → ma → maf → maft`. Each sound plays as it is added, any tile can be tapped to hear it again, and 🔊 says the whole word once the child has blended it | Grapheme blending Stage 3 |
| 🎧 **Listen** | Reads the story aloud, highlighting each word. Tap any line to start there; 🐢 slows it down. In a Readers Theatre, it pauses on the child's own lines | Modelled fluent reading |
| 🔊 **Questions** | Every comprehension question can be read aloud | Comprehension for early readers |
| ⭐ Sight words | An uncoded high-frequency word shows as a sight word, not as sounds to blend | Sight words as a word-attack skill |
| 💡 Look inside | Points out a smaller word plus *-ed* or *-ing* | "Can you see a sight word there?" |
| 🎭 **Readers Theatre** | Choose a role and your lines are highlighted | WB6 Lizard of Oz script |
| ⏱ **Fluency timer** | Measures words per minute for each story and keeps your best score | Reading fluency |
| ✏️ **Check** | The workbook's own true/false, multiple-choice, word-bank, ordering and written-answer activities | Comprehension |
| 📊 **Progress** | Shows stories read, quiz scores and best words per minute, for teachers and parents | Outcomes Record |

Progress is saved in the browser on the device being used (localStorage).

## Audio

Single sounds are recordings in `public/audio/phonemes/` (46 files, shared
with PhonicsQuest). Whole words, story lines and questions use the device's
speech voice, preferring a British English one. 🔊 Sound in the reader turns
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
