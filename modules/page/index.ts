// Public API of the page module (framework-free): reading printed music from a picture. The
// image adapter (sharp) lives in "./server".
export {
  readPage,
  type PageDetection,
  type PageImages,
  type PageLabel,
  type PageReading,
} from "./application/read-page";
export { findBarlines } from "./domain/barlines";
export { compareHeads, type HeadDifference } from "./domain/compare";
export { findHeads, type Head } from "./domain/heads";
export {
  barColumns,
  barsText,
  columnText,
  headName,
  inKey,
  PITCHED_CLEFS,
  staffItems,
  staffText,
  type StaffItem,
} from "./domain/listing";
export type { Gray } from "./domain/pixels";
export { findStaves, type Staff } from "./domain/staves";
