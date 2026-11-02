import { useId, useRef, useState } from "react";
import { placeMenu } from "@/shared/ui/floating-placement";
import surface from "@/shared/ui/surface.module.css";
import { Switch } from "@/shared/ui/Switch";
import styles from "./assistant.module.css";

/** The baton's cork handle: a short thick stroke at the baton's end. */
const HANDLE_WIDTH = 44;

/**
 * A conductor's baton with a note and a spark, in Phosphor's regular style (256 grid, 16-unit
 * rounded strokes): the bandleader directing the band. The note and spark fill when Band Mode is on.
 */
function BandIcon({ on }: { on: boolean }) {
  const fill = on ? "currentColor" : "none";
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M56 56L176 176" />
      <path d="M184 184L208 208" strokeWidth={HANDLE_WIDTH} />
      <circle cx="68" cy="204" r="22" fill={fill} />
      <path d="M90 204V140c14 4 24 12 28 26" />
      <path d="M188 36c4 22 12 30 34 34c-22 4-30 12-34 34c-4-22-12-30-34-34c22-4 30-12 34-34z" fill={fill} />
    </svg>
  );
}

/**
 * Band Mode in the compose bar: an icon (lit when on) that opens a small panel with a switch and
 * what Band Mode does. On, music several parts play goes to a band the assistant puts together
 * itself (one musician per part); small edits stay with the assistant.
 */
export function BandMenu({ on, onTurn }: { on: boolean; onTurn: (on: boolean) => void }) {
  const id = useId();
  const anchor = useRef({ left: 0, top: 0, bottom: 0 });
  const [position, setPosition] = useState<ReturnType<typeof placeMenu> | null>(null);
  const state = `Band Mode: ${on ? "on" : "off"}`;
  return (
    <>
      <button
        type="button"
        className={styles.bandButton}
        data-on={on}
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-label={state}
        title={state}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          anchor.current = { left: rect.left, top: rect.top, bottom: rect.bottom };
        }}
      >
        <BandIcon on={on} />
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        className={`${surface.panel} ${surface.popover} ${styles.bandPanel}`}
        style={position ?? undefined}
        onToggle={(e) => {
          if (e.newState !== "open") return;
          setPosition(
            placeMenu(anchor.current, e.currentTarget.offsetWidth, { width: innerWidth, height: innerHeight }),
          );
        }}
      >
        <label className={styles.bandSwitch}>
          <strong id={`${id}-title`}>Band Mode</strong>
          <Switch checked={on} onChange={onTurn} />
        </label>
        <p className={styles.bandAbout}>
          A band of AI musicians plays your music, one for each instrument, and they listen to each other. It sounds
          fuller, but takes a bit longer.
        </p>
      </div>
    </>
  );
}
