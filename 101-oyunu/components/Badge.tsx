// Adın yanındaki rozet (profiles.badge). Şimdilik tek rozet: kurucu üye.

type BadgeProps = {
  badge: string | null | undefined;
  className?: string;
};

export const BADGE_LABELS: Record<string, string> = {
  founder: 'Kurucu üye',
};

export function Badge({ badge, className = 'w-3.5 h-3.5' }: BadgeProps) {
  if (badge !== 'founder') return null;
  return (
    <svg
      className={`inline-block align-[-2px] text-ayellow flex-shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label={BADGE_LABELS.founder}
    >
      <title>{BADGE_LABELS.founder}</title>
      {/* Taç */}
      <path d="M3 7.5l4.5 4 4.5-7 4.5 7 4.5-4-2 11H5l-2-11z" />
      <rect x="5" y="19.5" width="14" height="2" rx="1" />
    </svg>
  );
}
