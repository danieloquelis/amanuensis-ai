// The product's notehead detector (modules/page) on a picture, for the evaluation scripts.
import { findHeads, findStaves, type Head, type Staff } from "@/modules/page";
import { createPageImages } from "@/modules/page/server";

export type { Head, Staff };

/** Every notehead on the page, filled or hollow, with its staff and position. */
export async function detectHeads(
  image: Buffer,
): Promise<{ staves: Staff[]; heads: Head[]; width: number; height: number }> {
  const gray = await createPageImages().gray(image, 1);
  const staves = findStaves(gray);
  return { staves, heads: findHeads(gray, staves), width: gray.width, height: gray.height };
}
