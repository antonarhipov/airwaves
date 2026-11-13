/**
 * Deterministic seeded PRNG utilities (FNV-1a hash + Mulberry32).
 * Guarantees 100% reproducible results across browsers and sessions for any seed string.
 */

export function hashSeed(seed: string | number): number {
  const str = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface PRNG {
  /** Uniform float in [0, 1) */
  next: () => number;
  /** Uniform float in [min, max) */
  range: (min: number, max: number) => number;
  /** Approximate standard normal N(0, 1) via Box-Muller */
  gaussian: () => number;
  /** Fork a deterministic sub-stream without mutating parent state */
  fork: (salt: string) => PRNG;
}

export function createPRNG(seed: string | number): PRNG {
  let state = hashSeed(seed) || 0x9e3779b9;
  let spareGaussian: number | null = null;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const gaussian = (): number => {
    if (spareGaussian !== null) {
      const val = spareGaussian;
      spareGaussian = null;
      return val;
    }
    const u1 = Math.max(1e-7, next());
    const u2 = next();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    spareGaussian = mag * Math.sin(2.0 * Math.PI * u2);
    return mag * Math.cos(2.0 * Math.PI * u2);
  };

  const fork = (salt: string): PRNG => createPRNG(`${String(seed)}::${salt}`);

  return { next, range, gaussian, fork };
}

export function generateRandomSeed(): string {
  const prefixes = ['IDEA', 'WAVE', 'AERO', 'FLUX', 'ECHO', 'NOVA', 'PRISM', 'DRIFT'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const code = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${code}`;
}
