const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Largest unit first: the first one that fits whole is the one we say. */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", YEAR],
  ["month", MONTH],
  ["week", WEEK],
  ["day", DAY],
  ["hour", HOUR],
  ["minute", MINUTE],
];

/** The app's UI is in English, so the phrase is too, whatever the browser's locale. */
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** When a song was last saved, as a card says it: "Edited just now", "Edited 20 hours ago", "Edited yesterday". */
export function editedAgo(time: number, now: number): string {
  const elapsed = Math.max(0, now - time);
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return `Edited ${relative.format(-Math.floor(elapsed / size), unit)}`;
  }
  return "Edited just now";
}
