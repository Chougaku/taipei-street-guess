/** Small Taipei-themed stickers used across the UI: a baseball, a cup of bubble tea and a night-market lantern. */
import type { SVGProps } from 'react';
import { useSvgId } from './useSvgId.ts';

export type ArtProps = SVGProps<SVGSVGElement>;

const LEFT_SEAM = 'M19 8.5C27.5 20 27.5 44 19 55.5';
const RIGHT_SEAM = 'M45 8.5C36.5 20 36.5 44 45 55.5';

export function Baseball(props: ArtProps) {
  const clip = useSvgId('ball');
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...props}>
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="28" fill="#e7d8c1" />
      <circle cx="30" cy="30" r="25.5" fill="#fffaf1" />
      <g fill="none" stroke="#e5383b" clipPath={`url(#${clip})`}>
        <path d={LEFT_SEAM} strokeWidth="1.8" strokeLinecap="round" />
        <path d={RIGHT_SEAM} strokeWidth="1.8" strokeLinecap="round" />
        <path d={LEFT_SEAM} strokeWidth="6.5" strokeDasharray="1.5 3.7" />
        <path d={RIGHT_SEAM} strokeWidth="6.5" strokeDasharray="1.5 3.7" />
      </g>
    </svg>
  );
}

export type Mood = 'happy' | 'sad' | 'wow';

export function BubbleTea({ mood = 'happy', ...props }: ArtProps & { mood?: Mood }) {
  const tea = useSvgId('tea');
  const top = useSvgId('teaTop');
  // The straw is rotated about this point; drawn twice so it shows faintly through the tea.
  const straw = <rect x="34" y="2" width="8.5" height="80" rx="4.25" transform="rotate(14 38 40)" />;
  const eye = '#3b2314';
  return (
    <svg viewBox="0 0 64 100" aria-hidden {...props}>
      <defs>
        <linearGradient id={tea} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7d7a8" />
          <stop offset="1" stopColor="#cf8a4d" />
        </linearGradient>
        <clipPath id={top}>
          <rect width="64" height="29" />
        </clipPath>
      </defs>
      <path d="M9 30h46l-6.2 61.5a4 4 0 0 1-4 3.5H19.2a4 4 0 0 1-4-3.5z" fill={`url(#${tea})`} />
      <g fill="#ff5c8a" opacity=".35">{straw}</g>
      {/* Ice cubes */}
      <rect x="15" y="34" width="10" height="9" rx="2.5" fill="#fff" opacity=".3" transform="rotate(-12 20 38)" />
      <rect x="41" y="36" width="9" height="8" rx="2.5" fill="#fff" opacity=".25" transform="rotate(10 45 40)" />
      {/* Pearls */}
      <g fill="#3b2314">
        {[
          [21, 88.5], [28, 88.5], [35, 88.5], [42, 88.5],
          [24.5, 82.3], [31.5, 82.3], [38.5, 82.3], [45, 82.8], [18.5, 83],
          [21, 76], [29.5, 75.5], [41, 76.5],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.4" />
        ))}
      </g>
      <g fill="#fff" opacity=".45">
        {[[20, 87.3], [27, 87.3], [34, 87.3], [41, 87.3], [23.5, 81.1], [30.5, 81.1], [37.5, 81.1], [28.5, 74.3]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" />
        ))}
      </g>
      {/* Glass highlight */}
      <path d="M13.6 36h3.6l2.6 44h-3.2z" fill="#fff" opacity=".28" />
      {/* Face */}
      <circle cx="26" cy="55" r="2.5" fill={eye} />
      <circle cx="38" cy="55" r="2.5" fill={eye} />
      <circle cx="26.8" cy="54.2" r=".8" fill="#fff" />
      <circle cx="38.8" cy="54.2" r=".8" fill="#fff" />
      <ellipse cx="21.3" cy="60" rx="3" ry="1.8" fill="#ff7aa2" opacity=".75" />
      <ellipse cx="42.7" cy="60" rx="3" ry="1.8" fill="#ff7aa2" opacity=".75" />
      {mood === 'wow' ? (
        <ellipse cx="32" cy="61" rx="2.2" ry="2.8" fill={eye} />
      ) : (
        <path
          d={mood === 'sad' ? 'M29.3 62q2.7-2.8 5.4 0' : 'M29.3 59.4q2.7 3 5.4 0'}
          fill="none"
          stroke={eye}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
      {/* Sealed lid, then the straw punching through it */}
      <rect x="6" y="25" width="52" height="7" rx="3.5" fill="#fff4e6" />
      <g fill="#ff5c8a" clipPath={`url(#${top})`}>
        {straw}
        <rect x="35.6" y="4" width="2.2" height="30" rx="1.1" fill="#fff" opacity=".5" transform="rotate(14 38 40)" />
      </g>
    </svg>
  );
}

/** A red night-market lantern. The default character is 猜, as in 猜燈謎 (lantern riddles). */
export function Lantern({ char = '猜', ...props }: ArtProps & { char?: string }) {
  const glow = useSvgId('lantern');
  return (
    <svg viewBox="0 0 64 104" aria-hidden {...props}>
      <defs>
        <radialGradient id={glow} cx=".42" cy=".4" r=".65">
          <stop offset="0" stopColor="#ff9466" />
          <stop offset=".55" stopColor="#ef3b2d" />
          <stop offset="1" stopColor="#b3141b" />
        </radialGradient>
      </defs>
      <path d="M32 0v13" stroke="#ffd166" strokeWidth="2" />
      <rect x="21" y="12" width="22" height="8" rx="2.5" fill="#ffb020" />
      <ellipse cx="32" cy="47" rx="27" ry="28" fill={`url(#${glow})`} />
      <g fill="none" stroke="#9b1117" strokeOpacity=".45" strokeWidth="1.6">
        <ellipse cx="32" cy="47" rx="17" ry="28" />
        <ellipse cx="32" cy="47" rx="7" ry="28" />
      </g>
      {char && (
        <text x="32" y="55.5" textAnchor="middle" fontSize="23" fontWeight="900" fill="#ffd166">
          {char}
        </text>
      )}
      <rect x="23" y="73" width="18" height="7" rx="2.5" fill="#ffb020" />
      <path d="M28 81v17M32 81v20M36 81v17" stroke="#ffb020" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="32" cy="82.5" r="2.6" fill="#ef3b2d" />
    </svg>
  );
}
