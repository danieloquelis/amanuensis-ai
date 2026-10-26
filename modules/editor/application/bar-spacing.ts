import { DEFAULT_MEASURE_WIDTH } from "@/modules/engraving";
import { MEASURE_WIDTH, type Measure } from "@/modules/score";

/** Keyboard nudge for a bar divider, in scene units. */
export const MEASURE_WIDTH_STEP = 8;

export const measureWidth = (measure: Measure) => measure.width ?? DEFAULT_MEASURE_WIDTH;

export const clampMeasureWidth = (width: number) => Math.max(MEASURE_WIDTH.min, Math.min(MEASURE_WIDTH.max, width));
