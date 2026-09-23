import { useId } from 'react';

/** A per-instance id that is safe inside `url(#…)` references, so gradients never collide between copies. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
