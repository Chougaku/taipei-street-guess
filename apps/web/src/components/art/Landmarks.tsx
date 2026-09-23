/** Taipei 101 and the Taipei Dome, in a day look (stickers) and a lit night look (hero skyline). */
import type { ArtProps } from './Stickers.tsx';
import { useSvgId } from './useSvgId.ts';

/** Taipei 101 is lit in a different rainbow colour each night, Sunday first to match Date#getDay. */
const WEEKDAY_LIGHTS = ['#a855f7', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#6366f1'];

/** Tops of the eight flared "pagoda" segments. */
const SEGMENTS = [98, 128, 158, 188, 218, 248, 278, 308];

export function Taipei101({ lit = false, ...props }: ArtProps & { lit?: boolean }) {
  const face = useSvgId('t101');
  const blur = useSvgId('t101glow');
  const light = WEEKDAY_LIGHTS[new Date().getDay()];
  const [left, right] = lit ? ['#2f7d8a', '#1c5763'] : ['#8be6d8', '#35b5a5'];
  const edges = [62, 74, 86, ...SEGMENTS].map((y) => {
    const half = y < 98 ? [5.5, 8.5, 11.5][[62, 74, 86].indexOf(y)]! : 17;
    return `M${50 - half} ${y}h${half * 2}`;
  });
  return (
    <svg viewBox="0 0 100 400" aria-hidden {...props}>
      <defs>
        <linearGradient id={face} x1="0" x2="1" y1="0" y2="0">
          <stop offset=".5" stopColor={left} />
          <stop offset=".5" stopColor={right} />
        </linearGradient>
        {lit && (
          <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        )}
      </defs>
      <path d="M49.3 2h1.4l1.4 60h-4.2z" fill={lit ? '#e2e8f0' : '#b6c3d4'} />
      <g fill={`url(#${face})`}>
        <path d="M44.5 62h11l1 12h-13z" />
        <path d="M41.5 74h17l1.5 12H40z" />
        <path d="M38.5 86h23l1.5 12H37z" />
        {SEGMENTS.map((y) => (
          <path key={y} d={`M33 ${y}h34l-4 30H37z`} />
        ))}
        <path d="M35 338h30l7 62H28z" />
      </g>
      {lit ? (
        <>
          <g stroke={light} strokeWidth="3" filter={`url(#${blur})`}>
            {edges.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g stroke={light} strokeWidth="1.6">
            {edges.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g fill="#fde68a" opacity=".75">
            {SEGMENTS.flatMap((y, i) =>
              [39, 44, 50, 56, 61]
                .filter((_, k) => (i * 3 + k * 2) % 5 !== 0)
                .map((x) => <rect key={`${y}-${x}`} x={x - 1} y={y + 12 + ((i + x) % 2) * 8} width="2" height="2.6" rx=".6" />),
            )}
          </g>
          <circle cx="50" cy="3" r="2.2" fill="#fff" opacity=".9" />
        </>
      ) : (
        <g stroke="#0b1220" strokeOpacity=".16" strokeWidth="1.3">
          {SEGMENTS.map((y) => (
            <path key={y} d={`M36 ${y + 10}h28M37.3 ${y + 20}h25.4`} />
          ))}
          <path d="M34 358h32M33 372h34M32 386h36" />
        </g>
      )}
      <circle cx="50" cy="350" r="7" fill="none" stroke="#ffd166" strokeWidth="2.4" />
      <circle cx="50" cy="350" r="2.4" fill="#ffd166" />
    </svg>
  );
}

export function TaipeiDome({ lit = false, ...props }: ArtProps & { lit?: boolean }) {
  const roof = useSvgId('dome');
  const rib = lit ? '#46587c' : '#8397b8';
  return (
    <svg viewBox="0 0 200 100" aria-hidden {...props}>
      <defs>
        <linearGradient id={roof} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lit ? '#e2e9f5' : '#ffffff'} />
          <stop offset="1" stopColor={lit ? '#8ea3c4' : '#c7d4e8'} />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="96" rx="90" ry="4" fill="#000" opacity=".2" />
      <path d="M18 64h164l-9 32H27z" fill={lit ? '#5c6f92' : '#a7b8d2'} />
      <g stroke={rib} strokeWidth="2.2">
        {Array.from({ length: 19 }, (_, i) => {
          const t = i / 18;
          return <path key={i} d={`M${24 + t * 152} 66L${31 + t * 138} 94`} />;
        })}
      </g>
      <rect x="12" y="58" width="176" height="7" rx="3" fill="#1b2740" />
      <g fill={lit ? '#ffd166' : '#5eead4'}>
        {Array.from({ length: 14 }, (_, i) => (
          <circle key={i} cx={22 + i * 12} cy="61.5" r="1.4" />
        ))}
      </g>
      <path d="M8 60C28 20 172 20 192 60z" fill={`url(#${roof})`} />
      <g fill="none" strokeLinecap="round">
        <path d="M32 51C60 34 140 34 168 51" stroke={lit ? '#7b8fb0' : '#b3c3dc'} strokeWidth="2" />
        <path d="M62 40C86 33 114 33 138 40" stroke={lit ? '#7b8fb0' : '#b3c3dc'} strokeWidth="2" />
        <path d="M42 44C60 34 84 29 104 29" stroke="#fff" strokeWidth="3.5" opacity=".8" />
      </g>
    </svg>
  );
}
