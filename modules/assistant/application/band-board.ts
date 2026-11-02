import type { ProgressListener } from "./assistant-types";
import type { MusicianJob } from "./musician-brief";

/** Who speaks for the band: its notes reach the musicians like a bandmate's. */
export const BANDLEADER = "Bandleader";
const EVERYONE = new Set(["band", "everyone", "all"]);

/** A note passed in the band this turn, for the turn's result and the chat. */
export type BandNote = { from: string; to: string; note: string };

/**
 * The band's lineup and the notes its members pass: each note waits in its recipient's inbox
 * until they next play, and is shown as it is said.
 */
export function createBandBoard(onProgress: ProgressListener) {
  const lineup: MusicianJob[] = [];
  const inbox = new Map<string, string[]>();
  const said: BandNote[] = [];

  const named = (name: string) => lineup.find((job) => job.name.toLowerCase() === name.trim().toLowerCase());

  /** Delivers a note; returns why it could not be, or null. */
  const say = (from: string, to: string, note: string): string | null => {
    const everyone = EVERYONE.has(to.trim().toLowerCase());
    const recipient = everyone ? null : named(to);
    if (!everyone && !recipient) {
      return `There is no bandmate called "${to}". The band: ${lineup.map((job) => job.name).join(", ")}.`;
    }
    if (recipient?.name === from) return "That is you: say it to a bandmate.";
    const recipients = everyone ? lineup.filter((job) => job.name !== from) : [recipient!];
    for (const job of recipients) inbox.set(job.name, [...(inbox.get(job.name) ?? []), `${from}: ${note}`]);
    const shown = { from, to: everyone ? "band" : recipient!.name, note };
    said.push(shown);
    onProgress({ stage: "band_note", ...shown });
    return null;
  };

  return {
    lineup: () => lineup,
    /** Seats a musician, or gives a part already seated its new brief. */
    seat(job: MusicianJob) {
      const at = lineup.findIndex((seated) => seated.part === job.part);
      if (at >= 0) lineup[at] = job;
      else lineup.push(job);
    },
    say,
    /** The notes waiting for a musician, which it reads now. */
    take(name: string): string[] {
      const notes = inbox.get(name) ?? [];
      inbox.delete(name);
      return notes;
    },
    said: () => said,
    /** Each part's musician by the part's handle, for naming them in what the band hears. */
    names: () => new Map(lineup.map((job) => [job.part, job.name])),
  };
}

export type BandBoard = ReturnType<typeof createBandBoard>;
