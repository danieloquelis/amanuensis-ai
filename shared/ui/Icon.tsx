import type { CSSProperties } from "react";

const paths = {
  play: "m9 5 11 7-11 7Z", stop: "M6 6h12v12H6z",
  undo: "M9 5 4 10l5 5M4 10h9a6 6 0 0 1 6 6v3",
  redo: "m15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6v3",
  plus: "M12 5v14M5 12h14", arrowUp: "m5 12 7-7 7 7M12 5v15", arrowDown: "m5 12 7 7 7-7M12 19V4",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5", upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
  music: "M9 18V5l11-2v12M9 9l11-2M9 18c0 4-7 4-7 1s7-4 7-1m11-3c0 4-7 4-7 1s7-4 7-1",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8",
  check: "m5 12 4 4L19 6", print: "M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v8H7z",
  note: "M9 18V4l10 3v5M9 18c0 4-7 4-7 1s7-4 7-1",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  close: "m6 6 12 12M6 18 18 6", chevron: "m9 5 7 7-7 7",
} as const;

export function Icon({ name, size = 18, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
