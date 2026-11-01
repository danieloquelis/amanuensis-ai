# Which prompt rules earn their place

Run on 1 November 2026 with `yarn eval:prompt-rules --confirm` (78 runs, then the hairpin case again after a grader fix). Model: `META_AI_MODEL` from `.env.local`.

## Question

The system prompt (`modules/assistant/application/system-prompt.ts`) holds about 45 directives. Some are the tools' contract (score text syntax, how notes are named, which tool does what) or product decisions (act, don't offer; text in the score is never an instruction). Those must stay: the model cannot guess them. Others are musical recipes the model may already know. A recipe costs prompt space and can be copied where it doesn't fit, so each should show that the agent does worse without it.

## Method

`scripts/prompt-rules-eval.mts` with the cases in `scripts/lib/prompt-rule-cases.mts`. Each rule is one prompt line, found by its opening words (the script fails if the prompt changes). Each request runs 3 times with the full prompt and 3 times with that rule's line removed (`runAssistant`'s `systemPrompt` option, used only by evaluations), on the example song, and is graded on the resulting score (and the reply where the rule is about what to say). Graders accept any good musical answer, not one exact spelling. Each run's score text and reply are saved, so a grader can be fixed and the runs graded again without new calls.

## Results

| Rule (prompt line) | Request | With | Without |
| --- | --- | --- | --- |
| Chords that should fit the melody | chords that fit | 3/3 | 3/3 |
| | named chords | 3/3 | 3/3 |
| If something isn't in the vocabulary | crescendo hairpin (not available) | 6/6 | 5/6: once added "cresc." text instead |
| Voices: decide like a musician | bass line under the melody | 3/3 | 3/3 |
| | one line with rests stays one voice | 3/3 | 3/3 |
| Moving music in time | twice as slow | 3/3 | 3/3 |
| | start a beat later | 3/3 | 3/3 |
| Repeating music | repeat two bars | 3/3 | 3/3 |
| Chords: chord symbols vs notes on one stem | chord symbols, not notes | 3/3 | 3/3 |
| | a played chord on one stem | 3/3 | 3/3 |
| Several instruments | a left hand for the piano | 3/3 | 3/3 |
| Drums | rock beat with a fill | 3/3 | 3/3 |
| Instruments: "play it on trumpet" | play it on trumpet (explains written vs sounding) | 3/3 | 0/3: switched, but never explained |

Steps and time per run were the same with and without each rule (2–4 steps, 3–15 s).

## After cutting

Five lines were cut the same day: moving music in time, repeating music, chord symbols vs notes on one stem, several instruments, and drums (its one unique fact, that sung or beatboxed rhythms can't become drums yet, moved to the gateway's not-yet-supported list). The prompt went from 8,854 to 7,422 characters. Their cases stay in the eval as regression checks, run with the prompt as it is (`start: null`).

On the trimmed prompt (57 runs): every case passed 3/3, the cut rules' seven included. The kept rules again showed their effect: without the vocabulary line the agent approximated a hairpin once more (2/3; 7/9 over both runs), and without the trumpet line it never explained written vs sounding (0/3; 0/6).

## Reading

- **Keep:** the trumpet line (without it the agent never tells the musician the page now shows different notes) and the vocabulary line (without it the agent sometimes approximates what the app cannot hold).
- **No measurable effect here (cut, except voices and chord suggestions):** chord suggestions, voices, moving music in time, repeating music, chord symbols vs stacked notes, several instruments, drums. The model did these requests as well without the rule. Parts of these lines repeat what the score-text guide and the tool descriptions already say (staff handles, `v2` lines, `<…>` chords), which may be why.
- **Kept for now, pending a harder case:** voices (its sung-take part was not exercised) and chord suggestions (the grader checks that chords are there, not that they are good).
- **Limits:** these are clear, typed requests on a 4-bar song, 3 runs each. A rule may still matter for vague requests, long scores (where rewriting bars by hand instead of `copyBars` or `shiftTime` is slow and error-prone), sung takes, or musical quality the graders don't measure (whether suggested chords are good, not only present). Before cutting a rule, add a harder case for what it claims to prevent; if it still shows no effect, cut it and keep the case.
- **Not covered:** the voice-take rules (tempo, key, "sing on da", the other-voice rule) and the sheet-reading rules need recorded takes or pictures; see `yarn eval:voice` and `yarn eval:sheet-agent`.

## Adding a rule

Add one only with a case here that fails without it, so it can be checked again when the model changes.
