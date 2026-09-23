/** Street-level Taipei: an MRT train, a scooter rider in blue-and-white slippers and a night-market stall. */
import type { ArtProps } from './Stickers.tsx';

export function MrtTrain({ lit = false, ...props }: ArtProps & { lit?: boolean }) {
  const win = lit ? '#fde68a' : '#1e293b';
  const body = '#eef2f7';
  return (
    <svg viewBox="0 0 260 56" aria-hidden {...props}>
      <rect x="4" y="8" width="122" height="38" rx="7" fill={body} />
      <rect x="10" y="14" width="110" height="14" rx="3" fill={win} />
      <path d="M130 8h96c15 0 26 12 26 27v4a7 7 0 0 1-7 7H130z" fill={body} />
      <path d="M136 14h90c8 0 14.5 5.5 17 14H136z" fill={win} />
      <g stroke={body} strokeWidth="3">
        {[24, 38, 52, 66, 80, 94, 108, 150, 164, 178, 192, 206, 220].map((x) => (
          <path key={x} d={`M${x} 14v14`} />
        ))}
      </g>
      <g fill="none" stroke="#c3ccd8" strokeWidth="1.6">
        {[30, 84, 156, 210].map((x) => (
          <rect key={x} x={x} y="11" width="16" height="34" rx="2" />
        ))}
      </g>
      <rect x="4" y="33" width="122" height="5" fill="#2563eb" />
      <path d="M130 33h121.6v5H130z" fill="#2563eb" />
      <g fill="#334155">
        {[12, 88, 138, 214].map((x) => (
          <rect key={x} x={x} y="46" width="30" height="5" rx="2.5" />
        ))}
      </g>
      <rect x="126" y="22" width="4" height="16" fill="#94a3b8" />
      <circle cx="248" cy="40" r="2.2" fill="#fde68a" />
    </svg>
  );
}

function Wheel({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx} cy="80" r="15" fill="#1f2937" />
      <circle cx={cx} cy="80" r="7" fill="#cbd5e1" />
      <circle cx={cx} cy="80" r="2.6" fill="#64748b" />
    </g>
  );
}

export function Scooter(props: ArtProps) {
  const paint = '#ff6b3d';
  const skin = '#f8d0a8';
  const jacket = '#2563eb';
  return (
    <svg viewBox="0 0 128 100" aria-hidden {...props}>
      <Wheel cx={28} />
      <Wheel cx={102} />
      {/* Rear body, floorboard and seat */}
      <path d="M7 71C4 60 11 49 27 46.5c9-1.5 25-1.5 36-.5 5 .5 7 4 5.5 8.5L64 68c-1.5 4-4.5 6-8.5 6H13c-3.5 0-5.5-1-6-3z" fill={paint} />
      <path d="M15 57c4-5 12-7.5 22-7.5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".35" />
      <rect x="4.5" y="57" width="4.5" height="8" rx="1.5" fill="#b91c1c" />
      <path d="M52 66h34c2 0 3 1.5 2.5 3.5l-1 3.5H52z" fill="#c2410c" />
      <path d="M22 47c0-7 6-9 14-9h24c5 0 7 4 5 9z" fill="#475569" />
      {/* Rider: legs, torso */}
      <path d="M45 41l23 2 5 21" fill="none" stroke="#334155" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="77" cy="66" rx="5.5" ry="2.4" fill="#60a5fa" />
      <path d="M74 65q3-2.6 6 0" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M40 41c-2-12 4-22 14-24l6 1c2 9 0 17-4 24z" fill={jacket} />
      {/* Leg shield, front fender, headlight */}
      <path d="M80 72c-2-16 2-32 10-44l6-6 7 2-4 8c-5 12-7 26-6 40z" fill={paint} />
      <path d="M86 70c4-10 28-10 32 0l-4 1c-4-6-20-6-24 0z" fill={paint} />
      <path d="M100 23h8a4 4 0 0 1 0 8h-6z" fill={paint} />
      <circle cx="108.5" cy="27" r="2.8" fill="#fde68a" />
      {/* Arm, head with helmet, handlebar and mirror */}
      <path d="M56 23c10 2 24 0 36-3" fill="none" stroke={jacket} strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="93" cy="19.5" r="2.6" fill={skin} />
      <circle cx="61" cy="12" r="7.5" fill={skin} />
      <path d="M53 11.5a8 8 0 0 1 16 0z" fill="#ffd166" />
      <path d="M60 11.5h10" stroke="#ffb020" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="65.5" cy="14" r="1.1" fill="#1f2937" />
      <path d="M92 19h18" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
      <path d="M96 18l-4-9" stroke="#1f2937" strokeWidth="2" />
      <ellipse cx="91.5" cy="8" rx="3.2" ry="2.2" fill="#94a3b8" />
    </svg>
  );
}

export function NightMarketStall(props: ArtProps) {
  return (
    <svg viewBox="0 0 150 122" aria-hidden {...props}>
      <rect x="15" y="44" width="4.5" height="50" rx="1.5" fill="#7c4a22" />
      <rect x="130.5" y="44" width="4.5" height="50" rx="1.5" fill="#7c4a22" />
      {/* Neon sign */}
      <path d="M52 30v8M98 30v8" stroke="#7c4a22" strokeWidth="3" />
      <rect x="33" y="4" width="84" height="27" rx="8" fill="#1a1033" stroke="#ff4d8d" strokeWidth="2.5" />
      <text x="75" y="24.5" textAnchor="middle" fontSize="17" fontWeight="900" letterSpacing="3" fill="#ffe08a">
        夜市
      </text>
      {/* Striped awning with a scalloped edge */}
      {Array.from({ length: 10 }, (_, i) => (
        <path key={i} d={`M${10 + i * 13} 38h13v14a6.5 6.5 0 0 1-13 0z`} fill={i % 2 ? '#fff4e6' : '#ef3b2d'} />
      ))}
      <rect x="8" y="35" width="134" height="5" rx="2.5" fill="#b91c1c" />
      {/* Lanterns hanging between the dishes */}
      {[57, 92].map((cx) => (
        <g key={cx}>
          <path d={`M${cx} 56v6`} stroke="#ffd166" strokeWidth="1.2" />
          <ellipse cx={cx} cy="67.5" rx="5" ry="5.6" fill="#ef3b2d" />
          <rect x={cx - 2.5} y="60.5" width="5" height="2" rx="1" fill="#ffb020" />
        </g>
      ))}
      {/* Steaming pot */}
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7">
        {[29, 36, 43].map((x, i) => (
          <path key={x} className="animate-steam svg-origin-center" style={{ animationDelay: `${i * 0.6}s` }} d={`M${x} 71q-3-4 0-8t0-8`} />
        ))}
      </g>
      <rect x="20" y="75" width="32" height="4" rx="2" fill="#cbd5e1" />
      <path d="M22 79h28v7a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" fill="#94a3b8" />
      {/* Skewers */}
      <path d="M66 90V62M75 90V60M84 90V62" stroke="#d6a86b" strokeWidth="1.6" />
      {[66, 75, 84].flatMap((x, i) =>
        [66, 73, 80].map((y, j) => <circle key={`${x}-${y}`} cx={x} cy={y - (i === 1 ? 2 : 0)} r="3.8" fill={['#b45309', '#f59e0b', '#7c2d12'][(i + j) % 3]} />),
      )}
      {/* 大雞排: a giant fried chicken cutlet */}
      <path d="M97 89c-3-9 2-18 12-19 9-1 17 3 20 10 2 5 0 9-4 9z" fill="#e8a13a" />
      <g fill="#c77c1e">
        {[[106, 80], [113, 76.5], [121, 81], [109, 86], [118, 86.5], [102, 84]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" />
        ))}
      </g>
      {/* Counter */}
      <rect x="8" y="89" width="134" height="6" rx="3" fill="#fbbf24" />
      <rect x="12" y="95" width="126" height="25" rx="3" fill="#c2410c" />
      <path d="M44 95v25M75 95v25M106 95v25" stroke="#9a3412" strokeWidth="2" />
    </svg>
  );
}
