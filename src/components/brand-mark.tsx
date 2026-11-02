/** MuseumHop's mark: one dashed hop from a stop (lime) to the next (coral). Same drawing as the favicon. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="6 12 52 46" aria-hidden="true">
      <path d="M16 44Q32 0 48 44" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="5 6" />
      <circle cx="16" cy="46" r="6.5" fill="currentColor" />
      <circle cx="48" cy="46" r="6.5" fill="#df664f" />
    </svg>
  );
}
