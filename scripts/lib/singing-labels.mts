// The singing model's dataset (datasets/singing-voice, see its README): takes labeled by what
// they hold, for fitting and checking the model (yarn fit:singing). Labeled from the words and by ear.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SINGING_DATASET = "datasets/singing-voice";
/** One take of the dataset: its recording and the words Muse Voice Transcribe heard in it. */
export const datasetTake = (id: string) => join(SINGING_DATASET, "takes", id);

const labels: { allSung: string[]; talkThenSinging: string[]; allSpoken: string[] } = JSON.parse(
  readFileSync(join(SINGING_DATASET, "labels.json"), "utf8"),
);

/** Nothing but singing (or syllables sung): every moment of voice is singing. */
export const ALL_SUNG = labels.allSung;
/** Talk, then singing. Only the moments the words account for are labeled: sung where the words are syllables. */
export const TALK_THEN_SINGING = labels.talkThenSinging;
/** Talk only: no moment of voice is singing. */
export const ALL_SPOKEN = labels.allSpoken;

/**
 * Kept as unit-test fixtures (pitch and words, no audio): the syllable takes that used to be
 * missed, talk running into singing, and talk with the traps (slow talk, stutters, "no, no, no").
 */
export const FIXTURE = [
  "2026-10-29T15-04-54",
  "2026-10-29T15-05-22",
  "2026-10-29T15-05-38",
  "2026-10-29T15-06-44",
  "2026-10-29T15-05-59",
  "2026-10-28T19-50-50",
  "2026-10-28T21-12-38",
  "2026-10-29T13-06-05",
  "2026-10-29T13-22-41",
  "2026-10-29T13-21-12",
  "2026-10-29T13-20-09",
  "2026-10-29T01-14-49",
  "2026-10-28T20-37-49",
  "2026-10-28T20-50-53",
];
