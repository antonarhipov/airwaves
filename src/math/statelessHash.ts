/**
 * Stateless integer bit-mixing, low-discrepancy Halton sequences, and permutation-free
 * 2D/3D gradient noise primitives (MurmurHash3 finalizers) guaranteeing O(1) per-particle
 * determinism across CPU and WebGL2 GLSL3.
 */

export function murmurMix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function hashIntPair(i: number, seed: number): number {
  const h = (Math.imul(i | 0, 0x9e3779b1) ^ murmurMix32(seed)) >>> 0;
  return murmurMix32(h);
}

export function hashIntToFloat(i: number, seed: number): number {
  return hashIntPair(i, seed) / 4294967296;
}

export function hashLattice2D(ix: number, iy: number, seed: number): number {
  const h =
    (Math.imul(ix | 0, 0x9e3779b1) ^
      Math.imul(iy | 0, 0x85ebca77) ^
      (seed >>> 0)) >>>
    0;
  return murmurMix32(h);
}

export function hashLattice3D(ix: number, iy: number, iz: number, seed: number): number {
  const h =
    (Math.imul(ix | 0, 0x9e3779b1) ^
      Math.imul(iy | 0, 0x85ebca77) ^
      Math.imul(iz | 0, 0xc2b2ae3d) ^
      (seed >>> 0)) >>>
    0;
  return murmurMix32(h);
}

/**
 * Low-discrepancy Halton radical-inverse sequence in any integer base >= 2.
 */
export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = Math.max(1, Math.floor(index));
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad2(ix: number, iy: number, dx: number, dy: number, seed: number): number {
  const h = hashLattice2D(ix, iy, seed) & 7;
  switch (h) {
    case 0:
      return dx + dy;
    case 1:
      return -dx + dy;
    case 2:
      return dx - dy;
    case 3:
      return -dx - dy;
    case 4:
      return dx * 1.41421356;
    case 5:
      return -dx * 1.41421356;
    case 6:
      return dy * 1.41421356;
    default:
      return -dy * 1.41421356;
  }
}

export function noise2DStateless(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fade(fx);
  const v = fade(fy);

  const n00 = grad2(ix, iy, fx, fy, seed);
  const n10 = grad2(ix + 1, iy, fx - 1, fy, seed);
  const n01 = grad2(ix, iy + 1, fx, fy - 1, seed);
  const n11 = grad2(ix + 1, iy + 1, fx - 1, fy - 1, seed);

  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return (nx0 + (nx1 - nx0) * v) * 0.72;
}

export function fbm2DStateless(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1.0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise2DStateless(x * freq, y * freq, (seed + Math.imul(o + 1, 0x27d4eb2d)) >>> 0) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return norm > 0 ? sum / norm : 0;
}

function grad3(ix: number, iy: number, iz: number, dx: number, dy: number, dz: number, seed: number): number {
  const h = hashLattice3D(ix, iy, iz, seed) & 15;
  const u = h < 8 ? dx : dy;
  const v = h < 4 ? dy : h === 12 || h === 14 ? dx : dz;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function noise3DStateless(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);

  const n000 = grad3(ix, iy, iz, fx, fy, fz, seed);
  const n100 = grad3(ix + 1, iy, iz, fx - 1, fy, fz, seed);
  const n010 = grad3(ix, iy + 1, iz, fx, fy - 1, fz, seed);
  const n110 = grad3(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz, seed);
  const n001 = grad3(ix, iy, iz + 1, fx, fy, fz - 1, seed);
  const n101 = grad3(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1, seed);
  const n011 = grad3(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1, seed);
  const n111 = grad3(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1, seed);

  const nx00 = n000 + (n100 - n000) * u;
  const nx10 = n010 + (n110 - n010) * u;
  const nx01 = n001 + (n101 - n001) * u;
  const nx11 = n011 + (n111 - n011) * u;

  const nxy0 = nx00 + (nx10 - nx00) * v;
  const nxy1 = nx01 + (nx11 - nx01) * v;
  return (nxy0 + (nxy1 - nxy0) * w) * 0.68;
}

function potentialPsi(x: number, y: number, z: number, seed: number): [number, number, number] {
  const s1 = (seed ^ 0x9e3779b9) >>> 0;
  const s2 = (seed ^ 0x85ebca6b) >>> 0;
  const s3 = (seed ^ 0xc2b2ae35) >>> 0;
  return [
    noise3DStateless(x, y, z, s1) + 0.45 * noise3DStateless(x * 2.03 + 7.1, y * 2.03 - 3.4, z * 2.03, s1),
    noise3DStateless(x + 31.7, y - 17.3, z + 11.9, s2) +
      0.45 * noise3DStateless(x * 2.03 + 19.2, y * 2.03 + 5.7, z * 2.03 - 9.1, s2),
    noise3DStateless(x - 13.4, y + 29.1, z - 23.8, s3) +
      0.45 * noise3DStateless(x * 2.03 - 6.3, y * 2.03 + 14.8, z * 2.03 + 4.2, s3),
  ];
}

/**
 * Divergence-free 3D curl displacement field F_curl(p) = grad x Psi(p).
 */
export function curl3DStateless(x: number, y: number, z: number, seed: number): [number, number, number] {
  const eps = 0.004;
  const inv2Eps = 0.5 / eps;

  const [, py1, pz1] = potentialPsi(x + eps, y, z, seed);
  const [, py0, pz0] = potentialPsi(x - eps, y, z, seed);
  const dPyDx = (py1 - py0) * inv2Eps;
  const dPzDx = (pz1 - pz0) * inv2Eps;

  const [px2, , pz2] = potentialPsi(x, y + eps, z, seed);
  const [px3, , pz3] = potentialPsi(x, y - eps, z, seed);
  const dPxDy = (px2 - px3) * inv2Eps;
  const dPzDy = (pz2 - pz3) * inv2Eps;

  const [px4, py4] = potentialPsi(x, y, z + eps, seed);
  const [px5, py5] = potentialPsi(x, y, z - eps, seed);
  const dPxDz = (px4 - px5) * inv2Eps;
  const dPyDz = (py4 - py5) * inv2Eps;

  return [dPzDy - dPyDz, dPxDz - dPzDx, dPyDx - dPxDy];
}
