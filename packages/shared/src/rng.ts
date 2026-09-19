/** Deterministic PRNG utilities so challenges / dailies are reproducible from a seed. */

/** cyrb53 string hash → 53-bit integer. */
export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32: small, fast, good-enough PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(seed: string | number): () => number {
  return mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Pick n distinct items (or fewer if the pool is smaller). */
export function sample<T>(items: readonly T[], n: number, rand: () => number): T[] {
  if (n >= items.length) return shuffle(items, rand);
  const picked = new Set<number>();
  const out: T[] = [];
  while (out.length < n) {
    const i = Math.floor(rand() * items.length);
    if (!picked.has(i)) {
      picked.add(i);
      out.push(items[i]!);
    }
  }
  return out;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-friendly random code (no 0/O/1/I), e.g. for challenges and parties. */
export function randomCode(length: number, rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
