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
  const isAcousticMode = params.fieldMode === 'acoustic-caustic';
  const isAirflowMode = params.fieldMode === 'airflow-streamlines';
  const stepsPerCurve = isAcousticMode || isAirflowMode ? 220 : 140;

  // Stage 5 (Airflow): integrate true vector-field streamlines dP/ds = F(P)/|F(P)|
  const integratedStreamlines: Array<{ x: Float32Array; y: Float32Array }> = [];
  if (isAirflowMode) {
    field.ensureFieldGrid();
    const isRadial =
      params.composition === 'radial-flow' || params.flowDirection === 'radial';
    for (let c = 0; c < curveCount; c++) {
      const frac = curveCount === 1 ? 0 : (c / (curveCount - 1)) * 2 - 1;
      let x0: number;
      let y0: number;
      if (isRadial) {
        const ang = (c / Math.max(1, curveCount)) * Math.PI * 2;
        const r0 = 0.14 + (c % 2) * 0.12;
        x0 = Math.cos(ang) * r0;
        y0 = Math.sin(ang) * r0 * 0.75;
      } else {
        const u0 = -1.55;
        const v0 = frac * (0.28 + params.dispersion * 0.22) - 0.03;
        x0 = field.dirX * u0 + field.perpX * v0;
        y0 = field.dirY * u0 + field.perpY * v0;
      }
      integratedStreamlines.push(field.integrateStreamline(x0, y0, stepsPerCurve, 0.0155));
    }
  }

  // Partition core braided curves vs outer echo filaments when in acoustic-caustic mode
  const coreCurveIndices: number[] = [];
  const outerCurveIndices: number[] = [];
  for (let i = 0; i < curveCount; i++) {
    if (field.curves[i].isOuterArc) {
      outerCurveIndices.push(i);
    } else {
      coreCurveIndices.push(i);
    }
  }
  if (coreCurveIndices.length === 0) {
    for (let i = 0; i < curveCount; i++) coreCurveIndices.push(i);
  }

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
    let x = 0;
    let y = 0;
    let z = 0;
    let vx1 = field.dirX;
    let vy1 = field.dirY;
    let sizeSeed = 1.0;
    let energy = 1.0;
    let tColor = 0.5;
    let bokehFactor = 0;
    let isCore = false;

    if (isAirflowMode) {
      // Stage 2: Deterministic multi-sheet emission across viewport flow span
      const isRadial =
        params.composition === 'radial-flow' || params.flowDirection === 'radial';
      const roleRoll = pRng.next();
      const isBokehOrb = roleRoll > 0.968;
      const isGlintStar = !isBokehOrb && roleRoll < 0.0055;
      const isMistSpray = !isBokehOrb && !isGlintStar && roleRoll > 0.78;
      const sheetIdx = pRng.next() < 0.56 ? 0 : pRng.next() < 0.68 ? 1 : 2;

      if (isRadial) {
        const ang = pRng.next() * Math.PI * 2;
        const r0 = 0.06 + Math.pow(pRng.next(), 0.85) * 0.92;
        x = Math.cos(ang) * r0;
        y = Math.sin(ang) * r0 * 0.78;
      } else {
        const u0 = pRng.range(-1.62, 1.15);
        const sheetCenter = sheetIdx === 0 ? -0.02 : sheetIdx === 1 ? 0.16 : -0.18;
        const bandWidth = isBokehOrb
          ? 0.20 + params.dispersion * 0.36
          : isMistSpray
            ? 0.06 + params.dispersion * 0.16
            : (0.012 + (1 - params.densityConcentration) * 0.055) * (sheetIdx === 0 ? 0.9 : 1.35);
        const v0 = sheetCenter + pRng.gaussian() * bandWidth;
        x = field.dirX * u0 + field.perpX * v0;
        y = field.dirY * u0 + field.perpY * v0;
      }

      // Stage 3: Multi-step RK2 particle trajectory advection through F(x, y)
      const steps = isBokehOrb ? 8 : 14 + Math.floor(pRng.next() * 14);
      const dt = 0.024;
      for (let st = 0; st < steps; st++) {
        const [kx0, ky0] = field.sampleFieldCached(x, y);
        const mx = x + kx0 * dt * 0.5;
        const my = y + ky0 * dt * 0.5;
        const [kx1, ky1] = field.sampleFieldCached(mx, my);
        x += kx1 * dt;
        y += ky1 * dt;
        vx1 = kx1;
        vy1 = ky1;
      }

      const speed = Math.hypot(vx1, vy1);
      // Local optical DoF plane & subtle sheet z-layering
      if (isBokehOrb) {
        const signZ = pRng.next() < 0.5 ? -1 : 1;
        z = signZ * (0.58 + pRng.next() * 0.42);
      } else if (isMistSpray) {
        z = Math.max(-1, Math.min(1, pRng.gaussian() * 0.18));
      } else {
        const zLayer = (sheetIdx - 1) * 0.07;
        z = Math.max(-1, Math.min(1, zLayer + pRng.gaussian() * 0.065));
      }

      // Size distribution: crisp micro-dust silk sheets + selective edge bokeh + peak star glints
      const sv = params.sizeVariance;
      if (isBokehOrb) {
        sizeSeed = 4.4 + pRng.next() * 7.2 * (0.45 + sv);
      } else if (isGlintStar) {
        sizeSeed = 2.0 + pRng.next() * 1.5;
      } else if (params.sizeDistribution === 'bimodal-bokeh') {
        const rSize = pRng.next();
        sizeSeed = rSize < 0.08 ? 1.45 + pRng.next() * 1.25 : 0.46 + Math.pow(pRng.next(), 1.9) * 0.85;
      } else if (params.sizeDistribution === 'power-law') {
        sizeSeed = 0.42 + Math.pow(pRng.next(), 3.8) * (4.8 * sv + 1.1);
      } else if (params.sizeDistribution === 'uniform') {
        sizeSeed = 0.72 + pRng.next() * (1.25 * sv + 0.3);
      } else {
        sizeSeed = 0.42 + pRng.next() * (0.75 * sv + 0.25);
      }

      // Stage 4 & 6: Natural visual density energy & prism region/sheet color mapping
      const safeMask = field.safeZoneMask(x, y);
      const uFinal = x * field.dirX + y * field.dirY;
      const vFinal = x * field.perpX + y * field.perpY;
      const uNorm = Math.max(0, Math.min(1, (uFinal + 1.48) / 2.96));
      const sheetShift = sheetIdx === 0 ? 0.0 : sheetIdx === 1 ? 0.26 : -0.22;
      const velShift = Math.max(-0.1, Math.min(0.1, (speed - 1.0) * 0.15));
      const verticalTint = Math.max(-0.12, Math.min(0.12, vFinal * 0.16));

      tColor = Math.max(0, Math.min(1, uNorm * 0.72 + 0.14 + sheetShift + velShift + verticalTint + pRng.range(-0.025, 0.025)));
      const velEnergy = Math.min(1.4, 0.75 + speed * 0.42);
      const baseEnergy = isBokehOrb
        ? 0.78 + 0.45 * pRng.next()
        : isGlintStar
          ? 1.62 + pRng.next() * 0.24
          : isMistSpray
            ? velEnergy * (0.45 + 0.35 * pRng.next())
            : velEnergy * (0.88 + 0.42 * pRng.next());
      energy = baseEnergy * safeMask;
      bokehFactor = isBokehOrb ? 1.0 : Math.min(1, Math.abs(z));
    } else if (isAcousticMode) {
      // Slightly higher density near left entry flare + smooth full span
      const uRand = pRng.next();
      const s = Math.min(1, Math.max(0, uRand < 0.28 ? Math.pow(pRng.next(), 1.35) : uRand));
      const roleRoll = pRng.next();
      const spineShare = 0.18;
      const coreShare = spineShare + 0.16 + params.densityConcentration * 0.14;
      const sheetShare = coreShare + 0.24;
      const mistShare = sheetShare + 0.24 * (0.45 + params.dispersion);

      let phi = pRng.next() * Math.PI * 2;
      let radialScale = 1.0;
      let extraOffset = 0;
      let spread = 0;
      let isSpine = false;
      let isBokehOrb = false;
      let isOuterBead = false;
      let curveShift = 0;

      if (roleRoll < spineShare) {
        // Primary glowing caustic crest fold (theta1 = PI/2)
        isCore = true;
        isSpine = true;
        const twistScale = 0.85 + 0.25 * params.curvature;
        phi = Math.PI * 0.5 - s * Math.PI * field.acoustic.twistFreq1 * twistScale;
        phi += pRng.gaussian() * 0.22;
        spread = pRng.gaussian() * (0.0075 + (1 - params.densityConcentration) * 0.02);
        curveShift = pRng.range(-0.02, 0.02);
      } else if (roleRoll < coreShare) {
        // Lock tightly to braided harmonic strands
        isCore = true;
        const cIdx = coreCurveIndices[Math.floor(pRng.next() * coreCurveIndices.length)];
        const spec = field.curves[cIdx];
        phi = spec.phase;
        extraOffset = spec.ribbonOffset * 0.4;
        spread = pRng.gaussian() * (0.004 + (1 - params.densityConcentration) * 0.015);
        curveShift = ((cIdx / Math.max(1, curveCount - 1)) - 0.5) * 0.06;
      } else if (roleRoll < sheetShare) {
        // Continuous twisted surface fill (creates natural braided caustic meshes)
        isCore = true;
        spread = pRng.gaussian() * (0.009 + params.dispersion * 0.032);
        curveShift = Math.sin(phi) * 0.04;
      } else if (roleRoll < Math.min(0.958, mistShare)) {
        // Crisp pinpoint micro-dust billowing cleanly off the wave crests
        spread = pRng.gaussian() * (0.042 + params.dispersion * 0.19);
        curveShift = Math.cos(phi) * 0.06;
      } else if (outerCurveIndices.length > 0 && roleRoll < 0.985) {
        // Crisp luminous beads traveling along outer airwave arcs
        isCore = true;
        isOuterBead = true;
        const oIdx = outerCurveIndices[Math.floor(pRng.next() * outerCurveIndices.length)];
        const spec = field.curves[oIdx];
        phi = spec.phase;
        radialScale = spec.outerScale;
        extraOffset = spec.ribbonOffset;
        spread = pRng.gaussian() * 0.0022;
      } else {
        // Sparse discrete optical DoF bokeh discs (~1.5% of total particles so sky stays dark & clean)
        isBokehOrb = true;
        const edgeSide = pRng.next() < 0.5 ? 1 : -1;
        spread = edgeSide * (0.05 + pRng.next() * (0.26 + params.dispersion * 0.36));
      }

      const pt = field.evalAcousticRibbon(s, phi, radialScale, extraOffset);
      const [wx, wy] = field.warpPoint(pt.x, pt.y, 0.92);
      const nx = -pt.ty;
      const ny = pt.tx;

      const microJitter = isCore ? 0.0022 : 0.012;
      x = wx + nx * spread + pt.tx * pRng.gaussian() * microJitter;
      y = wy + ny * spread + pt.ty * pRng.gaussian() * microJitter;

      // Subtle tangent flow along field (preserves sharp braided silhouette)
      const [fx, fy] = field.sampleField(x, y);
      vx1 = isCore ? pt.tx * 0.78 + fx * 0.22 : fx;
      vy1 = isCore ? pt.ty * 0.78 + fy * 0.22 : fy;
      if (!isCore && !isOuterBead) {
        const advect = (0.004 + params.turbulence * 0.018) * (isBokehOrb ? 1.3 : 1.0);
        x += vx1 * advect;
        y += vy1 * advect;
      }

      // Depth Z: crisp pinpoint dust & strands stay near focal plane z=0; only sparse bokeh/outer mist blur subtly
      if (isBokehOrb) {
        const signZ = pRng.next() < 0.5 ? -1 : 1;
        z = signZ * (0.54 + pRng.next() * 0.44);
      } else if (isSpine) {
        z = Math.max(-1, Math.min(1, pRng.gaussian() * 0.035));
      } else if (isCore) {
        z = Math.max(-1, Math.min(1, pt.z * 0.14 + pRng.gaussian() * 0.055));
      } else {
        z = Math.max(-1, Math.min(1, pt.z * 0.22 + pRng.gaussian() * 0.12));
      }

      // Size distribution engineered for needle-crisp sparkling grains vs selective lens bokeh
      const sv = params.sizeVariance;
      if (params.sizeDistribution === 'bimodal-bokeh') {
        if (isBokehOrb) {
          sizeSeed = 4.8 + pRng.next() * 7.6 * (0.45 + sv);
        } else if (isOuterBead) {
          sizeSeed = 0.95 + pRng.next() * 1.4;
        } else if (isSpine) {
          const rSize = pRng.next();
          sizeSeed = rSize < 0.1 ? 1.25 + pRng.next() * 0.95 : 0.45 + Math.pow(pRng.next(), 2.0) * 0.65;
        } else if (isCore) {
          const rSize = pRng.next();
          sizeSeed = rSize < 0.06 ? 1.15 + pRng.next() * 0.85 : 0.42 + Math.pow(pRng.next(), 2.1) * 0.62;
        } else {
          const rMist = pRng.next();
          sizeSeed = rMist < 0.035 ? 1.45 + pRng.next() * 1.2 : 0.38 + Math.pow(pRng.next(), 2.2) * (0.85 + sv * 0.45);
        }
      } else if (params.sizeDistribution === 'power-law') {
        sizeSeed = (isBokehOrb ? 2.8 : 0.42) + Math.pow(pRng.next(), 3.8) * (5.2 * sv + 1.2);
      } else if (params.sizeDistribution === 'uniform') {
        sizeSeed = 0.72 + pRng.next() * (1.25 * sv + 0.3);
      } else {
        sizeSeed = 0.45 + pRng.next() * (0.78 * sv + 0.25);
      }

      const safeMask = field.safeZoneMask(x, y);
      const ridgeFalloff = Math.exp(-Math.abs(spread) / (0.065 + params.dispersion * 0.16));
      const sparkle = 0.62 + 0.45 * Math.pow(pRng.next(), 1.8);
      const causticWeight = isSpine
        ? 1.04 + pt.causticBoost * 0.34
        : isCore
          ? 0.82 + pt.causticBoost * 0.35
          : ridgeFalloff * 0.92;
      energy =
        (isBokehOrb ? 0.58 + 0.38 * pRng.next() : causticWeight * sparkle) *
        safeMask *
        (isOuterBead ? 1.18 : 1.0);

      tColor = Math.max(0, Math.min(1, s + curveShift + pRng.range(-0.025, 0.025)));
      bokehFactor = isBokehOrb ? 1.0 : Math.min(1, Math.abs(z));
    } else {
      // Legacy particle sampling for harmonic-ribbon, curl-noise, vortex-stream, interference
      const s = Math.min(1, Math.max(0, pRng.next()));
      const isAmbientBokeh = pRng.next() < (1 - params.densityConcentration) * 0.32;
      const curveIdx = pickCurve(pRng.next());
      const pt = field.evalGuidingCurve(curveIdx, s);

      const ridgeTightness = 0.012 + (1 - params.densityConcentration) * 0.055;
      const wideDispersion = 0.06 + params.dispersion * 0.42;

      let spread: number;
      if (isAmbientBokeh) {
        spread = pRng.gaussian() * (0.28 + params.dispersion * 0.55);
      } else if (pRng.next() < params.densityConcentration * 0.68) {
        spread = pRng.gaussian() * ridgeTightness;
        isCore = true;
      } else {
        spread = pRng.gaussian() * wideDispersion;
      }

      const nx = -pt.ty;
      const ny = pt.tx;

      x = pt.x + nx * spread + pRng.gaussian() * 0.008;
      y = pt.y + ny * spread + pRng.gaussian() * 0.008;

      [x, y] = field.warpPoint(x, y, isCore ? 0.88 : 1.15);

      const [vx0, vy0] = field.sampleField(x, y);
      const advectStep = (0.02 + params.turbulence * 0.045) * (isCore ? 0.5 : 1.0);
      const mx = x + vx0 * advectStep * 0.5;
      const my = y + vy0 * advectStep * 0.5;
      [vx1, vy1] = field.sampleField(mx, my);
      x += vx1 * advectStep;
      y += vy1 * advectStep;

      const zNoise = pRng.gaussian() * (isCore ? 0.16 : 0.52);
      z = Math.max(-1, Math.min(1, zNoise + (isAmbientBokeh ? pRng.range(-0.4, 0.4) : 0)));

      const sv = params.sizeVariance;
      if (params.sizeDistribution === 'bimodal-bokeh') {
        const r = pRng.next();
        if (r < 0.045) {
          sizeSeed = 4.5 + pRng.next() * 7.5 * (0.4 + sv);
        } else if (r < 0.18) {
          sizeSeed = 1.8 + pRng.next() * 2.2 * (0.4 + sv);
        } else {
          sizeSeed = 0.55 + Math.pow(pRng.next(), 2.0) * 1.45;
        }
      } else if (params.sizeDistribution === 'power-law') {
        sizeSeed = 0.45 + Math.pow(pRng.next(), 4.2) * (6.5 * sv + 1.5);
      } else if (params.sizeDistribution === 'uniform') {
        sizeSeed = 0.8 + pRng.next() * (1.5 * sv + 0.3);
      } else {
        sizeSeed = 0.4 + pRng.next() * (0.85 * sv + 0.25);
      }

      const safeMask = field.safeZoneMask(x, y);
      const distFromRidge = Math.abs(spread) / (wideDispersion + 0.01);
      const ridgeEnergy = isCore ? 1.0 : Math.max(0.15, Math.exp(-distFromRidge * 1.4));
      energy = ridgeEnergy * safeMask * (0.7 + 0.3 * pRng.next());

      const curveShift = curveCount > 1 ? ((curveIdx / (curveCount - 1)) - 0.5) * 0.1 : 0;
      tColor = Math.max(0, Math.min(1, s + curveShift + pRng.range(-0.04, 0.04)));
      bokehFactor = isAmbientBokeh ? 1.0 : Math.min(1, Math.abs(z));
    }

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
      const stepLen =
        params.trailLength *
        (isAcousticMode ? 0.014 : isAirflowMode ? 0.019 : 0.026) *
        (isCore ? 1.15 : 0.85);
      for (let seg = 0; seg < trailSegsPerParticle; seg++) {
        const [fvx, fvy] = isAirflowMode ? field.sampleFieldCached(tx, ty) : field.sampleField(tx, ty);
        const fLen = Math.hypot(fvx, fvy) || 1;
        const nxPos = tx - (fvx / fLen) * stepLen;
        const nyPos = ty - (fvy / fLen) * stepLen;

        const trailBase = isAcousticMode ? (isCore ? 0.85 : 0.35) : isAirflowMode ? 0.55 : 0.7;
        const alpha0 = energy * (1 - seg / trailSegsPerParticle) * trailBase;
        const alpha1 = energy * (1 - (seg + 1) / trailSegsPerParticle) * trailBase;

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

  // 10. Generate smooth guiding airwave filament curves / streamlines ("dP/ds = F(P)/|F(P)|")
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

    if (isAirflowMode) {
      const stream = integratedStreamlines[c];
      for (let j = 0; j < stepsPerCurve; j++) {
        const s = j / (stepsPerCurve - 1);
        const wx = stream.x[j];
        const wy = stream.y[j];
        const edgeFade = Math.sin(s * Math.PI);
        const safeMask = field.safeZoneMask(wx, wy);
        ptsX[j] = wx;
        ptsY[j] = wy;
        ptsAlpha[j] = 0.88 * Math.pow(edgeFade, 0.38) * safeMask;
      }
    } else {
      for (let j = 0; j < stepsPerCurve; j++) {
        const s = j / (stepsPerCurve - 1);
        const raw = field.evalGuidingCurve(c, s);
        const [wx, wy] = field.warpPoint(raw.x, raw.y, 0.92);
        const edgeFade = Math.sin(s * Math.PI);
        const safeMask = field.safeZoneMask(wx, wy);
        ptsX[j] = wx;
        ptsY[j] = wy;
        const baseAlpha = isAcousticMode ? (spec.isOuterArc ? 0.52 : 0.95) : spec.isOuterArc ? 0.55 : 0.95;
        ptsAlpha[j] = baseAlpha * Math.pow(edgeFade, isAcousticMode ? 0.35 : 0.45) * safeMask;
      }
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
