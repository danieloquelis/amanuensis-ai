import { MEASURE_WIDTH } from "@/modules/score";

/** Keyboard nudge for a bar divider, in scene units. */
export const MEASURE_WIDTH_STEP = 8;

export const clampMeasureWidth = (width: number) => Math.max(MEASURE_WIDTH.min, Math.min(MEASURE_WIDTH.max, width));
