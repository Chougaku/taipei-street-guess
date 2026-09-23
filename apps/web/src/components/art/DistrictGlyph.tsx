/** Line icons of a landmark in each district (24×24, stroke-based like icons.tsx). */
import { DISTRICT_BY_CODE } from '@tg/shared';
import type { ReactNode, SVGProps } from 'react';

const TAIPEI_101 = (
  <>
    <path d="M12 1.5v2.7" />
    <path d="M10.4 4.2h3.2l.4 2.3h-4z" />
    <path d="M9 6.5h6l-.7 3.4H9.7zM9 9.9h6l-.7 3.4H9.7zM9 13.3h6l-.7 3.4H9.7z" />
    <path d="M9.4 16.7h5.2l1.4 5.3H8z" />
  </>
);

const GLYPHS: Record<string, ReactNode> = {
  // 臺北市全區: skyline around Taipei 101
  taipei: (
    <>
      <path d="M2 21h20M4 21v-7h4v7M16 21v-9h4v9" />
      <path d="M12 3v2M10.8 5h2.4l.3 2h-3zM10 7h4l-.5 3h-3zM10 10h4l-.5 3h-3zM10.2 13h3.6l1 8H9.2z" />
    </>
  ),
  // 松山區: Songshan Airport
  '63000010': (
    <path
      transform="rotate(45 12 12)"
      d="M12 2.5c.9 0 1.5 1 1.5 2.4v4.7l7.5 4.3V16l-7.5-2.4v4.6l2.3 1.7v1.7L12 20.6l-3.8 1v-1.7l2.3-1.7v-4.6L3 16v-2.1l7.5-4.3V4.9c0-1.4.6-2.4 1.5-2.4z"
    />
  ),
  // 信義區: Taipei 101
  '63000020': TAIPEI_101,
  // 大安區: Da'an Forest Park
  '63000030': (
    <>
      <path d="M8 14.5h8a4 4 0 0 0 .9-7.9 5 5 0 0 0-9.8 0A4 4 0 0 0 8 14.5z" />
      <path d="M12 21v-8M12 17l-2.5-2M12 16l2.5-2M5 21h14" />
    </>
  ),
  // 中山區: the Miramar Ferris wheel
  '63000040': (
    <>
      <circle cx="12" cy="10" r="7" />
      <path d="M12 3v14M5.9 6.5l12.2 7M5.9 13.5l12.2-7" />
      <path d="M9 21l3-11 3 11M7 21h10" />
    </>
  ),
  // 中正區: Chiang Kai-shek Memorial Hall
  '63000050': (
    <>
      <path d="M12 2v1.6M7.5 7.5q2.6-.6 4.5-3.9 1.9 3.3 4.5 3.9zM6.5 11q3-.7 5.5-3.6 2.5 2.9 5.5 3.6z" />
      <path d="M8.5 11v5.5M15.5 11v5.5M11 16.5V14h2v2.5M6 16.5h12M5.5 18.8h13M4.5 21h15" />
    </>
  ),
  // 大同區: shophouses on Dihua Street
  '63000060': (
    <>
      <path d="M5 21V8h14v13M4 8h16M6 8l1.5-3h9L18 8M10 5V3.5h4V5" />
      <path d="M8 13v-1.5a1.5 1.5 0 0 1 3 0V13zM13 13v-1.5a1.5 1.5 0 0 1 3 0V13zM10.5 21v-4h3v4M3 21h18" />
    </>
  ),
  // 萬華區: Longshan Temple
  '63000070': (
    <>
      <path d="M8 6h8c1 2 3 3.4 6 3.2-.8 1-2 1.4-3.5 1.3H5.5C4 10.6 2.8 10.2 2 9.2c3 .2 5-1.2 6-3.2z" />
      <path d="M12 6V4M9.5 6V5M14.5 6V5" />
      <path d="M7 10.5V21M17 10.5V21M10 21v-3.5h4V21M3 21h18" />
      <path d="M7 14h10" />
    </>
  ),
  // 文山區: Maokong Gondola
  '63000080': (
    <>
      <path d="M2 6.5 22 3.5M12 5v3.5" />
      <rect x="6.5" y="8.5" width="11" height="11" rx="3" />
      <path d="M6.5 13h11" />
    </>
  ),
  // 南港區: the high-speed rail terminus
  '63000090': (
    <>
      <path d="M2.5 17h13c3 0 6-1.5 6-3.3 0-1.6-2.3-3-5.6-3.9L10.5 8.5h-8z" />
      <path d="M5.5 11.5h7M3 21h18M7 17v2M15 17v2" />
    </>
  ),
  // 內湖區: the arched bridge in Dahu Park
  '63000100': (
    <>
      <path d="M2.5 14.5a9.5 9.5 0 0 1 19 0M6.5 14.5a5.5 5.5 0 0 1 11 0M1.5 14.5h21" />
      <path d="M6.5 14.5a5.5 5.5 0 0 0 11 0" strokeDasharray="2 2.2" opacity=".6" />
    </>
  ),
  // 士林區: Shilin Night Market
  '63000110': (
    <>
      <path d="M12 2v2.5M9.5 4.5h5M10 18.5h4M12 18.5v3.5M10.5 19.5l-.5 2.5M13.5 19.5l.5 2.5" />
      <ellipse cx="12" cy="11.5" rx="6" ry="7" />
      <ellipse cx="12" cy="11.5" rx="2.6" ry="7" />
    </>
  ),
  // 北投區: hot springs
  '63000120': (
    <>
      <ellipse cx="12" cy="18" rx="8.5" ry="3.5" />
      <path d="M8 13.5c-1.2-1.2-1.2-2.4 0-3.6s1.2-2.4 0-3.6M12 13c-1.2-1.2-1.2-2.4 0-3.6s1.2-2.4 0-3.6M16 13.5c-1.2-1.2-1.2-2.4 0-3.6s1.2-2.4 0-3.6" />
    </>
  ),
};

/** District colours are tuned for the map; lighten them so line art stays readable on dark cards. */
export const glyphColor = (color: string) => `color-mix(in oklab, ${color} 65%, white)`;

/** Accent colour and landmark for a map: its district's, Taipei's for the whole-city map, none for custom maps. */
export function mapTheme(map: { slug: string; districtCode: string | null }) {
  const color = (map.districtCode && DISTRICT_BY_CODE.get(map.districtCode)?.color) || '#ff5a36';
  return { color, glyph: map.districtCode ?? (map.slug === 'taipei' ? 'taipei' : null) };
}

/** `code` is a district code, or `taipei` for the whole city. Unknown codes render nothing. */
export function DistrictGlyph({ code, ...props }: SVGProps<SVGSVGElement> & { code: string }) {
  const glyph = GLYPHS[code];
  if (!glyph) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {glyph}
    </svg>
  );
}
