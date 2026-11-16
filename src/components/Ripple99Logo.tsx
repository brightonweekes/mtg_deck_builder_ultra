export interface Ripple99LogoProps {
  className?: string;
}

/**
 * Reusable Ripple99 brand mark featuring concentric ripple rings around a Commander diamond core.
 */
export function Ripple99Logo({ className = 'h-8 w-8' }: Ripple99LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      data-testid="ripple99-logo"
      className={`shrink-0 ${className}`.trim()}
    >
      <rect width="64" height="64" rx="14" fill="#0f172a" />
      <rect
        x="2.5"
        y="2.5"
        width="59"
        height="59"
        rx="12"
        stroke="#f59e0b"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <circle
        cx="32"
        cy="32"
        r="23"
        stroke="#f59e0b"
        strokeOpacity="0.28"
        strokeWidth="2"
        strokeDasharray="28 8 18 8"
      />
      <circle
        cx="32"
        cy="32"
        r="15.5"
        stroke="#fbbf24"
        strokeOpacity="0.58"
        strokeWidth="2"
      />
      <path
        d="M32 14L37.8 26.2L50 32L37.8 37.8L32 50L26.2 37.8L14 32L26.2 26.2Z"
        fill="#f59e0b"
      />
      <path
        d="M32 22.5L35.4 28.6L41.5 32L35.4 35.4L32 41.5L28.6 35.4L22.5 32L28.6 28.6Z"
        fill="#0f172a"
      />
      <circle cx="32" cy="32" r="3.2" fill="#fde68a" />
    </svg>
  );
}
