/** The home hero: a night-time Taipei skyline with fireworks, a passing MRT train and a string of lanterns. */
import { memo } from 'react';
import { TaipeiDome, Taipei101 } from './Landmarks.tsx';
import { Baseball, BubbleTea, Lantern } from './Stickers.tsx';
import { MrtTrain } from './Street.tsx';

/** Deterministic 0–1 noise so the skyline looks random but never changes between renders. */
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

type Building = readonly [x: number, width: number, height: number];

const GROUND = 312;
const BACK: Building[] = [
  [0, 40, 26], [44, 30, 40], [78, 46, 30], [128, 34, 52], [166, 50, 36], [220, 30, 62], [254, 44, 44],
  [302, 36, 70], [342, 52, 50], [398, 32, 84], [434, 48, 64], [486, 36, 96], [526, 54, 72], [584, 30, 110],
  [618, 46, 86], [668, 34, 124], [706, 40, 98], [760, 30, 80], [850, 44, 118], [898, 30, 92], [932, 46, 134], [982, 18, 70],
];
const FRONT: Building[] = [
  [0, 60, 34], [64, 40, 22], [108, 70, 40], [182, 36, 28], [222, 60, 46], [290, 40, 30], [336, 64, 24],
  [404, 50, 38], [458, 40, 26], [506, 44, 30], [556, 40, 22], [912, 36, 30], [952, 48, 46],
];

function litWindows(buildings: Building[], seed: number) {
  return buildings.flatMap(([x, w, h], b) => {
    const out: { x: number; y: number; teal: boolean }[] = [];
    for (let y = GROUND - h + 7; y < GROUND - 8; y += 9) {
      for (let wx = x + 5; wx < x + w - 5; wx += 7) {
        const n = noise(seed + b * 97 + y * 13 + wx);
        if (n < 0.3) out.push({ x: wx, y, teal: n < 0.07 });
      }
    }
    return out;
  });
}

const BACK_WINDOWS = litWindows(BACK, 1);
const FRONT_WINDOWS = litWindows(FRONT, 2);

const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: noise(i + 300) * 1000,
  y: 8 + noise(i + 400) * 160,
  r: 0.9 + noise(i + 500) * 1.3,
  delay: noise(i + 600) * 2.6,
})).filter((s) => s.x < 810 || s.x > 910);

const BURSTS = [
  { x: 740, y: 70, r: 44, color: '#ff4d8d', delay: 0 },
  { x: 958, y: 52, r: 32, color: '#ffd166', delay: 1.2 },
  { x: 668, y: 150, r: 24, color: '#5eead4', delay: 2.3 },
];

function Windows({ list }: { list: { x: number; y: number; teal: boolean }[] }) {
  return (
    <>
      {list.map((w) => (
        <rect key={`${w.x}-${w.y}`} x={w.x} y={w.y} width="3" height="4" rx=".6" fill={w.teal ? '#5eead4' : '#ffd166'} opacity={w.teal ? 0.6 : 0.7} />
      ))}
    </>
  );
}

/**
 * Two stacked SVGs share one coordinate system: the skyline, painted once, and a light overlay with
 * everything that moves. The overlay gets its own compositor layer, so animation frames never
 * repaint the buildings or the blurred Taipei 101 lights.
 */
export const HeroScene = memo(function HeroScene({ className = '' }: { className?: string }) {
  const frame = { viewBox: '0 0 1000 320', preserveAspectRatio: 'xMaxYMax slice', 'aria-hidden': true } as const;
  return (
    <>
      <svg {...frame} className={className}>
        <Skyline />
      </svg>
      <svg {...frame} className={`${className} will-change-transform`}>
        <Motion />
      </svg>
    </>
  );
});

function Motion() {
  return (
    <>
      <g fill="#fff">
        {STARS.map((s) => (
          <circle key={`${s.x}`} cx={s.x} cy={s.y} r={s.r} className="animate-twinkle" style={{ animationDelay: `-${s.delay}s` }} />
        ))}
      </g>
      {BURSTS.map((b) => (
        <g key={b.x} transform={`translate(${b.x} ${b.y})`}>
          <g
            className="animate-firework svg-origin-center"
            style={{ animationDelay: `-${b.delay}s` }}
            stroke={b.color}
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M0 ${-b.r * 0.35}V${-b.r}`} transform={`rotate(${i * 30})`} />
            ))}
            <circle r="2.6" fill={b.color} stroke="none" />
          </g>
        </g>
      ))}
      <g className="animate-drive">
        <MrtTrain lit x="0" y="266" width="130" height="28" />
      </g>
      {/* A home run sailing out of the Dome, and a bubble tea floating by */}
      <g transform="translate(772 160)">
        <g className="animate-bob svg-origin-center">
          <path d="M-24 16-50 36M-28 4-56 22M-16 26-38 44" stroke="#fff" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round" />
          <g className="animate-roll svg-origin-center">
            <Baseball x="-19" y="-19" width="38" height="38" />
          </g>
        </g>
      </g>
      <g transform="translate(958 170)">
        <g className="animate-bob svg-origin-center" style={{ animationDelay: '-1.4s' }}>
          <BubbleTea x="-22" y="-34" width="44" height="68" />
        </g>
      </g>
    </>
  );
}

function Skyline() {
  return (
    <>
      {/* 象山 and the hills around the basin */}
      <path
        d="M0 272C80 262 150 266 230 256s130-6 200-18 130-24 210-32c60-6 100-30 160-36s100 20 150 14c25-3 40 2 50 4V320H0z"
        fill="#2a2156"
      />
      <path d="M560 250c60-18 120-24 180-16s120-12 180-8c40 3 65 10 80 14v80H560z" fill="#221a4a" />

      <g fill="#1c1745">
        {BACK.map(([x, w, h]) => (
          <rect key={x} x={x} y={GROUND - h} width={w} height={h + 8} />
        ))}
      </g>
      <Windows list={BACK_WINDOWS} />

      <Taipei101 lit x="820" y="-6" width="80" height="320" />
      <TaipeiDome lit x="614" y="236" width="160" height="80" />

      <g fill="#141032">
        {FRONT.map(([x, w, h]) => (
          <rect key={x} x={x} y={GROUND - h} width={w} height={h + 8} />
        ))}
      </g>
      <Windows list={FRONT_WINDOWS} />

      {/* Elevated MRT line */}
      <rect x="0" y="294" width="1000" height="6" fill="#383275" />
      <g fill="#2b2663">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={40 + i * 110} y="300" width="8" height="16" />
        ))}
      </g>
      <rect x="0" y="314" width="1000" height="6" fill="#0f0b26" />
    </>
  );
}

/** A catenary of swinging lanterns along the top edge of a container (which must be `relative`). */
export function LanternString({ count = 9, className = '' }: { count?: number; className?: string }) {
  const spots = Array.from({ length: count }, (_, i) => (i + 0.5) / count);
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 ${className}`} aria-hidden>
      <svg viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <path d="M0 6Q500 64 1000 6" fill="none" stroke="#ffd166" strokeOpacity=".45" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {spots.map((f, i) => (
        <div
          key={f}
          className="absolute -ml-3 w-6 origin-top animate-swing"
          // The quadratic curve above passes through y = 6 + 116·f·(1 − f) in the 80-unit-high box.
          style={{ left: `${f * 100}%`, top: `${((6 + 116 * f * (1 - f)) / 80) * 100}%`, animationDelay: `${-i * 0.45}s` }}
        >
          <Lantern char={i === Math.floor(count / 2) ? '猜' : ''} className="h-10 w-6 drop-shadow-[0_0_10px_rgba(255,90,54,0.55)]" />
        </div>
      ))}
    </div>
  );
}
