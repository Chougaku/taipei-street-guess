/** Preset avatars: coloured pins and Taipei-themed emoji. */
const AVATAR_ART: Record<string, { bg: string; glyph?: string }> = {
  'pin-red': { bg: '#ef4444' },
  'pin-orange': { bg: '#f97316' },
  'pin-yellow': { bg: '#eab308' },
  'pin-green': { bg: '#22c55e' },
  'pin-teal': { bg: '#14b8a6' },
  'pin-blue': { bg: '#3b82f6' },
  'pin-purple': { bg: '#a855f7' },
  'pin-pink': { bg: '#ec4899' },
  'bubble-tea': { bg: '#a16207', glyph: '🧋' },
  'taipei-101': { bg: '#0ea5e9', glyph: '🏙️' },
  mrt: { bg: '#2563eb', glyph: '🚇' },
  scooter: { bg: '#64748b', glyph: '🛵' },
  temple: { bg: '#b91c1c', glyph: '⛩️' },
  'night-market': { bg: '#7c3aed', glyph: '🏮' },
  mountain: { bg: '#15803d', glyph: '⛰️' },
  cat: { bg: '#d97706', glyph: '🐈' },
};

export const AVATAR_IDS = Object.keys(AVATAR_ART);

export function Avatar({ id, size = 36, className = '' }: { id: string; size?: number; className?: string }) {
  const art = AVATAR_ART[id] ?? AVATAR_ART['pin-red']!;
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full ring-2 ring-white/20 ${className}`}
      style={{ width: size, height: size, background: art.bg, fontSize: size * 0.55 }}
      aria-hidden
    >
      {art.glyph ?? (
        <svg width={size * 0.5} height={size * 0.62} viewBox="0 0 30 40">
          <path d="M15 1C7.3 1 1 7.1 1 14.7 1 24.5 13.4 37.6 14.1 38.3a1.2 1.2 0 0 0 1.8 0C16.6 37.6 29 24.5 29 14.7 29 7.1 22.7 1 15 1z" fill="#fff" />
          <circle cx="15" cy="14.5" r="5.5" fill={art.bg} />
        </svg>
      )}
    </span>
  );
}
