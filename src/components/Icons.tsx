const icon = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function TrashIcon() {
  return (
    <svg {...icon}>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9.2a1 1 0 0 0 1 .8h4.8a1 1 0 0 0 1-.8L12 4M6.5 6.5v5M9.5 6.5v5" />
    </svg>
  );
}

/** Points right; `open` turns it down (a row is expanded). */
export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg {...icon} style={{ transform: open ? 'rotate(90deg)' : undefined }}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

/** Scissors with the blades pointing right; `turn` rotates it in degrees (90 points them down). */
export function ScissorsIcon({ turn = 0 }: { turn?: number }) {
  return (
    <svg {...icon} width={18} height={18} style={{ transform: `rotate(${turn}deg)` }}>
      <circle cx="3.2" cy="4.4" r="1.7" />
      <circle cx="3.2" cy="11.6" r="1.7" />
      <path d="M4.6 5.4 14.5 10.8M4.6 10.6 14.5 5.2" />
    </svg>
  );
}
