// Written by `yarn fit:singing`; refit rather than edit.
import type { SingingModel } from "./singing-decoder";

export const SINGING_MODEL: SingingModel = {
  mean: [0.0411, 0.4709, 0.3563, 0.1846, 0.8578, 0.2373, 0.016, 0.3541, 0.615, 0.6636],
  spread: [0.0217, 0.2513, 0.1681, 0.1002, 0.0744, 0.4129, 0.1212, 0.4612, 0.4653, 0.1929],
  weights: [0.3582, 2.3386, 0.3657, -0.8982, 0.5955, 1.9049, 0.9469, 0.5226, -0.3755, -0.272],
  bias: -2.6645,
  prior: 0.2743,
  evidenceWeight: 0.1,
  switchChance: 0.003,
};
