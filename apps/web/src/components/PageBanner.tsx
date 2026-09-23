import type { ReactNode } from 'react';

/** Page header card: a tinted background, the page title and an illustration on the right. */
export function PageBanner({
  title,
  art,
  tint = 'from-accent/30',
  children,
}: {
  title: ReactNode;
  art: ReactNode;
  /** Tailwind `from-*` class for the tint, spelled out by callers so Tailwind can see it. */
  tint?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`card relative overflow-hidden bg-gradient-to-br via-panel to-panel p-6 ${tint}`}>
      <div className="pointer-events-none absolute right-4 top-4 flex h-20 w-20 items-center justify-center sm:inset-y-4 sm:right-8 sm:h-auto sm:w-32">
        {art}
      </div>
      <div className="relative pr-24 sm:pr-40">
        <h1 className="text-3xl font-black">{title}</h1>
        {children}
      </div>
    </div>
  );
}
