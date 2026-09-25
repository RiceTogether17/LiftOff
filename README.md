# LiftOff Stories

An interactive reader for the stories in the LCentral **LiftOff Learn-to-Read**
WorkBooks. It holds 58 stories from all six Learn-to-Read WorkBooks (Lessons 1–43). It is modelled on the Story mode in
[PhonicsQuest](https://github.com/RiceTogether17/phonicsquest), but it has
**no audio**. The child does the reading aloud, and the app supports it the
way a LiftOff teacher would.

| Feature | What it does | LiftOff method it follows |
|---|---|---|
| 🤝 **Meet the Words** | Shows the lesson's vocabulary page and the story's key words before reading | "Teaching vocabulary before reading a passage improves … comprehension" |
| 🎨 **Coding** | Shows the workbook colour coding: blue for long vowels, red for vowels that make another sound, green for diphthongs, grey for silent letters, and small cue letters above | Diacritical marking; switch it off to practise reading uncoded text |
| 📏 **Ruler** | Keeps one line or paragraph in focus and dims the rest | Reading Ruler tracking |
| 🔤 **Sound It Out** | Tap a word to see its sounds, then add them one at a time: `m → ma → maf → maft` | Grapheme blending Stage 3. The app never says the sound and never gives the word away |
| ⭐ Sight words | An uncoded high-frequency word shows as a sight word, not as sounds to blend | Sight words as a word-attack skill |
| 💡 Look inside | Points out a smaller word plus *-ed* or *-ing* | "Can you see a sight word there?" |
| 🎭 **Readers Theatre** | Choose a role and your lines are highlighted | WB6 Lizard of Oz script |
| ⏱ **Fluency timer** | Measures words per minute for each story and keeps your best score | Reading fluency |
| ✏️ **Check** | The workbook's own true/false, multiple-choice, word-bank, ordering and written-answer activities | Comprehension |
| 📊 **Progress** | Shows stories read, quiz scores and best words per minute, for teachers and parents | Outcomes Record |

Progress is saved in the browser on the device being used (localStorage).

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
^j    small cue letter above the grapheme before it   (^{oo} for longer cues)
m{o}^un(ey)^e  →  m · o (red, cue "u") · n · ey (blue, cue "e")
```

To add a workbook, create a new `content/wbN.txt` file. The app picks it up
automatically, and `npm test` checks that the coding marks are balanced and
the quiz answers are valid.

Where a teacher note covers part of the text in the Teacher Copy, the story
shows a 📝 note saying so. Please fill in those gaps from the student
WorkBook.
