import { useId, useRef, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { InstrumentIcon } from "@/modules/editor/ui";
import { INSTRUMENT_IDS, INSTRUMENTS, type InstrumentId } from "@/modules/score";
import { IconButton } from "@/shared/ui/IconButton";
import surface from "@/shared/ui/surface.module.css";
import type { BandMember } from "../../application/musicians";
import styles from "./assistant.module.css";

/** The panel keeps this far (px) from its button and from the window's edges. */
const GAP = 8;
const EDGE_MARGIN = 12;
/** Icons shown on the button; the rest are counted in its label. */
const SHOWN = 4;
const MAX_MEMBERS = 8;

type BandMenuProps = {
  on: boolean;
  members: BandMember[];
  onTurn: (on: boolean) => void;
  onMembers: (members: BandMember[]) => void;
};

/**
 * Band Mode in the compose bar: a button showing the band (lit when on), and a panel to switch it
 * and say who plays: instrument, name and a note about each player. With it on, arrangements are
 * played by the band, one musician per part; small edits stay with the assistant.
 */
export function BandMenu({ on, members, onTurn, onMembers }: BandMenuProps) {
  const id = useId();
  const anchor = useRef({ left: 0, top: 0 });
  // Anchored by its bottom edge: turning the band on adds rows, and the panel grows upward.
  const [position, setPosition] = useState({ left: EDGE_MARGIN, bottom: EDGE_MARGIN });
  const change = (index: number, patch: Partial<BandMember>) =>
    onMembers(members.map((member, i) => (i === index ? { ...member, ...patch } : member)));
  return (
    <>
      <button
        type="button"
        className={styles.bandButton}
        data-on={on}
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-label={`Band Mode: ${on ? "on" : "off"}`}
        title={`Band Mode: ${on ? "on" : "off"}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { left: rect.left, top: rect.top };
        }}
      >
        <span className={styles.bandStack} aria-hidden="true">
          {(members.length ? members : [{ instrument: "drums" as const }]).slice(0, SHOWN).map((member, i) => (
            <span key={i}>
              <InstrumentIcon instrument={member.instrument} size={12} />
            </span>
          ))}
        </span>
        <span className={styles.bandLabel}>Band</span>
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Band Mode"
        className={`${surface.panel} ${surface.popover} ${styles.bandPanel}`}
        style={position}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          const { offsetWidth: width } = e.currentTarget;
          const { left, top } = anchor.current;
          setPosition({
            left: Math.max(EDGE_MARGIN, Math.min(left, innerWidth - width - EDGE_MARGIN)),
            bottom: innerHeight - top + GAP,
          });
        }}
      >
        <label className={styles.bandSwitch}>
          <span>
            <strong>Band Mode</strong>
            <span>Your band plays arrangements: one musician per part, listening to each other.</span>
          </span>
          <input type="checkbox" role="switch" checked={on} onChange={(e) => onTurn(e.target.checked)} />
        </label>
        {on && (
          <>
            <ul className={styles.bandMembers} aria-label="Your band">
              {members.map((member, i) => (
                <li key={i}>
                  <span className={styles.bandIcon} aria-hidden="true">
                    <InstrumentIcon instrument={member.instrument} size={16} />
                  </span>
                  <select
                    aria-label="Instrument"
                    value={member.instrument}
                    onChange={(e) => change(i, { instrument: e.target.value as InstrumentId })}
                  >
                    {INSTRUMENT_IDS.map((instrument) => (
                      <option key={instrument} value={instrument}>
                        {INSTRUMENTS[instrument].name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Player's name"
                    placeholder="Name"
                    maxLength={40}
                    value={member.name ?? ""}
                    onChange={(e) => change(i, { name: e.target.value || undefined })}
                  />
                  <input
                    aria-label="About this player"
                    placeholder="e.g. reads treble clef"
                    maxLength={160}
                    value={member.note ?? ""}
                    onChange={(e) => change(i, { note: e.target.value || undefined })}
                  />
                  <IconButton
                    label={`Remove ${member.name ?? INSTRUMENTS[member.instrument].name}`}
                    className={styles.memoryForget}
                    onClick={() => onMembers(members.filter((_, k) => k !== i))}
                  >
                    <X size={12} weight="bold" />
                  </IconButton>
                </li>
              ))}
            </ul>
            {members.length < MAX_MEMBERS && (
              <button
                type="button"
                className={styles.bandAdd}
                onClick={() => onMembers([...members, { instrument: "guitar" }])}
              >
                <Plus size={12} weight="bold" /> Add a musician
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
