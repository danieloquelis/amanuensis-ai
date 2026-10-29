import { Guitar, PianoKeys } from "@phosphor-icons/react";
import type { InstrumentId } from "@/modules/score";
import { LineIcon } from "./LineIcon";

/** Mouthpiece, lead pipe and a loop under three valves, opening into the bell. */
function Trumpet({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <path d="M24 120v40M24 140h152M64 140v52h112v-52" />
      <path d="M92 140V84M120 140V84M148 140V84M80 72h24M108 72h24M136 72h24" />
      <path d="M176 140l56-52v104z" />
    </LineIcon>
  );
}

/** A long tube held to the side, with its embouchure hole and keys. */
function Flute({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <g transform="rotate(-35 128 128)">
        <rect x="16" y="112" width="224" height="32" rx="16" />
        <circle cx="56" cy="128" r="4" fill="currentColor" />
        <circle cx="128" cy="128" r="4" fill="currentColor" />
        <circle cx="156" cy="128" r="4" fill="currentColor" />
        <circle cx="184" cy="128" r="4" fill="currentColor" />
      </g>
    </LineIcon>
  );
}

/** The bell section over the U-shaped slide. */
function Trombone({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <path d="M24 52l72 44v24l-72 44z" />
      <path d="M96 108h104a28 28 0 0 1 0 56H64a20 20 0 0 0 0 40h168" />
      <path d="M144 108v56" />
    </LineIcon>
  );
}

/** The icon of an instrument, at the toolbar's icon size. */
export function InstrumentIcon({ instrument, size }: { instrument: InstrumentId; size: number }) {
  switch (instrument) {
    case "piano":
      return <PianoKeys size={size} />;
    case "guitar":
      return <Guitar size={size} />;
    case "trumpet":
      return <Trumpet size={size} />;
    case "flute":
      return <Flute size={size} />;
    case "trombone":
      return <Trombone size={size} />;
  }
}
