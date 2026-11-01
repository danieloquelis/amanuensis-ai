import { bandSchema, type BandMember } from "../application/musicians";

const KEY = "amanuensis.band";

/** Band Mode as the musician set it up in this browser: on or off, and who is in their band. */
export type BandSetup = { on: boolean; members: BandMember[] };

/** A band to start from: the line-up most rehearsal bands share. */
export const STARTER_BAND: BandMember[] = [
  { instrument: "drums" },
  { instrument: "bass" },
  { instrument: "piano" },
  { instrument: "trumpet" },
];

export function loadBand(): BandSetup {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = bandSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success ? parsed.data : { on: false, members: [] };
  } catch {
    return { on: false, members: [] };
  }
}

export function saveBand(setup: BandSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    // Not kept: Band Mode starts off next time.
  }
}
