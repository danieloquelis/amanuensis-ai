/** How the notes written for a bar differ from the heads found there on the page, by name. */
export type HeadDifference = { missing: string[]; extra: string[] };

/**
 * Heads on the page that nothing written matches (`missing`), and written notes with no head
 * there (`extra`), each counted: two G5s on the page and one written leave one G5 missing.
 */
export function compareHeads(page: string[], written: string[]): HeadDifference {
  const left = [...written];
  const missing: string[] = [];
  for (const name of page) {
    const index = left.indexOf(name);
    if (index === -1) missing.push(name);
    else left.splice(index, 1);
  }
  return { missing, extra: left };
}
