import { useCallback, useState } from "react";
import type { SheetItem } from "../../application/notation-edits";

/**
 * What is selected on the sheet: a note or rest, a whole bar, or another item (chord, text,
 * mark…). Selecting one kind clears the others.
 */
export function useSheetSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SheetItem | null>(null);

  const select = useCallback((id: string | null) => {
    setSelectedBarId(null);
    setSelectedItem(null);
    setSelectedId(id);
  }, []);

  const selectBar = useCallback((measureId: string | null) => {
    setSelectedId(null);
    setSelectedItem(null);
    setSelectedBarId(measureId);
  }, []);

  const selectItem = useCallback((item: SheetItem | null) => {
    setSelectedId(null);
    setSelectedBarId(null);
    setSelectedItem(item);
  }, []);

  const clear = useCallback(() => select(null), [select]);

  return { selectedId, setSelectedId, selectedBarId, selectedItem, select, selectBar, selectItem, clear };
}
