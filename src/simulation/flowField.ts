import { Noise2D } from '../math/noise';
import type { PRNG } from '../math/prng';
import type { SafeZonePreset, SimParams } from '../types/config';

export interface SafeZoneTarget {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export function getSafeZoneTarget(preset: SafeZonePreset, radius: number): SafeZoneTarget | null {
  if (preset === 'none') return null;
  switch (preset) {
    case 'top-left':
      return { x: -0.56, y: 0.44, rx: radius * 1.25, ry: radius * 0.78 };
    case 'bottom-left':
      return { x: -0.56, y: -0.44, rx: radius * 1.25, ry: radius * 0.78 };
    case 'top-right':
      return { x: 0.54, y: 0.44, rx: radius * 1.25, ry: radius * 0.78 };
    case 'center':
      return { x: 0.0, y: 0.02, rx: radius * 1.3, ry: radius * 0.8 };
  }
}

export interface CurveSpec {
  phase: number;
  freq1: number;
  freq2: number;
  amp1: number;
  amp2: number;
  ribbonOffset: number;
  isOuterArc: boolean;
  weight: number;
  outerScale: number;
}

export interface AcousticRibbonParams {
  twistFreq1: number;
  twistFreq2: number;
  carrierPhase: number;
  foldPhase: number;
  pinchPos: number;
  envelopeBase: number;
}

export interface GaussianVortex {
  x: number;
  y: number;
  strength: number;
  radiusSq: number;
}

export interface RibbonPoint {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  causticBoost: number;
}

const GRID_W = 200;
const GRID_H = 120;
const GRID_X_MIN = -1.85;
const GRID_X_MAX = 1.85;
const GRID_Y_MIN = -1.25;
const GRID_Y_MAX = 1.25;

export class FlowField {
  readonly params: SimParams;
  readonly noise: Noise2D;
  readonly curves: CurveSpec[];
  readonly acoustic: AcousticRibbonParams;
  readonly vortices: GaussianVortex[];
  readonly safeZone: SafeZoneTarget | null;
  readonly dirX: number;
  readonly dirY: number;
  readonly perpX: number;
  readonly perpY: number;
  private fieldGrid: Float32Array | null = null;

  constructor(params: SimParams, rng: PRNG) {
    this.params = params;
    this.noise = new Noise2D(rng.fork('noise'), params.noiseType);
    this.safeZone = getSafeZoneTarget(params.safeZone, params.safeZoneRadius);

    // Determine carrier axis angle from composition & flowDirection + fine flowAngle
    let baseDeg = params.flowAngle;
    if (params.composition === 'horizontal-flow' || params.flowDirection === 'horizontal') {
      baseDeg = params.flowAngle * 0.35;
    } else if (params.composition === 'vertical-flow' || params.flowDirection === 'vertical') {
      baseDeg = 90 + params.flowAngle * 0.35;
    } else if (params.composition === 'central-wave') {
      baseDeg = params.flowAngle * 0.25;
    } else if (params.composition === 'diagonal-flow' || params.flowDirection === 'diagonal') {
      baseDeg = 16 + params.flowAngle * 0.42;
    }

    const rad = (baseDeg * Math.PI) / 180;
    this.dirX = Math.cos(rad);
    this.dirY = Math.sin(rad);
    this.perpX = -this.dirY;
    this.perpY = this.dirX;

    const waveRng = rng.fork('acoustic');
    this.acoustic = {
      twistFreq1: 1.55 + waveRng.range(-0.18, 0.24),
      twistFreq2: 2.95 + waveRng.range(-0.28, 0.34),
      carrierPhase: waveRng.range(-0.28, 0.28),
      foldPhase: waveRng.range(0, Math.PI * 2),
      pinchPos: waveRng.range(0.16, 0.26),
      envelopeBase: 0.14 + waveRng.range(0.0, 0.05),
    };

    const vortexRng = rng.fork('vortices');
    this.vortices = [];
    for (let i = 0; i < 3; i++) {
      const sign = i % 2 === 0 ? 1 : -1;
      const r = vortexRng.range(0.26, 0.48);
      this.vortices.push({
        x: vortexRng.range(-0.95, 0.95),
        y: vortexRng.range(-0.38, 0.38),
        strength: sign * vortexRng.range(0.22, 0.45),
        radiusSq: r * r,
      });
    }

    const count = Math.max(1, Math.round(params.guidingCurves));
    const curveRng = rng.fork('curves');
    this.curves = [];

    if (params.fieldMode === 'acoustic-caustic') {
      const outerCount = count >= 5 ? Math.max(2, Math.round(count * 0.26)) : 0;
      const coreCount = Math.max(1, count - outerCount);

      for (let i = 0; i < coreCount; i++) {
        const phase = (i / coreCount) * Math.PI * 2 + curveRng.range(-0.07, 0.07);
        this.curves.push({
          phase,
          freq1: this.acoustic.twistFreq1,
          freq2: this.acoustic.twistFreq2,
          amp1: 0.22,
          amp2: 0.075,
          ribbonOffset: ((i / Math.max(1, coreCount - 1)) * 2 - 1) * 0.035,
          isOuterArc: false,
          weight: i === 0 ? 1.25 : 0.95,
          outerScale: 1.0,
        });
      }

      for (let i = 0; i < outerCount; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const tier = Math.floor(i / 2);
        const phase = (side > 0 ? 0.45 : Math.PI + 0.45) + curveRng.range(-0.25, 0.25);
        this.curves.push({
          phase,
          freq1: 1.15 + tier * 0.18,
          freq2: 2.1,
          amp1: 0.28,
          amp2: 0.05,
          ribbonOffset: side * (0.11 + tier * 0.085),
          isOuterArc: true,
          weight: 0.18,
          outerScale: 1.75 + tier * 0.55,
        });
      }
    } else {
      for (let i = 0; i < count; i++) {
        const norm = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
        const isOuter = i >= count - 2 && count >= 5;
        const spreadScale = isOuter ? 1.85 : 0.45;
        this.curves.push({
          phase: curveRng.range(0, Math.PI * 2),
          freq1: curveRng.range(1.15, 2.15),
          freq2: curveRng.range(2.2, 3.8),
          amp1: (0.18 + curveRng.range(0.04, 0.16)) * (isOuter ? 1.55 : 1.0),
          amp2: 0.06 + curveRng.range(0.01, 0.07),
          ribbonOffset: norm * 0.16 * spreadScale + curveRng.range(-0.04, 0.04),
          isOuterArc: isOuter,
          weight: isOuter ? 0.28 : 1.0 - Math.abs(norm) * 0.35,
          outerScale: isOuter ? 1.45 : 1.0,
        });
      }
    }
  }

  /**
   * Evaluate the continuous 3D twisted acoustic-caustic ribbon surface at
   * longitudinal parameter s in [0, 1] and cross-strand phase phi in [0, 2*PI).
   * Overlapping folds produce natural caustic brightness spines and braided loops.
   */
  evalAcousticRibbon(s: number, phi: number, radialScale = 1.0, extraOffset = 0): RibbonPoint {
    const curv = this.params.curvature;
    const isRadial =
      this.params.composition === 'radial-flow' || this.params.flowDirection === 'radial';

    if (isRadial) {
      const baseAngle = phi + s * Math.PI * (1.1 + this.params.vortexStrength * 0.65);
      const r =
        0.08 +
        s * 1.18 +
        Math.sin(s * Math.PI * this.acoustic.twistFreq1 + phi) * 0.09 * curv * radialScale +
        extraOffset * 0.45;
      const rx = Math.cos(baseAngle) * r;
      const ry = Math.sin(baseAngle) * r * 0.72;
      const z = Math.max(-1, Math.min(1, Math.cos(s * Math.PI * this.acoustic.twistFreq1 + phi) * 0.55));
      const dTheta = Math.PI * (1.1 + this.params.vortexStrength * 0.65);
      const tx = Math.cos(baseAngle) * 1.18 - Math.sin(baseAngle) * r * dTheta;
      const ty = (Math.sin(baseAngle) * 1.18 + Math.cos(baseAngle) * r * dTheta) * 0.72;
      const len = Math.hypot(tx, ty) || 1;
      const foldSlope = Math.abs(Math.cos(s * Math.PI * this.acoustic.twistFreq1 + phi));
      return { x: rx, y: ry, z, tx: tx / len, ty: ty / len, causticBoost: 1 - foldSlope };
    }

    const evalScalar = (sVal: number): { u: number; v: number; z: number; causticBoost: number } => {
      const u = (sVal - 0.5) * 3.05;
      // Smooth S-curve acoustic carrier spine entering low-left and climbing toward upper-right
      const carrier =
        Math.sin(u * 1.25 * curv + this.acoustic.carrierPhase) * 0.165 * curv +
        Math.cos(u * 0.68 - 0.35) * 0.08 * curv -
        0.095;

      // Envelope pinches tightly near left entry/waist and opens into braided crests downstream
      const isCentral = this.params.composition === 'central-wave';
      const entryPinch = 0.06 + 0.94 * Math.pow(Math.max(0.001, sVal), 0.78);
      const nodePinch =
        0.52 + 0.48 * Math.abs(Math.sin((sVal - this.acoustic.pinchPos) * Math.PI * 1.45));
      const envelope =
        (isCentral ? 0.35 + 0.72 * Math.sin(Math.max(0, Math.min(1, sVal)) * Math.PI) : entryPinch) *
        nodePinch *
        (this.acoustic.envelopeBase + 0.095 * Math.min(1.8, curv));

      const theta1 = sVal * Math.PI * this.acoustic.twistFreq1 * (0.85 + 0.25 * curv) + phi;
      const theta2 =
        sVal * Math.PI * this.acoustic.twistFreq2 + phi * 2.0 + this.acoustic.foldPhase;

      const sheet = Math.sin(theta1) * 0.78 + Math.sin(theta2) * 0.24;
      const v = carrier + radialScale * (envelope * sheet + extraOffset * (0.42 + 0.68 * sVal));
      const z = Math.max(-1, Math.min(1, Math.cos(theta1) * 0.52));

      // Derivative |dv/dphi| -> 0 marks optical caustic fold ridges where strands stack tightly
      const dvdPhi = Math.abs(0.78 * Math.cos(theta1) + 0.48 * Math.cos(theta2));
      const causticBoost = Math.exp(-dvdPhi * 3.2);

      return { u, v, z, causticBoost };
    };

    const p0 = evalScalar(s);
    const ds = 0.003;
    const p1 = evalScalar(s + ds);
    const dv = p1.v - p0.v;
    const du = p1.u - p0.u;

    const x = this.dirX * p0.u + this.perpX * p0.v;
    const y = this.dirY * p0.u + this.perpY * p0.v;
    let tx = this.dirX * du + this.perpX * dv;
    let ty = this.dirY * du + this.perpY * dv;
    const tLen = Math.hypot(tx, ty) || 1;
    tx /= tLen;
    ty /= tLen;

    return { x, y, z: p0.z, tx, ty, causticBoost: p0.causticBoost };
  }

  /**
   * Evaluate a guiding harmonic curve at parameter s in [0, 1].
   * Returns position (x, y) in normalized aspect-scaled coordinates and tangent direction.
   */
  evalGuidingCurve(curveIdx: number, s: number): { x: number; y: number; tx: number; ty: number } {
    const curve = this.curves[curveIdx % this.curves.length];
    if (this.params.fieldMode === 'acoustic-caustic') {
      const pt = this.evalAcousticRibbon(
        s,
        curve.phase,
        curve.outerScale,
        curve.isOuterArc ? curve.ribbonOffset : curve.ribbonOffset * 0.4,
      );
      return { x: pt.x, y: pt.y, tx: pt.tx, ty: pt.ty };
    }
    const curv = this.params.curvature;

    if (this.params.composition === 'radial-flow' || this.params.flowDirection === 'radial') {
      const baseAngle = curve.phase + s * Math.PI * (1.2 + this.params.vortexStrength * 0.8);
      const r = 0.06 + s * 1.15 + Math.sin(s * Math.PI * curve.freq1 + curve.phase) * 0.12 * curv;
      const rx = Math.cos(baseAngle) * r;
      const ry = Math.sin(baseAngle) * r * 0.72;
      const dTheta = Math.PI * (1.2 + this.params.vortexStrength * 0.8);
      const tx = Math.cos(baseAngle) * 1.15 - Math.sin(baseAngle) * r * dTheta;
      const ty = (Math.sin(baseAngle) * 1.15 + Math.cos(baseAngle) * r * dTheta) * 0.72;
      const len = Math.hypot(tx, ty) || 1;
      return { x: rx, y: ry, tx: tx / len, ty: ty / len };
    }

    // Main axis parameter u in [-1.35, 1.35] so wave enters and exits frame cleanly
    const u = (s - 0.5) * 2.65;

    // Harmonic S-wave carrier + subtle braiding per curve
    const carrier =
      Math.sin(u * 1.45 * curv + 0.45) * 0.18 * curv +
      Math.cos(u * 0.85 - 0.3) * 0.08 * curv;

    const harmonic =
      Math.sin(u * curve.freq1 * (0.75 + 0.35 * curv) + curve.phase) * curve.amp1 * curv +
      Math.sin(u * curve.freq2 + curve.phase * 1.7) * curve.amp2 * curv;

    // Pinching envelope: tighter entry on left/start, fanning out gently toward right/end
    const fanEnvelope =
      this.params.composition === 'central-wave'
        ? 0.55 + 0.45 * Math.sin(s * Math.PI)
        : 0.32 + 0.88 * Math.pow(s, 0.85);

    const v = (carrier + (harmonic + curve.ribbonOffset) * fanEnvelope) - 0.06;

    // Derivative dv/du for tangent alignment
    const du = 0.005;
    const u2 = u + du;
    const s2 = s + du / 2.65;
    const carrier2 =
      Math.sin(u2 * 1.45 * curv + 0.45) * 0.18 * curv +
      Math.cos(u2 * 0.85 - 0.3) * 0.08 * curv;
    const harmonic2 =
      Math.sin(u2 * curve.freq1 * (0.75 + 0.35 * curv) + curve.phase) * curve.amp1 * curv +
      Math.sin(u2 * curve.freq2 + curve.phase * 1.7) * curve.amp2 * curv;
    const fan2 =
      this.params.composition === 'central-wave'
        ? 0.55 + 0.45 * Math.sin(s2 * Math.PI)
        : 0.32 + 0.88 * Math.pow(Math.max(0, s2), 0.85);
    const v2 = (carrier2 + (harmonic2 + curve.ribbonOffset) * fan2) - 0.06;
    const dvdu = (v2 - v) / du;

    const x = this.dirX * u + this.perpX * v;
    const y = this.dirY * u + this.perpY * v;

    let tx = this.dirX + this.perpX * dvdu;
    let ty = this.dirY + this.perpY * dvdu;
    const tLen = Math.hypot(tx, ty) || 1;
    tx /= tLen;
    ty /= tLen;

    return { x, y, tx, ty };
  }

  /**
   * Compute safe-zone attenuation factor in [0, 1] (0 = deep inside text safe zone, 1 = unaffected).
   */
  safeZoneMask(x: number, y: number): number {
    if (!this.safeZone || this.params.safeZoneStrength <= 0.001) return 1.0;
    const dx = (x - this.safeZone.x) / Math.max(0.05, this.safeZone.rx);
    const dy = (y - this.safeZone.y) / Math.max(0.05, this.safeZone.ry);
    const dist = Math.hypot(dx, dy);
    if (dist >= 1.35) return 1.0;
    const smooth = Math.max(0, Math.min(1, (dist - 0.35) / 1.0));
    const eased = smooth * smooth * (3 - 2 * smooth);
    return 1.0 - this.params.safeZoneStrength * (1.0 - eased);
  }

  /**
   * Precompute 2D bilinearly interpolated vector field cache for high-speed RK2 integration.
   */
  ensureFieldGrid(): Float32Array {
    if (this.fieldGrid) return this.fieldGrid;
    const grid = new Float32Array(GRID_W * GRID_H * 2);
    for (let j = 0; j < GRID_H; j++) {
      const y = GRID_Y_MIN + (j / (GRID_H - 1)) * (GRID_Y_MAX - GRID_Y_MIN);
      for (let i = 0; i < GRID_W; i++) {
        const x = GRID_X_MIN + (i / (GRID_W - 1)) * (GRID_X_MAX - GRID_X_MIN);
        const [vx, vy] = this.sampleField(x, y);
        const idx = (j * GRID_W + i) * 2;
        grid[idx] = vx;
        grid[idx + 1] = vy;
      }
    }
    this.fieldGrid = grid;
    return grid;
  }

  /**
   * Fast bilinear sampling of F(x, y) from the deterministic grid cache.
   */
  sampleFieldCached(x: number, y: number): [number, number] {
    const grid = this.ensureFieldGrid();
    const fx = ((x - GRID_X_MIN) / (GRID_X_MAX - GRID_X_MIN)) * (GRID_W - 1);
    const fy = ((y - GRID_Y_MIN) / (GRID_Y_MAX - GRID_Y_MIN)) * (GRID_H - 1);
    const ix = Math.max(0, Math.min(GRID_W - 2, Math.floor(fx)));
    const iy = Math.max(0, Math.min(GRID_H - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - ix));
    const ty = Math.max(0, Math.min(1, fy - iy));

    const i00 = (iy * GRID_W + ix) * 2;
    const i10 = i00 + 2;
    const i01 = i00 + GRID_W * 2;
    const i11 = i01 + 2;

    const vx0 = grid[i00] + (grid[i10] - grid[i00]) * tx;
    const vx1 = grid[i01] + (grid[i11] - grid[i01]) * tx;
    const vy0 = grid[i00 + 1] + (grid[i10 + 1] - grid[i00 + 1]) * tx;
    const vy1 = grid[i01 + 1] + (grid[i11 + 1] - grid[i01 + 1]) * tx;

    return [vx0 + (vx1 - vx0) * ty, vy0 + (vy1 - vy0) * ty];
  }

  /**
   * Integrate a streamline dP/ds = F(P) / |F(P)| via RK2 from an emission anchor.
   */
  integrateStreamline(x0: number, y0: number, steps: number, ds: number): { x: Float32Array; y: Float32Array } {
    const xs = new Float32Array(steps);
    const ys = new Float32Array(steps);
    let x = x0;
    let y = y0;

    for (let i = 0; i < steps; i++) {
      xs[i] = x;
      ys[i] = y;
      const [vx0, vy0] = this.sampleFieldCached(x, y);
      const len0 = Math.hypot(vx0, vy0) || 1;
      const mx = x + (vx0 / len0) * ds * 0.5;
      const my = y + (vy0 / len0) * ds * 0.5;
      const [vx1, vy1] = this.sampleFieldCached(mx, my);
      const len1 = Math.hypot(vx1, vy1) || 1;
      x += (vx1 / len1) * ds;
      y += (vy1 / len1) * ds;
    }

    return { x: xs, y: ys };
  }

  /**
   * Sample deterministic 2D vector field at (x, y) for advection, turbulence,
   * Gaussian vortices, attractors/repellers, and curl noise.
   */
  sampleField(x: number, y: number): [number, number] {
    const { fieldMode, noiseScale, noiseOctaves, turbulence, vortexStrength, attractors, curvature } =
      this.params;

    let vx = this.dirX * 0.65;
    let vy = this.dirY * 0.65;

    if (fieldMode === 'airflow-streamlines') {
      const isRadial =
        this.params.composition === 'radial-flow' || this.params.flowDirection === 'radial';
      if (isRadial) {
        const r = Math.hypot(x, y) + 0.08;
        const theta = Math.atan2(y, x);
        const wave = Math.sin(theta * 3.0 + r * 4.5 * curvature) * 0.35 * curvature;
        vx = (-y / r) * (0.75 + wave) + (x / r) * 0.42;
        vy = (x / r) * (0.75 + wave) + (y / r) * 0.42;
      } else {
        // Rotate into flow coordinates (u along stream, v perpendicular)
        const u = x * this.dirX + y * this.dirY;
        const v = x * this.perpX + y * this.perpY;
        const curv = Math.max(0.15, curvature);

        // Dual braided carrier wave guides create converging & crossing silky sheets
        const phase1 = u * 2.55 * curv + this.acoustic.carrierPhase;
        const phase2 = u * 4.15 * curv + this.acoustic.foldPhase;
        const carrier1 = 0.28 * curv * Math.sin(phase1) + 0.08 * curv * Math.sin(phase2) - 0.04;
        const slope1 = 0.28 * curv * 2.55 * curv * Math.cos(phase1) + 0.08 * curv * 4.15 * curv * Math.cos(phase2);

        const carrier2 = -0.22 * curv * Math.sin(u * 2.05 * curv - this.acoustic.carrierPhase) + 0.03;
        const slope2 = -0.22 * curv * 2.05 * curv * Math.cos(u * 2.05 * curv - this.acoustic.carrierPhase);

        const d1 = carrier1 - v;
        const d2 = carrier2 - v;
        const w1 = Math.exp(-d1 * d1 * 6.8);
        const w2 = Math.exp(-d2 * d2 * 5.2);

        // Tangential harmonic wave velocity + crisp convergence toward wave caustics
        const fu = 1.0 + 0.14 * Math.cos(u * 2.1 + v * 2.4);
        const fvWave = slope1 * (0.55 + 0.45 * w1) + slope2 * 0.38 * w2 + 0.12 * curv * Math.cos(u * 3.1 + v * 2.2);
        const fvConverge = d1 * 1.85 * w1 + d2 * 0.85 * w2;
        const fv = fvWave + fvConverge;

        vx = this.dirX * fu + this.perpX * fv;
        vy = this.dirY * fu + this.perpY * fv;
      }

      // Deterministic Gaussian vortices (localized rotational eddies)
      const vScale = vortexStrength * 1.15;
      if (Math.abs(vScale) > 0.001) {
        for (let i = 0; i < this.vortices.length; i++) {
          const vor = this.vortices[i];
          const dx = x - vor.x;
          const dy = y - vor.y;
          const d2 = dx * dx + dy * dy;
          const swirl = vor.strength * vScale * Math.exp(-d2 / vor.radiusSq);
          vx += -dy * swirl;
          vy += dx * swirl;
        }
      }
    } else if (fieldMode === 'acoustic-caustic' || fieldMode === 'harmonic-ribbon') {
      const waveY = Math.cos(x * 1.45 * curvature + 0.4) * 0.28 * curvature;
      vx = this.dirX + this.perpX * waveY;
      vy = this.dirY + this.perpY * waveY;
    } else if (fieldMode === 'curl-noise') {
      const [cx, cy] = this.noise.curl(x * noiseScale, y * noiseScale, noiseOctaves);
      vx = this.dirX * 0.45 + cx * 0.9;
      vy = this.dirY * 0.45 + cy * 0.9;
    } else if (fieldMode === 'vortex-stream') {
      const r = Math.hypot(x, y) + 0.08;
      vx = -y / r + this.dirX * 0.35;
      vy = x / r + this.dirY * 0.35;
    } else if (fieldMode === 'interference') {
      const p1 = Math.sin(x * 3.1 * noiseScale + y * 1.4);
      const p2 = Math.cos(y * 2.8 * noiseScale - x * 1.8);
      vx = this.dirX * 0.5 + p1 * 0.65;
      vy = this.dirY * 0.5 + p2 * 0.65;
    }

    // Add FBM / Curl turbulence
    if (turbulence > 0.001) {
      const [cx, cy] = this.noise.curl(
        x * noiseScale * 1.15 + 4.2,
        y * noiseScale * 1.15 - 2.7,
        noiseOctaves,
      );
      const turbScale = fieldMode === 'airflow-streamlines' ? 0.52 : 0.42;
      vx += cx * turbulence * turbScale;
      vy += cy * turbulence * turbScale;
    }

    // Add global vortex swirl
    if (Math.abs(vortexStrength) > 0.001) {
      const r2 = x * x + y * y + 0.12;
      const swirl = vortexStrength / (1.0 + r2 * 1.8);
      const globalSwirlScale = fieldMode === 'airflow-streamlines' ? 0.28 : 0.55;
      vx += -y * swirl * globalSwirlScale;
      vy += x * swirl * globalSwirlScale;
    }

    // Apply attractors (+) and repellers (-)
    for (let i = 0; i < attractors.length; i++) {
      const att = attractors[i];
      const dx = att.x - x;
      const dy = att.y - y;
      const distSq = dx * dx + dy * dy + 0.015;
      const dist = Math.sqrt(distSq);
      const r = Math.max(0.1, att.radius);
      const falloff = Math.exp(-distSq / (r * r));
      const pull = (att.strength * falloff) / dist;
      // Radial attraction/repulsion + gentle orbital twist
      vx += dx * pull * 0.72 - dy * pull * 0.32;
      vy += dy * pull * 0.72 + dx * pull * 0.32;
    }

    // Safe zone gentle deflection
    if (this.safeZone && this.params.safeZoneStrength > 0.01) {
      const dx = x - this.safeZone.x;
      const dy = y - this.safeZone.y;
      const nx = dx / Math.max(0.08, this.safeZone.rx);
      const ny = dy / Math.max(0.08, this.safeZone.ry);
      const d2 = nx * nx + ny * ny;
      if (d2 < 1.6) {
        const push = (1.6 - d2) * 0.35 * this.params.safeZoneStrength;
        const d = Math.sqrt(d2) + 0.05;
        vx += (nx / d) * push;
        vy += (ny / d) * push;
      }
    }

    return [vx, vy];
  }

  /**
   * Warp a point through the noise + attractor displacement field so both
   * particles and guiding curves deform coherently.
   */
  warpPoint(x: number, y: number, strength = 1.0): [number, number] {
    const { fieldMode, noiseScale, noiseOctaves, turbulence, vortexStrength, attractors } =
      this.params;
    const isRibbon = fieldMode === 'acoustic-caustic';
    const freqScale = isRibbon ? noiseScale * 0.48 : noiseScale;
    const octaves = isRibbon ? Math.min(2, noiseOctaves) : noiseOctaves;
    const turbAmp = isRibbon ? 0.068 : 0.14;
    const vortexAmp = isRibbon ? 0.16 : 0.35;
    const attAmp = isRibbon ? 0.18 : 0.28;

    let wx = x;
    let wy = y;

    if (turbulence > 0.001) {
      const [cx, cy] = this.noise.curl(
        x * freqScale + 1.7,
        y * freqScale - 0.9,
        octaves,
      );
      wx += cx * turbulence * turbAmp * strength;
      wy += cy * turbulence * turbAmp * strength;
    }

    if (Math.abs(vortexStrength) > 0.001) {
      const r2 = wx * wx + wy * wy;
      const angle = vortexStrength * vortexAmp * Math.exp(-r2 * 1.1) * strength;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const rx = wx * cosA - wy * sinA;
      const ry = wx * sinA + wy * cosA;
      wx = rx;
      wy = ry;
    }

    for (let i = 0; i < attractors.length; i++) {
      const att = attractors[i];
      const dx = att.x - wx;
      const dy = att.y - wy;
      const d2 = dx * dx + dy * dy + 0.025;
      const r2 = Math.max(0.05, att.radius * att.radius);
      const factor = att.strength * attAmp * Math.exp(-d2 / r2) * strength;
      wx += dx * factor - dy * factor * (isRibbon ? 0.12 : 0.25);
      wy += dy * factor + dx * factor * (isRibbon ? 0.12 : 0.25);
    }

    return [wx, wy];
  }
}
