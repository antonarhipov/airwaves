import type { NoiseType } from '../types/config';
import type { PRNG } from './prng';

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const GRAD2: readonly [number, number][] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * Seeded 2D Simplex & Perlin Gradient Noise generator with FBM and Curl utilities.
 */
export class Noise2D {
  private readonly perm: Uint8Array;
  private readonly permMod8: Uint8Array;
  private readonly mode: NoiseType;

  constructor(rng: PRNG, mode: NoiseType = 'simplex') {
    this.mode = mode;
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    this.permMod8 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod8[i] = this.perm[i] & 7;
    }
  }

  sample(xin: number, yin: number): number {
    return this.mode === 'perlin' ? this.perlin(xin, yin) : this.simplex(xin, yin);
  }

  simplex(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const g0 = GRAD2[this.permMod8[ii + this.perm[jj]]];
      n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const g1 = GRAD2[this.permMod8[ii + i1 + this.perm[jj + j1]]];
      n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const g2 = GRAD2[this.permMod8[ii + 1 + this.perm[jj + 1]]];
      n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2);
    }

    return 45.0 * (n0 + n1 + n2);
  }

  perlin(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = this.permMod8[this.perm[X] + Y];
    const ab = this.permMod8[this.perm[X] + Y + 1];
    const ba = this.permMod8[this.perm[X + 1] + Y];
    const bb = this.permMod8[this.perm[X + 1] + Y + 1];

    const gAA = GRAD2[aa][0] * xf + GRAD2[aa][1] * yf;
    const gBA = GRAD2[ba][0] * (xf - 1) + GRAD2[ba][1] * yf;
    const gAB = GRAD2[ab][0] * xf + GRAD2[ab][1] * (yf - 1);
    const gBB = GRAD2[bb][0] * (xf - 1) + GRAD2[bb][1] * (yf - 1);

    return lerp(lerp(gAA, gBA, u), lerp(gAB, gBB, u), v);
  }

  fbm(x: number, y: number, octaves = 3, lacunarity = 2.02, gain = 0.5): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1.0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.sample(x * freq, y * freq);
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /**
   * Divergence-free 2D curl vector derived from finite differences of FBM potential.
   */
  curl(x: number, y: number, octaves = 3, eps = 0.004): [number, number] {
    const n1 = this.fbm(x, y + eps, octaves);
    const n2 = this.fbm(x, y - eps, octaves);
    const n3 = this.fbm(x + eps, y, octaves);
    const n4 = this.fbm(x - eps, y, octaves);
    const dPsiDy = (n1 - n2) / (2 * eps);
    const dPsiDx = (n3 - n4) / (2 * eps);
    return [dPsiDy, -dPsiDx];
  }
}
