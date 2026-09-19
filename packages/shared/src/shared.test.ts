import { describe, expect, it } from 'vitest';
import {
  brDistanceLosers,
  DISTRICTS,
  duelMultiplier,
  duelRoundDamage,
  eloUpdate,
  findDistrict,
  formatDistance,
  haversineMeters,
  isInTaipei,
  levelFromXp,
  medalForScore,
  roundScore,
  sample,
  seededRandom,
  TAIPEI_DIAGONAL_KM,
  xpToReachLevel,
} from './index.ts';
import { findVillage } from './villages.ts';

describe('geo', () => {
  it('computes haversine distance', () => {
    // Taipei Main Station → Taipei 101 ≈ 5.0 km
    const d = haversineMeters({ lat: 25.0478, lng: 121.517 }, { lat: 25.0339, lng: 121.5645 });
    expect(d).toBeGreaterThan(4800);
    expect(d).toBeLessThan(5200);
  });

  it('has a sensible Taipei map size', () => {
    expect(TAIPEI_DIAGONAL_KM).toBeGreaterThan(33);
    expect(TAIPEI_DIAGONAL_KM).toBeLessThan(37);
  });

  it.each([
    [25.0339, 121.5645, 'xinyi'], // Taipei 101
    [25.0263, 121.5436, 'daan'], // Da'an Forest Park
    [25.0478, 121.517, 'zhongzheng'], // Taipei Main Station
    [25.0368, 121.4999, 'wanhua'], // Longshan Temple
    [25.0631, 121.5133, 'datong'], // Dadaocheng
    [25.0853, 121.5249, 'shilin'], // Shilin night market
    [25.1368, 121.5063, 'beitou'], // Beitou hot spring
    [25.0827, 121.5947, 'neihu'], // Neihu tech park
    [25.0553, 121.6171, 'nangang'], // Nangang station
    [24.9894, 121.5712, 'wenshan'], // Muzha
    [25.0503, 121.5776, 'songshan'], // Raohe night market
    [25.0525, 121.5436, 'zhongshan'], // Zhongshan area
  ])('finds the district of %s,%s → %s', (lat, lng, slug) => {
    expect(findDistrict({ lat, lng })?.slug).toBe(slug);
  });

  it('rejects points outside Taipei', () => {
    expect(isInTaipei({ lat: 25.0339, lng: 121.5645 })).toBe(true);
    expect(isInTaipei({ lat: 25.012, lng: 121.4637 })).toBe(false); // Banqiao
    expect(findDistrict({ lat: 25.012, lng: 121.4637 })).toBeNull();
  });

  it('finds villages', () => {
    const v = findVillage({ lat: 25.0339, lng: 121.5645 });
    expect(v?.district).toBe('63000020');
    expect(v?.name).toMatch(/里$/);
  });

  it('has 12 districts with unique slugs', () => {
    expect(DISTRICTS).toHaveLength(12);
    expect(new Set(DISTRICTS.map((d) => d.slug)).size).toBe(12);
  });
});

describe('scoring', () => {
  it('gives 5000 within the perfect radius', () => {
    expect(roundScore(0, 35)).toBe(5000);
    expect(roundScore(25, 35)).toBe(5000);
  });

  it('decays with distance and is stricter on smaller maps', () => {
    const s1 = roundScore(1000, TAIPEI_DIAGONAL_KM);
    expect(s1).toBeGreaterThan(3600);
    expect(s1).toBeLessThan(3900);
    expect(roundScore(1000, 6)).toBeLessThan(s1);
    expect(roundScore(50_000, TAIPEI_DIAGONAL_KM)).toBeLessThan(10);
  });

  it('handles bad input', () => {
    expect(roundScore(NaN, 35)).toBe(0);
    expect(roundScore(-1, 35)).toBe(0);
  });

  it('formats distances', () => {
    expect(formatDistance(42)).toBe('42 m');
    expect(formatDistance(1234)).toBe('1.23 km');
    expect(formatDistance(12_345)).toBe('12.3 km');
    expect(formatDistance(100, 'imperial')).toBe('328 ft');
  });
});

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = sample([...Array(100).keys()], 5, seededRandom('2026-09-19'));
    const b = sample([...Array(100).keys()], 5, seededRandom('2026-09-19'));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(5);
  });
});

describe('progression', () => {
  it('maps xp to levels consistently', () => {
    for (let l = 1; l < 60; l++) {
      expect(levelFromXp(xpToReachLevel(l))).toBe(l);
      expect(levelFromXp(xpToReachLevel(l + 1) - 1)).toBe(l);
    }
  });

  it('awards medals', () => {
    expect(medalForScore(9_999)).toBeNull();
    expect(medalForScore(15_000)).toBe('silver');
    expect(medalForScore(25_000)).toBe('platinum');
  });

  it('updates elo', () => {
    expect(eloUpdate(1000, 1000, 1, 20)).toBe(1016);
    expect(eloUpdate(1000, 1000, 0, 0)).toBe(980);
  });
});

describe('multiplayer rules', () => {
  it('ramps duel multipliers after round 4', () => {
    expect([1, 4, 5, 6].map(duelMultiplier)).toEqual([1, 1, 1.5, 2]);
    expect(duelRoundDamage(5, { a: 4000, b: 3000 })).toEqual({ damage: 1500, loser: 'b' });
    expect(duelRoundDamage(1, { a: 3000, b: 3000 })).toEqual({ damage: 0, loser: null });
  });

  it('picks BR distance losers', () => {
    const losers = brDistanceLosers([
      { id: 'a', lives: 3, distanceM: 100 },
      { id: 'b', lives: 3, distanceM: 200 },
      { id: 'c', lives: 3, distanceM: 300 },
      { id: 'd', lives: 3, distanceM: 400 },
      { id: 'e', lives: 3, distanceM: null },
      { id: 'f', lives: 0, distanceM: null },
    ]);
    expect([...losers].sort()).toEqual(['d', 'e']);
  });

  it('always leaves a BR survivor', () => {
    const losers = brDistanceLosers([
      { id: 'a', lives: 1, distanceM: 500 },
      { id: 'b', lives: 1, distanceM: 400 },
    ]);
    expect([...losers]).toEqual(['a']);
    const none = brDistanceLosers([
      { id: 'a', lives: 1, distanceM: null },
      { id: 'b', lives: 1, distanceM: null },
    ]);
    expect(none.size).toBe(1);
  });
});
