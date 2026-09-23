/** A one-colour Taipei skyline (fill = currentColor) for the page footer. */
import type { ArtProps } from './Stickers.tsx';

// Landmarks sit near the middle so they survive the centred crop on phones.
const BUILDINGS: [x: number, width: number, height: number][] = [
  [10, 36, 22], [50, 24, 34], [78, 40, 18], [124, 30, 40], [158, 44, 26], [208, 26, 46], [238, 40, 30], [284, 32, 20],
  [320, 46, 36], [372, 28, 52], [404, 42, 28], [452, 24, 40],
  [690, 30, 36], [724, 40, 24], [770, 30, 44], [804, 26, 28], [836, 40, 40], [880, 34, 50], [920, 34, 42], [958, 44, 26],
  [1006, 28, 48], [1038, 40, 30], [1084, 30, 38], [1118, 46, 24], [1168, 32, 36],
];

const T101_X = 620;
const TAIPEI_101 = [
  `M${T101_X + 19.5} 0h1v12h-1z`,
  `M${T101_X + 17.5} 12h5l.5 4h-6z`,
  `M${T101_X + 16.5} 16h7l.5 4h-8z`,
  ...Array.from({ length: 6 }, (_, i) => `M${T101_X + 13} ${20 + i * 8}h14l-1.5 8h-11z`),
  `M${T101_X + 14} 68h12l3 22H${T101_X + 11}z`,
].join('');

export function SkylineSilhouette(props: ArtProps) {
  return (
    <svg viewBox="0 0 1200 90" preserveAspectRatio="xMidYMax slice" fill="currentColor" aria-hidden {...props}>
      <path d="M0 70c120-18 220-12 330-22s200-12 310-4 220-14 340-2 170 8 220 4v44H0z" opacity=".55" />
      {BUILDINGS.map(([x, w, h]) => (
        <rect key={x} x={x} y={90 - h} width={w} height={h} />
      ))}
      {/* Taipei Dome */}
      <path d="M486 90V80c16-16 104-16 120 0v10z" />
      <path d={TAIPEI_101} />
    </svg>
  );
}
