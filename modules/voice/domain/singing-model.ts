// Written by `yarn fit:singing`; refit rather than edit.
import type { SingingModel } from "./singing-decoder";

export const SINGING_MODEL: SingingModel = {
  mean: [0.024, 0.5664, 0.3513, 0.2237, 0.9526, 0.2808, 0.0236, 0.3066, 0.4753, 0.5545],
  spread: [0.0144, 0.2355, 0.1665, 0.1385, 0.0244, 0.4376, 0.1489, 0.4477, 0.4805, 0.2291],
  weights: [0.0341, 2.2476, 0.4662, -1.1904, 0.1774, 2.1048, 1.1308, 0.6057, -0.3491, -0.1954],
  bias: -1.9553,
  prior: 0.3342,
  evidenceWeight: 0.5,
  switchChance: 0.003,
};
