type IconProps = { size?: number };

const svg = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function MicIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function SendIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function StopIcon({ size = 14 }: IconProps) {
  return (
    <svg {...svg(size)} fill="currentColor" stroke="none">
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  );
}
