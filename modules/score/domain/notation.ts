export const DYNAMICS = ["pp", "p", "mp", "mf", "f", "ff"] as const;
export type Dynamic = (typeof DYNAMICS)[number];

export const ARTICULATIONS = ["staccato", "accent", "tenuto", "fermata"] as const;
export type Articulation = (typeof ARTICULATIONS)[number];

export const REPEAT_PASSES = { min: 2, max: 4 } as const;
