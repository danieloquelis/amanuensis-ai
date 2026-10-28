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

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

/** The assistant's mark: a sparkle with a small companion star. */
export function SparkIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svg(size)} fill="currentColor" stroke="none">
      <path d="M10 3.5 11.8 8.2 16.5 10 11.8 11.8 10 16.5 8.2 11.8 3.5 10 8.2 8.2Z" />
      <path d="M17.5 13.5 18.4 15.6 20.5 16.5 18.4 17.4 17.5 19.5 16.6 17.4 14.5 16.5 16.6 15.6Z" />
    </svg>
  );
}

export function ChatIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
