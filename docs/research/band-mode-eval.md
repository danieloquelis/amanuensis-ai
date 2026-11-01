# Band Mode against the single agent

Run on 2 November 2026 with `yarn eval:band --confirm` (12 runs, about US$1.74). Model: `META_AI_MODEL` from `.env.local` (`muse-spark-1.3-contributor`), Responses API, thinking "medium" for the chat agent; the band's musicians think one level lower ("low"), as the app sets them up.

## Question

Does Band Mode (one musician agent per part, rehearsing in order under the chat's agent as bandleader; see the [band agents plan](../planning/band-agents-plan.md)) write better band arrangements than the same chat agent with Band Mode off? And what does it cost in time and money?

## Method

`scripts/band-eval.mts`, with the songs in `scripts/lib/band-songs.mts` and the measures in `scripts/lib/band-measures.mts`.

- **Songs:** the swing lead sheet in F (`tests/fixtures/engraving/leadsheet.json`: melody on a piano part, slash and repeat bars, 7 bars); an 8-bar waltz in D minor built with score operations (Dm Gm A7 Dm, twice); the example song "First light" with chords added (C | Dm7 | Em7 G7 | C).
- **Request:** "Arrange this for my band: drums, bass, piano and trumpet." plus a style: "Swing feel.", "A gentle jazz waltz, in three.", "Pop ballad feel."
- **Arms:** the same request through `runAssistant`. Band: `band: { on: true, members }` with plain members (drums, bass, piano, trumpet, no names) and the musicians' model. Single: no `band`. Same model, thinking and wording.
- **Runs:** 3 songs × 2 arms × 2 runs, 2 at a time.
- **Measured in code** on the resulting score (`executeAll(createSession(score), result.commands)`), sounding pitch:
  - **Parts filled:** requested parts present (of 4), and part-bars with notes (of 4 × bars).
  - **Out of range:** notes outside the instrument's range (`isPlayable`).
  - **Crowded:** melody bars where the piano's comping (any piano or guitar line not playing the melody) has its top note above the melody's lowest note. The melody is any line that plays the song's notes in order as single notes, so a doubling counts too.
  - **Bass roots:** bars whose bass starts on the root of the chord sounding on beat 1 (or its slash bass).
  - **Drum bars:** bars with hits in both the hands and the feet voice.
  - **Melody kept:** melody bars whose pitches (octave aside) are still played in order on some line.
  - **Cost:** the chat agent's steps plus the musicians' model calls, refused tool calls, wall-clock seconds, and dollars from the tokens of every model call, the musicians' included (Muse Spark prices from `api-compare.mts`).
- Each run's score is saved as score text, with the reply, in `test-results/band-eval/` (as JSON too, so `yarn eval:band --regrade` measures again for free).

## Results

Each cell shows run 1 · run 2.

| Song | Arm | Parts filled | Out of range | Crowded | Bass roots | Drum bars | Melody kept | Steps + musician calls | Tool errors | Seconds | $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lead sheet | single | 4/4, 25/28 · 4/4, 25/28 | 0 · 0 | 2/4 · 4/4 | 7/7 · 7/7 | 7/7 · 7/7 | 4/4 · 4/4 | 8+0 · 7+0 | 1 · 0 | 93 · 80 | 0.11 · 0.10 |
| lead sheet | band | 4/4, 25/28 · 4/4, 28/28 | 0 · 0 | 1/4 · 1/4 | 7/7 · 7/7 | 7/7 · 7/7 | 4/4 · 4/4 | 5+14 · 6+12 | 2 · 0 | 81 · 82 | 0.20 · 0.20 |
| waltz | single | 4/4, 32/32 · 4/4, 32/32 | 0 · 0 | 1/8 · 0/8 | 8/8 · 7/8 | 8/8 · 8/8 | 8/8 · 8/8 | 15+0 · 8+0 | 1 · 0 | 70 · 48 | 0.13 · 0.08 |
| waltz | band | 4/4, 32/32 · 4/4, 32/32 | 0 · 0 | 0/8 · 0/8 | 8/8 · 8/8 | 8/8 · 8/8 | 8/8 · 8/8 | 5+14 · 5+15 | 0 · 1 | 66 · 86 | 0.19 · 0.20 |
| example | single | 4/4, 16/16 · 4/4, 16/16 | 0 · 0 | 4/4 · 4/4 | 4/4 · 4/4 | 4/4 · 4/4 | 4/4 · 4/4 | 9+0 · 9+0 | 0 · 0 | 37 · 31 | 0.07 · 0.07 |
| example | band | 4/4, 16/16 · 4/4, 16/16 | 0 · 0 | 0/4 · 0/4 | 4/4 · 4/4 | 4/4 · 4/4 | 4/4 · 4/4 | 5+14 · 5+13 | 2 · 1 | 96 · 93 | 0.20 · 0.17 |

Totals over the 6 runs of each arm:

| | Single | Band |
| --- | --- | --- |
| Crowded bars | 15 of 32 (in 5 of 6 runs) | 2 of 32 (both are the lead sheet's last chord) |
| Bass on the root | 45 of 46 | 46 of 46 |
| Out of range, empty parts, drums missing a voice, melody lost | none | none |
| Seconds per arrangement (mean) | 60 (31–93) | 84 (66–96) |
| Dollars per arrangement (mean) | 0.09 | 0.19 |

The 25/28 on the lead sheet is the trumpet resting in bars 3, 4 and 6, where the lead sheet has no melody. That is a reasonable choice, so "parts filled" does not separate the arms here.

## Verdict

On what we measured, Band Mode is better on one thing and equal on the rest. Its pianist kept the comping under the melody: 2 crowded bars of 32, against 15 of 32 for the single agent, whose piano voicings sat on or above the tune in 5 of its 6 runs. Both arms wrote all four parts in every bar, kept the melody, stayed in range and put the bass on the root. Reading the scores, the band also left the song as it was, where the single agent sometimes changed it. It costs about twice as much (US$0.19 against 0.09 per arrangement) and is about 40% slower on average (84 s against 60 s). On a short song it is roughly three times slower (95 s against 34 s), because four musicians each take three or four calls, whatever the song's length. With 2 runs per song and arm, this is a direction, not a proof. The crowding gap is consistent: every single-agent run on the lead sheet and the example crowded, and no band run did outside one final chord. Two points limit how much we can say. First, the measures are proxies, and the owner has not yet listened. Second, the band's register advantage may come from the pianist's craft card ("between about C3 and C5, below the melody") rather than from having several agents. A single-agent prompt line saying the same would be a cheaper fix, and we have not tested it. Per the plan, Band Mode is not yet clearly better on quality, so it should stay an opt-in setting rather than the default for arrangements until a blind listen agrees.

## What the score texts show

- **The band keeps the song; the single agent sometimes changes it.** The band's scope guard leaves chords, marks, key and tempo to the bandleader, and every band run kept the original melody staff, the lead sheet's "swing feel" text and its slash and repeat bars. The single agent moved the melody off the piano by rewriting it, which lost the "swing feel" text in both lead-sheet runs. In one waltz run it changed the tempo from 132 to 90 without being asked. In another it voiced Gm as `<B3 D4 G4>` (G major) in bars 2 and 6, so in bar 6 the piano's B♮3 clashes with the trumpet's B♭4.
- **Comping register.** The band's pianist comps on a left-hand staff between about B2 and F4, under the tune (e.g. waltz bar 1: `rq <F3 A3 D4>h` under `A4 D5 F5`). The single agent's piano plays block chords in the melody's octave. In the example, `<E4 G4 B4 D5>h <G4 B4 D5 F5>h` sits over a trumpet melody of `G4 E4 D4 E4`. On the lead sheet, `<F4 A4 C5 E5>` voicings sit over `A4 C5 F5`.
- **But the band doubles the tune in unison.** Band Mode keeps the piano's melody staff (`keepMelody` in `band-tools.ts`), and the trumpet was then briefed to carry the melody. In 5 of 6 band runs the trumpet plays the piano's melody note for note, in the same octave, wherever the song has a melody (in the sixth, an octave higher). The single agent gives the tune to the trumpet alone and lets the piano only comp, which is the cleaner texture. The band was also livelier in places: a fill or a crash into a new section in 4 of 6 band runs (e.g. tom fills in lead sheet bars 4 and 6). Every single-agent run kept the same groove in every bar, apart from a crash on the first or last bar.

Also seen: both single-agent lead-sheet runs ended with unfinished reasoning as the reply (e.g. "All parts are written — I'll verify everything reads correctly. scatterplot? No. Verification. …"). The model wrote text with no tool call, which ends the turn, so the check it announced never happened. Every band reply was a clean summary. This is in the shared turn loop, not in Band Mode.

## What to change in Band Mode

- **Decide who has the tune.** When the bandleader gives the melody to a lead instrument (here the trumpet), the pianist should not also keep it at full voice. Either `keepMelody` should apply only when no other part is briefed to carry the melody, or the bandleader's brief should say which one plays it and the other rests or plays a countermelody. This is the one place where the single agent's arrangement was better.
- **Count the musicians in the turn's cost.** `runMusician` does not add its model calls' `usage` (or their time) to the turn's `usage` and `thinkingMs`. So `result.usage` and the server's turn log (`turn-log.ts`) leave out 12–15 of a band turn's 17–20 model calls. This evaluation meters both models itself. This is reported, not fixed.
- **First writes refused.** A musician's tool call was refused in 4 of 6 band runs (the drummer's first `score_write` in 3 of them), and each refusal costs an extra call. The refusal messages were not recorded in this run (the script now saves them in `errors`). Read them on the next run, and fix the drummer's brief or the craft card if they share a cause.
- **Cost on short songs.** With three or four calls per musician, whatever the length, Band Mode on a 4-bar song is three times slower than the single agent. `putGroove` without a model for the drums, as the plan suggests, would remove a quarter of that.

## Limits

12 runs on three short songs, one wording per song, no listening. The measures check register, roots, range and completeness. They do not check whether the voicings fit the chords (the single agent's G-major chord over Gm was found by reading, not by a measure), whether the rhythm swings, or whether the parts sound good together. The register gap is the only measured difference, and it could come from a prompt line rather than from the band itself. Test that by giving the single agent the pianist's craft line before deciding that the band is needed for it.
