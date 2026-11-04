# Singing-voice dataset

This is all the data the app's singing model was trained on, and nothing else. The singing model decides, every 10 ms of a recording, whether the musician is talking or singing. `yarn fit:singing` reads only this folder and makes no API calls, so anyone can refit the model and get the exact weights in [`modules/voice/domain/singing-model.ts`](../../modules/voice/domain/singing-model.ts).

The model is plain maths written for this project: a logistic regression and a two-state hidden Markov model. No pretrained model is involved at any step. Pitch comes from YIN, a classic algorithm, implemented in [`pitch-tracker.ts`](../../modules/voice/domain/pitch-tracker.ts). The spectrum comes from our own FFT in [`spectrum.ts`](../../modules/voice/domain/spectrum.ts).

## What is in it

56 recordings made by the project's author with the app during the hackathon (28–29 October 2026), in English and Spanish:

| Group | Takes | Audio | What every moment of voice is |
| --- | ---: | ---: | --- |
| Singing only | 8 | 0.9 min | singing, or sung syllables (“ta ta ta”) |
| Talk then singing | 19 | 3.1 min | talk, then singing; labelled only where the words make it certain (see below) |
| Talk only | 29 | 4.4 min | talk |

Files:

- `labels.json`: which take is in which group (`allSung`, `talkThenSinging`, `allSpoken`).
- `takes/<id>/take.wav`: the recording as the app received it: 16 kHz, mono, 16-bit PCM.
- `takes/<id>/words.json`: what Muse Voice Transcribe heard in it, as `{ start, end, text }` turns in seconds.
- `mix-words/<hash>.json`: what Muse Voice Transcribe heard in each of the 40 mixed takes described below. The name is the start of the SHA-256 of the mix's WAV bytes, which is how `fit:singing` finds it.

## How the model is trained

Run `yarn fit:singing`. The code is in [`scripts/fit-singing-model.mts`](../../scripts/fit-singing-model.mts) and [`scripts/lib/`](../../scripts/lib/) (`singing-fit`, `singing-mixes`, `singing-labels`).

1. **Labelled frames.** A real take rarely says exactly where talk ends and singing starts, so most of the training data is built:
   - 40 mixed takes are made by joining pieces of the talk-only and singing-only takes: talk, 2 s of singing, talk, 5 s of singing, talk. The gaps between pieces range from none to 0.8 s. The mixes come from a fixed random seed, so they are the same on every run. Because each piece's source is known, so is the right label of every frame.
   - In the 19 talk-then-singing takes, a frame is labelled only when the words make it certain. Frames under sung syllables (“ta”, “da”) are singing. Frames that the other words need, even at the fastest speaking rate, are talk. Everything else is left unlabelled.
2. **Ten measures per 10 ms frame.**
   - From the FFT: harmonicity, spectral flux and syllable rhythm.
   - From YIN: pitch clarity, the pitch slide from the previous frame, and the share of the window that has voice.
   - From Muse Voice Transcribe's word timings: no words here at a slow, typical and fast speaking rate, and whether the word here is a sung syllable.

   Each measure is averaged over the quarter second around the frame. See [`singing-evidence.ts`](../../modules/voice/domain/singing-evidence.ts).
3. **Logistic regression.** The measures are standardised (mean 0, spread 1). The weights and bias are found by full-batch gradient descent on the log-loss: 400 steps, learning rate 0.5, L2 penalty 0.001, using every third labelled frame (neighbouring frames carry nearly the same evidence). The result is the probability that a frame is singing.
4. **Hidden Markov model.** A two-state model (talk, singing) reads the whole take with Viterbi decoding. Two settings are chosen by grid search over 5 × 5 values: how strongly a frame's evidence counts, and how costly a switch is. The search scores each setting on the mixes it was not fitted on, and on the 56 whole takes. Reading talk as singing costs three times as much as a miss.

## How well it does

Measured by cross-validation. The mixes are split into two halves that share no recording. Each half is read by a model fitted without it.

| | Half A | Half B |
| --- | ---: | ---: |
| Voice frames labelled right | 93.2% | 98.1% |
| Talk/singing switches placed within 0.1 s | 73% | 76% |
| Talk/singing switches placed within 0.25 s | 85% | 86% |
| Sung parts missed | 7 / 80 | 3 / 80 |

Read as whole recordings, 55 of the 56 takes come out right: the take has singing if and only if it should. The one miss is talk-only take `2026-10-29T13-20-09`, in which 2.5 s of “Okay, ahora ponlo una octava arriba” is read as singing.

## Terms

The recordings are the author's own voice, published here so the training can be checked. They fall under the same terms as the rest of the repository (see [Licenses](../../README.md#licenses)). The `words.json` and `mix-words` files are output of Muse Voice Transcribe (Meta AI API terms).
