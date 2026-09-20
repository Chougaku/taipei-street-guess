declare module 'virtual:tg-location-pool' {
  /** Compact location pool, bundled only in serverless (`--mode static`) builds. */
  const pool: {
    /** District codes, indexed by the 5th field of each entry. */
    d: string[];
    /** Village codes, indexed by the 6th field of each entry (-1 = unknown). */
    v: string[];
    /** [panoId, lat × 1e5, lng × 1e5, heading, districtIndex, villageIndex] */
    l: [string, number, number, number, number, number][];
  } | null;
  export default pool;
}
