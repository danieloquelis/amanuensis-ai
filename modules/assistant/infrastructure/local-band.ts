import { bandSchema } from "../application/musicians";

const KEY = "amanuensis.band";

/** Whether Band Mode is on in this browser; off when nothing was kept or storage is blocked. */
export function loadBandMode(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = bandSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success && parsed.data.on;
  } catch {
    return false;
  }
}

export function saveBandMode(on: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on }));
  } catch {
    // Not kept: Band Mode starts off next time.
  }
}
