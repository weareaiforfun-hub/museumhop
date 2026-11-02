/** MuseumHopper's mark: a dotted path hopping from one stop (lime) to the next (coral). Same drawing as the favicon. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="8 12 48 40" aria-hidden="true">
      <path d="M16 43C19 22 29 22 32 37C35 20 45 18 48 31" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="0.1 7.5" />
      <circle cx="16" cy="45" r="5.5" fill="currentColor" />
      <circle cx="48" cy="33" r="5.5" fill="#df664f" />
    </svg>
  );
}
