import { hashSeed } from '../math/prng';
import { curl3DStateless, fbm2DStateless, halton, hashIntToFloat, murmurMix32 } from '../math/statelessHash';
import type { LandscapeParams, SimParams } from '../types/config';
import { FIELD_GRID_H, FIELD_GRID_W, getSafeZoneTarget } from './flowField';
import type { SimulationData } from './particleSim';

export const DEFAULT_LANDSCAPE_PARAMS: LandscapeParams = {
  ridgeRatio: 0.7,
  ridgeSharpness: 3.2,
  worldWidth: 18.0,
  worldDepth: 7.0,
  planeSlopeAlpha: 0.28,
  planeTiltBeta: 0.14,
  curlScale: 2.8,
  curlCoreStrength: 0.25,
  curlOuterStrength: 1.15,
  terrainRoughness: 0.42,
  focalDepth: 12.5,
  apertureScale: 3.8,
  bokehDecay: 1.65,
  coreIncandescence: 0.75,
};

export interface LandscapeMetadata {
  seedU32: number;
  curvature: number;
  dispersion: number;
  params: LandscapeParams;
  /** [u_i, v_i, sizeSeed, isRidge] per particle */
  particleDomain: Float32Array;
  /** [u_j, v_m] per streamline curve vertex */
  curveDomain: Float32Array;
}

export function resolveLandscapeParams(sim: SimParams): LandscapeParams {
  return {
    ...DEFAULT_LANDSCAPE_PARAMS,
    ...(sim.landscape ?? {}),
  };
}

export interface EvaluatedLandscapeSample {
  xWorld: number;
  yWorld: number;
  zWorld: number;
  xNdc: number;
  yNdc: number;
  zCam: number;
  cocDepth: number;
  tColor: number;
}

/**
 * Closed-form O(1) evaluator for Section 3 (Base Perspective Plane + Multi-Harmonic Elevation + 2D fBm),
 * Section 4 (Divergence-Free 3D Curl Turbulence with Envelope E(u,v)), and
 * Section 6.1 (3D Camera Perspective Transform) at any continuous time tSec.
 */
export function evaluateLandscapePoint(
  u: number,
  v: number,
  tSec: number,
  curvature: number,
  dispersion: number,
  lp: LandscapeParams,
  seedU32: number,
  aspect = 16 / 9,
  includeCurl = true,
): EvaluatedLandscapeSample {
  const curv = Math.max(0.2, curvature);
  const x0 = (u - 0.5) * lp.worldWidth;
  const z0 = v * lp.worldDepth;
  const yPlane = lp.planeSlopeAlpha * x0 + lp.planeTiltBeta * z0;

  // Multi-harmonic rolling sine crests (K = 3)
  const h1 = 1.28 * curv * Math.sin(4.2 * curv * u + 0.42 * z0 - 0.85 * tSec + 0.35);
  const h2 = 0.54 * curv * Math.sin(7.4 * curv * u - 0.55 * z0 - 1.35 * tSec + 1.85);
  const h3 = 0.16 * curv * Math.sin(10.8 * curv * u + 0.72 * z0 - 1.85 * tSec + 0.92);

  // 2D stateless fBm terrain relief
  const relief = includeCurl ? lp.terrainRoughness * 0.75 * fbm2DStateless(u * 2.8, v * 2.2, seedU32, 3) : 0;
  const y0 = yPlane + h1 + h2 + h3 + relief;

  let xWorld = x0;
  let yWorld = y0;
  let zWorld = z0;
  if (includeCurl) {
    // Section 4.2: Envelope-modulated 3D divergence-free curl displacement
    const invCurlScale = 1.0 / Math.max(0.35, lp.curlScale);
    const driftX = tSec * 0.18;
    const driftY = -tSec * 0.09;
    const driftZ = tSec * 0.12;
    const [cx, cy, cz] = curl3DStateless(
      x0 * invCurlScale + driftX,
      y0 * invCurlScale + driftY,
      z0 * invCurlScale + driftZ,
      seedU32,
    );

    const dispBoost = 0.65 + dispersion * 1.1;
    const gamma0 = lp.curlCoreStrength * 0.45 * dispBoost;
    const gamma1 = lp.curlOuterStrength * dispBoost;
    const gamma2 = 0.28 * 0.55 * dispBoost;
    const sinPiU = Math.sin(Math.PI * u);
    const absV = Math.abs(v);
    const envelope = gamma0 + gamma1 * Math.pow(absV, 1.4) + gamma2 * sinPiU * sinPiU;

    xWorld += envelope * cx;
    yWorld += envelope * cy;
    zWorld += envelope * cz;
  }

  // Section 6.1: Camera pitch transform & perspective projection
  const camPitch = -0.18;
  const cosP = Math.cos(camPitch);
  const sinP = Math.sin(camPitch);
  const xc = xWorld;
  const yc = yWorld * cosP + zWorld * sinP;
  const zc = Math.max(2.0, lp.focalDepth + (-yWorld * sinP + zWorld * cosP));

  const focalProj = 2.48;
  const xNdc = (focalProj * xc) / (zc * Math.max(0.4, aspect));
  const yNdc = (focalProj * yc) / zc;

  // Section 6.3: Spectral parameter s = clamp(u + dv*v + dy*y0, 0, 1)
  const tColor = Math.max(0, Math.min(1, u + 0.08 * v + 0.055 * y0));

  return {
    xWorld,
    yWorld,
    zWorld,
    xNdc,
    yNdc,
    zCam: zc,
    cocDepth: Math.abs(zc - lp.focalDepth),
    tColor,
  };
}

/**
 * Compute full SimulationData + closed-form LandscapeMetadata for the
 * Deterministic Airwave Particle Landscape Generator specification.
 */
export function generateLandscapeSimulation(params: SimParams): SimulationData {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const lp = resolveLandscapeParams(params);
  // Mask to 31-bit non-negative int so CPU & GLSL3 `uint(uSeed)` match identically
  const seedU32 = hashSeed(params.seed) & 0x7fffffff;

  const offsetU = (murmurMix32(seedU32 ^ 0x13572468) % 8192) + 1;
  const offsetV = (murmurMix32(seedU32 ^ 0x24681357) % 8192) + 17;

  const count = Math.max(500, Math.min(120000, Math.round(params.particleCount)));
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 2);
  const attributes = new Float32Array(count * 4);
  const particleDomain = new Float32Array(count * 4);

  const ridgeSharpness = Math.max(1.2, lp.ridgeSharpness * (0.65 + params.densityConcentration * 0.45));
  const dustScatter = 1.15 + params.dispersion * 0.95;
  const safeZone = getSafeZoneTarget(params.safeZone, params.safeZoneRadius);
  const safeZoneAtten = (nx: number, ny: number): number => {
    if (!safeZone || params.safeZoneStrength <= 0.001) return 1.0;
    const dx = (nx - safeZone.x) / Math.max(0.05, safeZone.rx);
    const dy = (ny - safeZone.y) / Math.max(0.05, safeZone.ry);
    const dist = Math.hypot(dx, dy);
    if (dist >= 1.35) return 1.0;
    const smooth = Math.max(0, Math.min(1, (dist - 0.35) / 1.0));
    const eased = smooth * smooth * (3 - 2 * smooth);
    return 1.0 - params.safeZoneStrength * (1.0 - eased);
  };

  for (let i = 0; i < count; i++) {
    // Section 2.1: Low-discrepancy 2D Halton sequence (bases 2 and 3)
    const u = halton(i + offsetU, 2);
    const vRaw = 2.0 * halton(i + offsetV, 3) - 1.0;

    // Section 2.2: Stateless integer hash partition into Ridge vs Ambient Dust
    const hRoll = hashIntToFloat(i + 1, seedU32);
    const hSize = hashIntToFloat(i + 100003, seedU32 ^ 0x4b1d9c3f);
    const hSpark = hashIntToFloat(i + 200009, seedU32 ^ 0x7a3e21b5);

    const isRidge = hRoll < lp.ridgeRatio;
    const v = isRidge
      ? Math.sign(vRaw) * Math.pow(Math.abs(vRaw), ridgeSharpness)
      : vRaw * dustScatter;

    let sizeSeed: number;
    if (isRidge) {
      sizeSeed = hSpark < 0.015 ? 1.9 + hSize * 1.1 : 0.48 + Math.pow(hSize, 1.8) * 0.92;
    } else {
      sizeSeed = hSize > 0.88 ? 2.2 + hSize * 2.8 * (0.5 + params.sizeVariance) : 0.44 + hSize * 1.1;
    }

    // GPU GLSL3 evaluates full 3D fBm + Curl in hardware O(1); CPU keeps fast perspective projection
    const pt = evaluateLandscapePoint(
      u,
      v,
      0,
      params.curvature,
      params.dispersion,
      lp,
      seedU32,
      16 / 9,
      false,
    );

    // Map NDC-scaled normalized space for generic CPU assertions & fallback buffers
    const normX = (pt.xNdc * (16 / 9)) / 1.25;
    const normY = pt.yNdc / 1.15;
    positions[i * 3] = normX;
    positions[i * 3 + 1] = normY;
    positions[i * 3 + 2] = Math.max(-1, Math.min(1, (pt.zCam - lp.focalDepth) / 4.5));

    velocities[i * 2] = 0.98;
    velocities[i * 2 + 1] = lp.planeSlopeAlpha * 0.6;

    const rMin = 1.1;
    const rBokeh = rMin + lp.apertureScale * pt.cocDepth;
    const energyConserv = Math.pow(rMin / rBokeh, lp.bokehDecay);
    const edgeU = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.75);
    const edgeV = Math.exp(-0.55 * v * v);
    const safeMask = safeZoneAtten(normX, normY);
    const energy = (isRidge ? 1.15 : 0.75) * energyConserv * edgeU * edgeV * 2.5 * safeMask;

    attributes[i * 4] = pt.tColor;
    attributes[i * 4 + 1] = sizeSeed;
    attributes[i * 4 + 2] = Math.max(0.05, Math.min(2.0, energy));
    attributes[i * 4 + 3] = Math.min(1, pt.cocDepth / 3.5);

    particleDomain[i * 4] = u;
    particleDomain[i * 4 + 1] = v;
    particleDomain[i * 4 + 2] = sizeSeed;
    particleDomain[i * 4 + 3] = isRidge ? 1.0 : 0.0;
  }

  // Section 5: M continuous streamlines evaluated across J = 160 uniform u subdivisions
  const filamentCount = Math.max(1, Math.round(params.guidingCurves));
  const stepsPerCurve = 160;
  const segsPerCurve = stepsPerCurve - 1;
  const curveVertexCount = filamentCount * segsPerCurve * 2;
  const curvePositions = new Float32Array(curveVertexCount * 2);
  const curveAttributes = new Float32Array(curveVertexCount * 2);
  const curveDomain = new Float32Array(curveVertexCount * 2);

  let curvePtr = 0;
  for (let m = 0; m < filamentCount; m++) {
    // Stratified Chebyshev-clustered lateral coordinates in [-0.85, 0.85]
    const normM = filamentCount === 1 ? 0 : (m / (filamentCount - 1)) * 2 - 1;
    const jitter = (hashIntToFloat(m + 503, seedU32 ^ 0x6f2a1d9b) - 0.5) * 0.04;
    const vm = Math.sign(normM) * Math.pow(Math.abs(normM), 1.45) * 0.85 + jitter;

    const ptsX = new Float32Array(stepsPerCurve);
    const ptsY = new Float32Array(stepsPerCurve);
    const ptsAlpha = new Float32Array(stepsPerCurve);
    const ptsT = new Float32Array(stepsPerCurve);
    const ptsU = new Float32Array(stepsPerCurve);

    for (let j = 0; j < stepsPerCurve; j++) {
      const uj = j / (stepsPerCurve - 1);
      const pt = evaluateLandscapePoint(uj, vm, 0, params.curvature, params.dispersion, lp, seedU32);
      ptsX[j] = (pt.xNdc * (16 / 9)) / 1.25;
      ptsY[j] = pt.yNdc / 1.15;
      ptsT[j] = pt.tColor;
      ptsU[j] = uj;

      const endFade = Math.pow(Math.max(0, Math.sin(uj * Math.PI)), 0.55);
      const depthFade = 1.0 / (1.0 + pt.cocDepth * 0.45);
      ptsAlpha[j] = 0.85 * endFade * depthFade;
    }

    for (let j = 0; j < segsPerCurve; j++) {
      curvePositions[curvePtr * 2] = ptsX[j];
      curvePositions[curvePtr * 2 + 1] = ptsY[j];
      curveAttributes[curvePtr * 2] = ptsT[j];
      curveAttributes[curvePtr * 2 + 1] = ptsAlpha[j];
      curveDomain[curvePtr * 2] = ptsU[j];
      curveDomain[curvePtr * 2 + 1] = vm;
      curvePtr++;

      curvePositions[curvePtr * 2] = ptsX[j + 1];
      curvePositions[curvePtr * 2 + 1] = ptsY[j + 1];
      curveAttributes[curvePtr * 2] = ptsT[j + 1];
      curveAttributes[curvePtr * 2 + 1] = ptsAlpha[j + 1];
      curveDomain[curvePtr * 2] = ptsU[j + 1];
      curveDomain[curvePtr * 2 + 1] = vm;
      curvePtr++;
    }
  }

  const fieldGrid = new Float32Array(FIELD_GRID_W * FIELD_GRID_H * 2);
  for (let i = 0; i < FIELD_GRID_W * FIELD_GRID_H; i++) {
    fieldGrid[i * 2] = 0.96;
    fieldGrid[i * 2 + 1] = lp.planeSlopeAlpha;
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    particleCount: count,
    positions,
    velocities,
    attributes,
    trailPositions: new Float32Array(0),
    trailAnchors: new Float32Array(0),
    trailAttributes: new Float32Array(0),
    trailVertexCount: 0,
    curvePositions,
    curveAttributes,
    curveVertexCount,
    fieldGrid,
    fieldGridWidth: FIELD_GRID_W,
    fieldGridHeight: FIELD_GRID_H,
    landscape: {
      seedU32,
      curvature: params.curvature,
      dispersion: params.dispersion,
      params: lp,
      particleDomain,
      curveDomain,
    },
    computeTimeMs: Math.round((t1 - t0) * 10) / 10,
  };
}
