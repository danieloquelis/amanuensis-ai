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

/** A bass guitar: an offset body, a long neck and the headstock, four strings down the neck. */
function Bass({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <path d="M92 132c-28-8-60 8-64 40s20 60 52 56 48-28 44-56" />
      <path d="M104 152l116-116M212 28l20 20" />
      <path d="M96 144l16 16M64 188h0" />
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

/** A violin-family body (upper and lower bouts, the waist), its neck and scroll, upright and widened. */
const STRING_BODY =
  "M128 96C100 96 88 108 92 128C94 138 104 142 104 152C104 162 88 170 88 192C88 216 106 228 128 228C150 228 168 216 168 192C168 170 152 162 152 152C152 142 162 138 164 128C168 108 156 96 128 96Z";

function StringBody({ endpin = false }: { endpin?: boolean }) {
  return (
    <g transform="translate(128 0) scale(1.3 1) translate(-128 0)">
      <path d={STRING_BODY} />
      <path d={endpin ? "M128 96V36M128 228v20" : "M128 96V36"} />
      <circle cx="128" cy="24" r="12" />
    </g>
  );
}

/** Tilted under the chin, with its bow across the strings. */
function Violin({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <g transform="rotate(45 128 136)">
        <StringBody />
      </g>
      <path d="M36 112l112 112" />
    </LineIcon>
  );
}

/** Tilted the other way, without the bow. */
function Viola({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <g transform="rotate(-45 128 136)">
        <StringBody />
      </g>
    </LineIcon>
  );
}

/** Upright on its endpin. */
function Cello({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <g transform="translate(0 -4)">
        <StringBody endpin />
      </g>
    </LineIcon>
  );
}

/** Upright and wider, with the sloping shoulders of a bass. */
function DoubleBass({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <path d="M128 88C104 88 100 116 84 132C70 148 100 156 100 164C100 172 64 178 64 206C64 232 98 240 128 240C158 240 192 232 192 206C192 178 156 172 156 164C156 156 186 148 172 132C156 116 152 88 128 88Z" />
      <path d="M128 88V36M128 240v12" />
      <circle cx="128" cy="24" r="12" />
    </LineIcon>
  );
}

/** A snare drum seen from the side, with two sticks crossed over it. */
function Drums({ size }: { size: number }) {
  return (
    <LineIcon size={size}>
      <ellipse cx="128" cy="128" rx="88" ry="28" />
      <path d="M40 128v56c0 15 39 28 88 28s88-13 88-28v-56" />
      <path d="M68 152v34M128 156v40M188 152v34" />
      <path d="M84 36l64 72M188 36l-64 72" />
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
    case "bass":
      return <Bass size={size} />;
    case "trombone":
      return <Trombone size={size} />;
    case "violin":
      return <Violin size={size} />;
    case "viola":
      return <Viola size={size} />;
    case "cello":
      return <Cello size={size} />;
    case "doublebass":
      return <DoubleBass size={size} />;
    case "drums":
      return <Drums size={size} />;
  }
}
