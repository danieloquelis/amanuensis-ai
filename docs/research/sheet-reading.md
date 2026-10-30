# Sheet reading: how well Muse Spark reads printed music

Phase 0 of the [sheet reading plan](../planning/sheet-reading-plan.md). Measured 30 October 2026 with `muse-spark-1.3-contributor` (the model in use), through `yarn eval:sheet-reading --confirm`.

## Method

- **Pages:** the engraving fixtures (`tests/fixtures/engraving/*.json`), drawn by the running app at twice screen density (about 2,100 px wide), then resized as JPEG. Each page's exact score is known.
- **Request:** one call per page, with no tools. The model is asked for a JSON reply: a reading (key signature as sharps or flats, meter, bar count, unclear spots) and the page in score text, with pitches as written on the page.
- **Grading** (`scripts/lib/sheet-compare.mts`):
  - key, meter and bar count against the score;
  - **pitch:** notes, chords and drum hits at the right place in the bar with the right pitches;
  - **exact:** the same, and the right length too;
  - **rhythm:** lines (bar, staff, voice) whose every onset and length is right, rests included;
  - **chords:** bars whose chord symbols are exactly right.

  Graded against itself, every non-transposing fixture scores 100%. Transposing parts are graded in written pitch, as the page shows them.

## Pilot (2 pages, 2,000 px, effort low, plain prompt)

| Page | Key | Meter | Bars | Pitch | Exact | Rhythm | Chords | Seconds | Tokens in/out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dense | ✓ | ✓ | ✓ | 15% | 15% | 80% | — | 74 | 4,867 / 5,416 |
| leadsheet | ✓ | ✓ | ✓ | 30% | 30% | 100% | 0% | 43 | 3,900 / 3,389 |

**Findings:**
- **The overall reading is right:** key, meter and bar count, plus sections, the segno, To Coda, D.S. al Coda, slash bars and the repeat sign.
- **Rhythm is mostly right.**
- **Pitches are often a step off.** In the lead sheet's bar 2, E D C B♭ was read as D C B♭ A, every note one step low; bar 5 is further off (D4 for G4). Placing a notehead on its exact line or space is the weak point.
- **Chords were read correctly but written without the `chords` keyword**, so they graded 0%; the prompt now gives example lines.
- **It reports its doubt honestly.** Its `unclear` list named the very spots it got wrong ("bar 5 beat 1: dotted white head low below staff could be D4 or F4").

## Full comparison (4 pages: leadsheet, dense, keys, long; 2,000 px)

Pitch accuracy (notes at the right place with the right pitch). Key signature, meter and bar count were right in **every** run below.

| Condition | dense | keys | leadsheet | long | Seconds per page | Tokens in / out |
| --- | --- | --- | --- | --- | --- | --- |
| 1.3, plain prompt, effort low | 32% | 47% | 40% | 82% | 28–67 | 4–5k / 2–5k |
| 1.3, plain prompt, effort medium | 6% | 30% | 80% | 46% | 86–158 | 4–5k / 7–12k |
| 1.3, plain prompt, effort high | timed out (3 min) | timed out | 40% | timed out | 119+ | — / 10k+ |
| 1.3, counting prompt, effort low | 24% | 53% | 30% | 8% | 35–87 | 4–5k / 3–7k |
| 1.3, counting prompt, effort medium/high | 0% or timed out | timed out | 30–40% | timed out | 51–147 | — |
| 1.3, page + close-ups of 2 bars, low (run 1) | 6% | 60% | 30% | 72% | 61–92 | 7–12k / 5–7k |
| 1.3, page + close-ups of 2 bars, low (run 2) | 35% | 30% | 50% | 79% | 65–124 | 7–12k / 5–10k |
| 1.2, plain prompt, effort low | 3% | 20% | 10% | 15% | 18–29 | 4–5k / 3–6k |

Rhythm (lines exactly right) stayed mostly at 80–100% with 1.3 at low effort. Chord symbols, when written with the right keyword, were 67–100% right.

### What the errors are

Wrong pitches are mostly **near misses**: one line or space off, in both directions (a histogram over every run shows most misses at ±1 staff step, some at ±2–3). So they are not a consistent shift (such as a misread clef) that could be corrected; the model places noteheads only roughly. More thinking makes it worse, not better. Close-ups do not fix it, and results swing widely between identical runs (dense: 6% and 35%).

## Real pages (judged by eye; kept out of the repository)

Four pictures from the product owner, read with 1.3 at low effort, 2,000 px. Two are copyrighted and none are committed; there is no exact score to grade against, so each reading was compared with the picture.

| Page | Read right | Read wrong |
| --- | --- | --- |
| Chopin, Nocturne Op. 9 No. 2 (clean engraving, piano) | E♭ major, 12/8, "Andante ♪ = 132", the pickup, 6 bars, 2 staves, *espress. dolce*, f and p; left-hand bass-then-chord pattern roughly | the right-hand melody (wrong notes and contour); an invented "section A" |
| Salsa drum patterns, sections A–F (percussion) | 12 bars in six 2-bar sections; son clave, the accented eighths and the cascara **note for note** | repeat barlines written as "repeat previous bar"; which drum the low notes are (flagged) |
| *I Just Stood and Stared* (phone photo, piano/vocal) | 4/4, ~15 bars, voice + piano, lyrics line by line, Verse and Chorus, tempo texts; most chords (F7, B♭, C dim, B♭m6, C7, Fm, A♭m6, B♭7) | the key (2 flats for 3); a few verse chords and "add" extensions; the melody simplified to quarters; the piano to whole-note chords |
| Old handwritten manuscript (612 px wide) | the Trio and the D.C. | the meter (3/4 for 2/4); no notes at all, saying the picture is too small to read |

These confirm the measured result: structure, text, lyrics, chord symbols and rhythm (including drum notation, where few positions matter) read well; the exact pitches of notes on a staff do not. A picture too small to read gets an honest "cannot read" rather than invented notes.

Two lessons for the import:
- The reading must tell repeat barlines apart from our "repeat the previous bar" display.
- When a picture is too small, the agent should ask for a sharper one.

## Gate: not passed for notes on a staff

The plan's gate asked for most pitches right on clean printed pages; the best condition reaches about half, unstably, and these are our own clean, computer-drawn pages. Phone photos and handwriting would be harder. **Muse Spark alone cannot read the notes of a staff reliably.**

What it does read reliably from a picture:
- the key signature, meter and bar count;
- the form: sections, repeats, segno and coda, slash bars, tempo marks;
- chord symbols (they are text);
- mostly the rhythm.

Text sources (chord charts, ABC, tab, lyrics with chords) do not depend on reading noteheads.

## Computer vision labels the noteheads; Spark reads the music

Spark reads text reliably but cannot measure where a notehead sits. So the measuring is done by classic computer vision, and its result is written on the picture as text. Each notehead gets a small red label naming its line or space: the letter and octave on its staff's clef, without the key signature or accidentals, which Spark applies itself. This is "set-of-marks" prompting.

**With perfect labels (from the engraver), 4 pages, 1.3 at low effort:**

| Page | Without labels | With labels |
| --- | --- | --- |
| dense | 12% | 82% |
| keys | 30% | 100% |
| leadsheet | 40% | 100% |
| long | 69% | 97% |

The approach works, and low effort is enough. Dense's misses are dotted rhythms and two accidentals, not placement.

**The detector** (`scripts/lib/notehead-detect.mts`, free, about 1 s per page) works by classic image processing:
- **Staves:** five evenly spaced dark rows, gaps allowed.
- **Heads:** ovals at every line and space of each staff, ledger positions included.
- **Rules from engraving:**
  - a half note has a stem up on its right or down on its left;
  - a whole note is a wider oval with no stem;
  - beyond the staff, a head sits on or beside a ledger line;
  - no note sits within the clef's width.

On the 12 pitched fixtures it finds **92–100% of the heads, every found head on the right line or space**, with 0–8 false detections per page (`yarn tsx scripts/detect-eval.mts`).

**Spark with the detector's labels, 12 pages, 1.3 at low effort:**

| Page | Pitch | Exact | Rhythm |
| --- | --- | --- | --- |
| dense | 94% | 88% | 80% |
| ensemble | 60%\* | 60% | 100% |
| keys | 97% | 97% | 100% |
| leadsheet | 100% | 100% | 100% |
| long | 95% | 95% | 100% |
| short | 100% | 100% | 100% |
| slurs | 100% | 100% | 100% |
| stacks | 63% | 56% | 60% |
| ties | 96% | 92% | 90% |
| trombone | 91% | 91% | 100% |
| trumpet | 100% | 100% | 100% |
| voices | 83% | 80% | 55% |

\* Spark recognised "Trumpet in B♭" and wrote that line at sounding pitch, correctly; the grade expects written pitch. Its trumpet notes match the concert-pitch score exactly.

- **Stacks:** the remaining errors are rhythm (a quarter read as a half) and two voices merged into chords.
- **Voices:** the errors are rhythm in the lower voice.

The agent's check step (detected heads per bar and onset against what was written) is designed to catch exactly these.

**Gate: passed on clean pages** with the detector, at low effort and 10–125 s per page. Phone photos (curved, angled pages), handwriting and dense real scores still need testing; a photo needs straightening before detection.

## A real page: Chopin, Nocturne Op. 9 No. 2 (screenshot)

The first real page showed four detector faults. None of them appeared on our own fixtures, whose staff lines are light grey:

| Fault | Cause | Fix |
| --- | --- | --- |
| Every head on a staff line went unlabelled (B♭4, all the F5s) | The page prints its staff lines black, so the beam guard saw "ink on both sides" of every head on a line | A beam is thick and a staff line is thin: the guard now counts only ink at least 0.4 space tall |
| The 12/8 digits and an eighth's flag were labelled as heads | Filled blobs of a head's size | A filled head must have a stem (up on its right, down on its left), unless it sits a second away from one that has (a chord's second hangs on the far side) |
| Spark read the labels "G5" as "G6" | 0.75-space labels became about 10 px once the model scaled the page down | Labels a full staff space tall, with a white outline |
| Labels too small to find heads on a small screenshot | 12 px staff spaces | Pages are enlarged to at least 28 px per staff space before detection |

The fixtures kept their recall (92–100%) with less noise after each fix. A rule that dropped stemless ovals in a stemmed head's column (the flag's curl) was tried and reverted: it also dropped real whole notes in two-voice bars.

Even with correct labels, one-shot readings of this page varied between runs: once the right hand was right and the left hand invented full chords, once the reverse.

## The heads as text

The detector's heads are also given as text, one line per staff down the page: each head by its line or space, left to right, a column of heads (a chord) in `<…>`, and `|` at each barline found (`scripts/lib/sheet-bars.mts`). A stroke from a staff's top line to its bottom line is a barline unless a head sits within a staff space of it (then it is that head's stem).

```text
staff 1 (treble): <F4 A4 C5 E5> <F4 B4> | G5 G5 F5 G5 F5 E5 <F4 B4> | G5 <A4 C5> C6 G5 B5 A5 G5 |
staff 2 (bass): <A2 C3 E3> G3 | E2 <G3 E4> <B3 E4 G4> E3 <A3 D4> C4 <D4 A4> E2 <G3 E4> …
```

(The first column of each line is the 12/8: the time signature's digits.)

- **On Chopin**, Spark then followed the heads almost note for note: the left hand's voicing and the right hand's contour were right, with the key signature applied. What remained was rhythm and layout: the pickup folded into bar 1, the first note's length.
- **On the fixtures** it made no measurable difference (89% pitch on average with it, 90% without; single pages swing ±10 points between runs). Rhythm dipped on two pages.
- **Drum staves** are left out of the list: their positions are instruments, and a list of "?" made Spark write nothing.

It is kept: free, neutral on clean pages, and a clear help on a real one.

## Muse Wonder against Muse Spark

`muse-wonder-1.0` is available to our key. Reported list prices (secondary sources): Wonder about $4 / $20 per million tokens in / out; Spark 1.3 about $1.25 / $4.25.

**Without labels** (4 pages, low effort), Wonder places noteheads no better than Spark: pitch 12% / 50% / 30% / 77% (dense, keys, leadsheet, long), against Spark's 32% / 47% / 40% / 82% and 12% / 30% / 40% / 69% in two runs. It also misread one key signature. Placing heads is a limit of how these models see, not of their size.

**With labels and the list** (12 pitched fixtures, low effort, one run each):

| | Spark 1.3 | Wonder 1.0 |
| --- | --- | --- |
| Pitch, average | 89% | 90% |
| Better on | dense 97% (Wonder 53%), stacks 75% (69%) | long 100% (85%), leadsheet 100% (90%), trumpet 100% (91%) |
| Rhythm | 73–100% | 60–100%, more often 100% |
| Time for the 12 pages | 716 s | 419 s |
| Output tokens | 56k | 44k |
| Cost of the run (list prices) | about $0.30 | about $1.10 |

- Wonder made **format slips** Spark did not: drum hits written `hate` instead of `<hat>e` (0% on the drum page, though its beats were right), bars wrapped in parentheses, `bar 2 (12/8)`. In the product, `score_write` rejects such text and the agent retries, at the cost of a step.
- On Chopin, Wonder took 39 s (Spark 142 s) and gave the pickup its own bar, but also wrote the 12/8's digits as a chord.

**Decision (below):** Spark 1.3 stays the model for everything, page reading included: same pitch accuracy at a quarter of the price. Wonder is worth measuring again once the agent checks its own writing against the detector (phase 2 of the plan), where its speed and steadier rhythm might pay for themselves on long pages.

## Options considered before the detector (superseded)

1. **Ship what works now.** Text sources, plus pictures whose music is chords, form, lyrics or rhythm: a chord chart, a lead sheet's chords and form, drum notation. Phases 1 and 3 of the plan, with phase 2 limited to these. No pitch reading from staves.
2. **Add a music recognition engine** for staff notation, on the server, with Spark reasoning over its output and the picture. Its output is MusicXML, which also needs a MusicXML importer (useful on its own). Candidates to evaluate with this harness:
   - Audiveris (Java, mature on clean scans);
   - oemer (Python, deep learning, aimed at phone photos);
   - homr (Python, transformer-based, photos).

   Their licences must be checked before choosing: some are AGPL, which affects running them as a service. This needs a server worker outside Next.js.
3. **Read pitches approximately and flag them:** write Spark's notes and mark every bar as unchecked for the musician to correct. Not recommended: about half the notes would be wrong.

## The agent reads a page (phase 2)

The product's tool loop, measured with `yarn eval:sheet-agent --confirm`: each fixture page is attached to a request on an empty score and read through the assistant as a musician would use it. The agent reads (`music_read_source`, which runs the detector and returns the heads bar by bar, spelled in the key signature, with the labelled page), sets up the score, writes a few bars at a time, runs `page_check`, and fixes what it lists. Spark 1.3 at low effort; one run each.

| Page | Pitch | Exact | Rhythm | Chords | Steps | Seconds |
| --- | --- | --- | --- | --- | --- | --- |
| dense | 97% | 97% | 100% | — | 14 | 313 |
| drums | 87% | 87% | 88% | — | 8 | 158 |
| ensemble | 95% | 95% | 100% | 0% | 18 | 367 |
| keys | 100% | 100% | 100% | — | 7 | 168 |
| leadsheet | 100% | 100% | 100% | 67% | 8 | 90 |
| long | 97% | 97% | 100% | — | 8 | 191 |
| short | 100% | 100% | 100% | — | 5 | 25 |
| slurs | 96% | 96% | 100% | — | 6 | 126 |
| stacks | 75% (56% in a first run) | 75% | 80% | — | 5 | 141 |
| ties | 88% | 77% | 70% | — | 7 | 204 |
| trombone | 100% | 100% | 100% | — | 5 | 46 |
| trumpet | 100% | 100% | 100% | — | 6 | 40 |
| voices | 83% | 83% | 82% | 100% | 14 | 423 |

- **Better than one-shot reading** on almost every page, and steadier: rhythm is 100% on 9 of 13 pages (one-shot: 73–100%), and the trumpet of `ensemble` is now graded right, copied with `pitches: "written"`. Drums went from 52% to 87%.
- **Weak spots:** voices merged into chords (`stacks`), the lower voice's rhythm (`voices`), and chord symbols on two pages.
- **Cost and time:** 135k–570k input tokens per page, mostly served from the prompt cache (images are resent on every step), 2–35k output tokens; 25 s to 7 minutes.

Changes the measurements led to, each after looking at the agent's trace:

| Seen | Change |
| --- | --- |
| A line that didn't fill its bar was rejected with "Each 12/8 measure must contain exactly 6 quarter-note beats", without saying which; the agent wrote bar by bar to find it | `score_write` names every line that doesn't fill its bar, with its count: "bar 3 piano has 5.5 of 6 (12/8)" |
| The agent strayed from the heads given as one line per staff | The heads come page bar by page bar, each system's staves together, spelled in the key signature (`keySignature` in the reading), so they read like the score text it writes |
| It replied "done" after a check listing 12 differing bars | The check's result and the prompt say to rewrite each listed bar and check again |
| A dotted note it wrote from an off-beat is spelled as two tied notes; the check counted the second as a head the page lacks | Notes tied over from earlier in the bar are not counted as extra |
| On a page of two one-staff systems it gave one clef; the detector refused the page and the agent read it by eye (15%) | One system's clefs stand for every system with the same staves (88%) |

**A real page is harder.** On the Chopin nocturne (ornaments, runs, a left hand of broken chords) the agent follows the right hand's heads closely, but at low effort it still rewrites the left hand's figure in its own simpler voicing, even when `page_check` lists the bars, and runs take 4–5 minutes and 14–22 steps. Runs vary a lot; this page is the one to watch as the loop improves.

**A small scan: "Gotas de lluvia", a B♭ trumpet part** (768 px wide, about 8 px per staff space, 10 systems, multi-bar rests, about 70 bars). In the app it took 3.9 minutes and 18 steps, 10 of them rejected calls. The trace showed:

| Seen | Change |
| --- | --- |
| Only 2 of a system's 4 bars found: the scan's thin barlines blur to grey once enlarged, and a 1-pixel break becomes 3–4 | Barlines use the staff lines' lighter threshold, and may break for up to 0.15 staff space |
| Beam ends labelled as heads ("C5" on the beams) | A filled head must be at least 0.65 staff space tall through its centre; a beam is about half |
| The agent wrote past bar 32 four times; the error read "measures — Too big: expected array to have <=32 items" | `score_write` says "A score holds at most 32 bars: bar 40 is past its end. Write only up to bar 32." |
| `page_check` counted the page's bars past the score's end as misses | Only bars within the score are compared |

After the changes: 11 steps, one rejected call, and the fixtures unchanged (same recall, one less false head on `dense`). Still open on this page: high heads above ledger lines in its first system go undetected, and the model read the key signature as one flat where the page has two.
