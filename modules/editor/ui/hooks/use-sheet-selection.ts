import { useCallback, useState } from "react";
import type { Score } from "@/modules/score";
import type { SheetItem } from "../../application/notation-edits";
import {
  rangeOfRefs,
  refExists,
  sameRef,
  selectionName,
  toggleRef,
  type PickMode,
  type SheetRef,
} from "../../application/sheet-selection";

/**
 * What is picked on the sheet: notes or rests, bars, and other items (chord, text, mark…), in
 * the order they were picked. The last pick is the primary one that keyboard editing and the
 * toolbars act on; a plain click replaces everything with one pick. `score` is the rendered score
 * (picks an edit removed drop out); `latestScore` reads the newest one for ranges.
 */
export function useSheetSelection(score: Score, latestScore: () => Score) {
  const [stored, setPicked] = useState<SheetRef[]>([]);
  const picked = stored.filter((ref) => refExists(score, ref));
  const primary = picked.at(-1) ?? null;
  const selectedId = primary?.kind === "event" ? primary.id : null;
  const selectedBarId = primary?.kind === "bar" ? primary.id : null;
  const selectedItem: SheetItem | null = primary && primary.kind !== "event" && primary.kind !== "bar" ? primary : null;

  const select = useCallback((id: string | null) => setPicked(id ? [{ kind: "event", id }] : []), []);
  const selectBar = useCallback(
    (measureId: string | null) => setPicked(measureId ? [{ kind: "bar", id: measureId }] : []),
    [],
  );
  const selectItem = useCallback((item: SheetItem | null) => setPicked(item ? [item] : []), []);
  const clear = useCallback(() => setPicked([]), []);

  /** Moves the primary note (an edit replaced it), keeping the rest of the selection. */
  const setSelectedId = useCallback((update: (id: string | null) => string | null) => {
    setPicked((refs) => {
      const last = refs.at(-1);
      if (last?.kind !== "event") return refs;
      const next = update(last.id);
      if (next === last.id) return refs;
      return [...refs.slice(0, -1), ...(next ? [{ kind: "event" as const, id: next }] : [])];
    });
  }, []);

  /** Shift-click (range from the first pick) or ⌘/Ctrl-click (add or remove one item). */
  const pick = useCallback(
    (ref: SheetRef, mode: PickMode) =>
      setPicked((refs) => (mode === "toggle" ? toggleRef(refs, ref) : rangeOfRefs(latestScore(), refs[0], ref))),
    [latestScore],
  );

  /** A note getting focus is selected, unless it is already part of a multiple selection. */
  const focusEvent = useCallback((id: string) => {
    setPicked((refs) => (refs.some((r) => sameRef(r, { kind: "event", id })) ? refs : [{ kind: "event", id }]));
  }, []);

  return {
    picked,
    /** Short name of the whole selection ("Bars 3–6"), or null when nothing is picked. */
    pickedName: selectionName(score, picked),
    selectedId,
    setSelectedId,
    selectedBarId,
    selectedItem,
    select,
    selectBar,
    selectItem,
    clear,
    pick,
    focusEvent,
  };
}
