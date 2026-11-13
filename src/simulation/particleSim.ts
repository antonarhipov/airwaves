import { createPRNG } from '../math/prng';
import type { SimParams } from '../types/config';
import { FlowField } from './flowField';

export interface SimulationData {
  particleCount: number;
  /** (x, y, z) normalized coordinates */
  positions: Float32Array;
  /** (vx, vy) unit/scaled flow velocity */
  velocities: Float32Array;
  /** Per-particle scalar attributes: [tColor, sizeSeed, energy, bokehFactor] */
  attributes: Float32Array;
  /** Line-segment pairs for particle trails: [x0, y0, x1, y1, ...] */
  trailPositions: Float32Array;
  /** Per-vertex trail attributes: [tColor, alpha] */
  trailAttributes: Float32Array;
  trailVertexCount: number;
  /** Guiding airwave curve strip segments: [x0, y0, x1, y1, ...] */
  curvePositions: Float32Array;
  /** Per-vertex curve attributes: [tColor, alpha] */
  curveAttributes: Float32Array;
  curveVertexCount: number;
  computeTimeMs: number;
}

/**
 * Pure mathematical particle & guiding-curve simulation.
 * Completely independent of rendering colors, bloom, or typography.
 */
export function runSimulation(params: SimParams): SimulationData {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rng = createPRNG(params.seed);
  const field = new FlowField(params, rng);

  const count = Math.max(500, Math.min(120000, Math.round(params.particleCount)));
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 2);
  const attributes = new Float32Array(count * 4);

  // Trail segments: up to 3 segments per particle for crisp directional motion tails
  const trailParticles = params.trailLength > 0.02 ? Math.min(count, 18000) : 0;
  const trailSegsPerParticle = 3;
  const trailVertexCount = trailParticles * trailSegsPerParticle * 2;
  const trailPositions = new Float32Array(trailVertexCount * 2);
  const trailAttributes = new Float32Array(trailVertexCount * 2);

  const curveCount = field.curves.length;
  const pRng = rng.fork('particles');

  // Precompute curve selection cumulative weights
  const weights = field.curves.map((c) => c.weight);
  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;
  const cdf: number[] = [];
  let accum = 0;
  for (let i = 0; i < weights.length; i++) {
    accum += weights[i] / totalWeight;
    cdf.push(accum);
  }

  const pickCurve = (u: number): number => {
    for (let i = 0; i < cdf.length; i++) {
      if (u <= cdf[i]) return i;
    }
    return cdf.length - 1;
  };

  let trailVertPtr = 0;

  for (let i = 0; i < count; i++) {
    // 1. Sample along-wave parameter s in [0, 1]
    const sRaw = pRng.next();
    // Slight concentration around entry/midstream for natural flow cadence
    const s = Math.min(1, Math.max(0, sRaw));

    const isAmbientBokeh = pRng.next() < (1 - params.densityConcentration) * 0.32;
    const curveIdx = pickCurve(pRng.next());
    const pt = field.evalGuidingCurve(curveIdx, s);

    // 2. Cross-ribbon dispersion (mix tight caustic ridge + wide dreamy spray)
    const ridgeTightness = 0.012 + (1 - params.densityConcentration) * 0.055;
    const wideDispersion = 0.06 + params.dispersion * 0.42;

    let spread: number;
    let isCore = false;
    if (isAmbientBokeh) {
      spread = pRng.gaussian() * (0.28 + params.dispersion * 0.55);
    } else if (pRng.next() < params.densityConcentration * 0.68) {
      spread = pRng.gaussian() * ridgeTightness;
      isCore = true;
    } else {
      spread = pRng.gaussian() * wideDispersion;
    }

    // Perpendicular vector to curve tangent
    const nx = -pt.ty;
    const ny = pt.tx;

    let x = pt.x + nx * spread + pRng.gaussian() * 0.008;
    let y = pt.y + ny * spread + pRng.gaussian() * 0.008;

    // 3. Coherent noise & attractor warping
    [x, y] = field.warpPoint(x, y, isCore ? 0.88 : 1.15);

    // 4. Deterministic RK2 advection step along vector field
    const [vx0, vy0] = field.sampleField(x, y);
    const advectStep = (0.02 + params.turbulence * 0.045) * (isCore ? 0.5 : 1.0);
    const mx = x + vx0 * advectStep * 0.5;
    const my = y + vy0 * advectStep * 0.5;
    const [vx1, vy1] = field.sampleField(mx, my);
    x += vx1 * advectStep;
    y += vy1 * advectStep;

    // 5. Depth Z in [-1, 1]: core ridge stays near focal plane z ~ 0, outer particles drift to bokeh depth
    const zNoise = pRng.gaussian() * (isCore ? 0.16 : 0.52);
    const z = Math.max(-1, Math.min(1, zNoise + (isAmbientBokeh ? pRng.range(-0.4, 0.4) : 0)));

    // 6. Particle size distribution
    let sizeSeed = 1.0;
    const sv = params.sizeVariance;
    if (params.sizeDistribution === 'bimodal-bokeh') {
      const r = pRng.next();
      if (r < 0.045) {
        // Large out-of-focus bokeh orbs
        sizeSeed = 4.5 + pRng.next() * 7.5 * (0.4 + sv);
      } else if (r < 0.18) {
        // Medium glowing pearls
        sizeSeed = 1.8 + pRng.next() * 2.2 * (0.4 + sv);
      } else {
        // Crisp pinpoint sparks
        sizeSeed = 0.55 + Math.pow(pRng.next(), 2.0) * 1.45;
      }
    } else if (params.sizeDistribution === 'power-law') {
      sizeSeed = 0.45 + Math.pow(pRng.next(), 4.2) * (6.5 * sv + 1.5);
    } else if (params.sizeDistribution === 'uniform') {
      sizeSeed = 0.8 + pRng.next() * (1.5 * sv + 0.3);
    } else {
      // fine-dust
      sizeSeed = 0.4 + pRng.next() * (0.85 * sv + 0.25);
    }

    // 7. Energy & Safe Zone attenuation
    const safeMask = field.safeZoneMask(x, y);
    const distFromRidge = Math.abs(spread) / (wideDispersion + 0.01);
    const ridgeEnergy = isCore ? 1.0 : Math.max(0.15, Math.exp(-distFromRidge * 1.4));
    const energy = ridgeEnergy * safeMask * (0.7 + 0.3 * pRng.next());

    // 8. Color parameter t in [0, 1] along wave + subtle curve offset
    const curveShift = curveCount > 1 ? ((curveIdx / (curveCount - 1)) - 0.5) * 0.1 : 0;
    const tColor = Math.max(0, Math.min(1, s + curveShift + pRng.range(-0.04, 0.04)));

    const bokehFactor = isAmbientBokeh ? 1.0 : Math.min(1, Math.abs(z));

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const vLen = Math.hypot(vx1, vy1) || 1;
    velocities[i * 2] = vx1 / vLen;
    velocities[i * 2 + 1] = vy1 / vLen;

    attributes[i * 4] = tColor;
    attributes[i * 4 + 1] = sizeSeed;
    attributes[i * 4 + 2] = energy;
    attributes[i * 4 + 3] = bokehFactor;

    // 9. Deterministic particle advection trails
    if (i < trailParticles) {
      let tx = x;
      let ty = y;
      const stepLen = params.trailLength * 0.026 * (isCore ? 1.15 : 0.85);
      for (let seg = 0; seg < trailSegsPerParticle; seg++) {
        const [fvx, fvy] = field.sampleField(tx, ty);
        const fLen = Math.hypot(fvx, fvy) || 1;
        const nxPos = tx - (fvx / fLen) * stepLen;
        const nyPos = ty - (fvy / fLen) * stepLen;

        const alpha0 = energy * (1 - seg / trailSegsPerParticle) * 0.7;
        const alpha1 = energy * (1 - (seg + 1) / trailSegsPerParticle) * 0.7;

        trailPositions[trailVertPtr * 2] = tx;
        trailPositions[trailVertPtr * 2 + 1] = ty;
        trailAttributes[trailVertPtr * 2] = tColor;
        trailAttributes[trailVertPtr * 2 + 1] = alpha0;
        trailVertPtr++;

        trailPositions[trailVertPtr * 2] = nxPos;
        trailPositions[trailVertPtr * 2 + 1] = nyPos;
        trailAttributes[trailVertPtr * 2] = tColor;
        trailAttributes[trailVertPtr * 2 + 1] = alpha1;
        trailVertPtr++;

        tx = nxPos;
        ty = nyPos;
      }
    }
  }

  // 10. Generate smooth guiding airwave filament curves ("subtle clues of the airwaves")
  const stepsPerCurve = 140;
  const segsPerCurve = stepsPerCurve - 1;
  const curveVertexCount = curveCount * segsPerCurve * 2;
  const curvePositions = new Float32Array(curveVertexCount * 2);
  const curveAttributes = new Float32Array(curveVertexCount * 2);

  let curvePtr = 0;
  for (let c = 0; c < curveCount; c++) {
    const spec = field.curves[c];
    const ptsX = new Float32Array(stepsPerCurve);
    const ptsY = new Float32Array(stepsPerCurve);
    const ptsAlpha = new Float32Array(stepsPerCurve);

    for (let j = 0; j < stepsPerCurve; j++) {
      const s = j / (stepsPerCurve - 1);
      const raw = field.evalGuidingCurve(c, s);
      const [wx, wy] = field.warpPoint(raw.x, raw.y, 0.92);
      const edgeFade = Math.sin(s * Math.PI);
      const safeMask = field.safeZoneMask(wx, wy);
      ptsX[j] = wx;
      ptsY[j] = wy;
      ptsAlpha[j] = (spec.isOuterArc ? 0.55 : 0.95) * Math.pow(edgeFade, 0.45) * safeMask;
    }

    for (let j = 0; j < segsPerCurve; j++) {
      const s0 = j / (stepsPerCurve - 1);
      const s1 = (j + 1) / (stepsPerCurve - 1);

      curvePositions[curvePtr * 2] = ptsX[j];
      curvePositions[curvePtr * 2 + 1] = ptsY[j];
      curveAttributes[curvePtr * 2] = s0;
      curveAttributes[curvePtr * 2 + 1] = ptsAlpha[j];
      curvePtr++;

      curvePositions[curvePtr * 2] = ptsX[j + 1];
      curvePositions[curvePtr * 2 + 1] = ptsY[j + 1];
      curveAttributes[curvePtr * 2] = s1;
      curveAttributes[curvePtr * 2 + 1] = ptsAlpha[j + 1];
      curvePtr++;
    }
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    particleCount: count,
    positions,
    velocities,
    attributes,
    trailPositions,
    trailAttributes,
    trailVertexCount,
    curvePositions,
    curveAttributes,
    curveVertexCount,
    computeTimeMs: Math.round((t1 - t0) * 10) / 10,
  };
}
