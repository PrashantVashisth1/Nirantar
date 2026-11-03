/**
 * Simple line illustrations (plan §3.1): ink and pine only, the same stroke
 * weight as the icons. Decorative, so hidden from screen readers.
 */

/** A prescription sheet with a pill strip beside it (empty Home). */
export function PrescriptionIllustration({ className = 'h-32 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" className={className} aria-hidden>
      <rect
        x="40"
        y="14"
        width="86"
        height="112"
        rx="8"
        fill="#FFFFFF"
        stroke="#1A2421"
        strokeWidth="2"
      />
      {/* ℞: an R with a crossed leg */}
      <path
        d="M56 62V36h9a7 7 0 0 1 0 14h-9M64 50l14 16M78 52L66 66"
        stroke="#0F5C4A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M56 84h54M56 96h44M56 108h30"
        stroke="#CBC7BA"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g transform="rotate(-18 150 86)">
        <rect
          x="118"
          y="62"
          width="64"
          height="46"
          rx="8"
          fill="#E6F0EB"
          stroke="#0F5C4A"
          strokeWidth="2"
        />
        <circle cx="136" cy="78" r="6" stroke="#0F5C4A" strokeWidth="2" />
        <circle cx="164" cy="78" r="6" stroke="#0F5C4A" strokeWidth="2" />
        <circle cx="136" cy="94" r="6" stroke="#0F5C4A" strokeWidth="2" />
        <circle cx="164" cy="94" r="6" fill="#0F5C4A" />
      </g>
    </svg>
  );
}

/** A calm tick inside a circle ("all caught up"). */
export function AllDoneIllustration({ className = 'h-24 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden>
      <circle cx="60" cy="60" r="44" fill="#E6F0EB" stroke="#0F5C4A" strokeWidth="2" />
      <path
        d="M42 61l12 12 24-26"
        stroke="#0F5C4A"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
