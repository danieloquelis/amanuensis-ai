import type { AnchorKind } from "../../hooks/use-indication-anchor";

export function AnchorSelect({
  anchor,
  hasSelection,
  measureIndex,
  onChange,
}: {
  anchor: AnchorKind;
  hasSelection: boolean;
  measureIndex: number;
  onChange: (anchor: AnchorKind) => void;
}) {
  return (
    <label>
      Anchor
      <select aria-label="Indication anchor" value={anchor} onChange={(e) => onChange(e.target.value as AnchorKind)}>
        <option value="note" disabled={!hasSelection}>
          Selected note / rest
        </option>
        <option value="bar">Start of bar {measureIndex + 1}</option>
      </select>
    </label>
  );
}
