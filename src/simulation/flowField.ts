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
}

export class FlowField {
  readonly params: SimParams;
  readonly noise: Noise2D;
  readonly curves: CurveSpec[];
  readonly safeZone: SafeZoneTarget | null;
  readonly dirX: number;
  readonly dirY: number;
  readonly perpX: number;
  readonly perpY: number;

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
      baseDeg = 18 + params.flowAngle * 0.45;
    }

    const rad = (baseDeg * Math.PI) / 180;
    this.dirX = Math.cos(rad);
    this.dirY = Math.sin(rad);
    this.perpX = -this.dirY;
    this.perpY = this.dirX;

    const count = Math.max(1, Math.round(params.guidingCurves));
    const curveRng = rng.fork('curves');
    this.curves = [];

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
      });
    }
  }

  /**
   * Evaluate a guiding harmonic curve at parameter s in [0, 1].
   * Returns position (x, y) in normalized aspect-scaled coordinates and tangent direction.
   */
  evalGuidingCurve(curveIdx: number, s: number): { x: number; y: number; tx: number; ty: number } {
    const curve = this.curves[curveIdx % this.curves.length];
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
   * Sample deterministic 2D vector field at (x, y) for advection, turbulence,
   * attractors/repellers, and vortex curl.
   */
  sampleField(x: number, y: number): [number, number] {
    const { fieldMode, noiseScale, noiseOctaves, turbulence, vortexStrength, attractors } =
      this.params;

    let vx = this.dirX * 0.65;
    let vy = this.dirY * 0.65;

    if (fieldMode === 'harmonic-ribbon') {
      const waveY = Math.cos(x * 1.7 * this.params.curvature + 0.4) * 0.35 * this.params.curvature;
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
      vx += cx * turbulence * 0.42;
      vy += cy * turbulence * 0.42;
    }

    // Add global vortex swirl
    if (Math.abs(vortexStrength) > 0.001) {
      const r2 = x * x + y * y + 0.12;
      const swirl = vortexStrength / (1.0 + r2 * 1.8);
      vx += -y * swirl * 0.55;
      vy += x * swirl * 0.55;
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
    const { noiseScale, noiseOctaves, turbulence, vortexStrength, attractors } = this.params;
    let wx = x;
    let wy = y;

    if (turbulence > 0.001) {
      const [cx, cy] = this.noise.curl(
        x * noiseScale + 1.7,
        y * noiseScale - 0.9,
        noiseOctaves,
      );
      wx += cx * turbulence * 0.14 * strength;
      wy += cy * turbulence * 0.14 * strength;
    }

    if (Math.abs(vortexStrength) > 0.001) {
      const r2 = wx * wx + wy * wy;
      const angle = vortexStrength * 0.35 * Math.exp(-r2 * 1.1) * strength;
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
      const d2 = dx * dx + dy * dy + 0.02;
      const r2 = Math.max(0.05, att.radius * att.radius);
      const factor = att.strength * 0.28 * Math.exp(-d2 / r2) * strength;
      wx += dx * factor - dy * factor * 0.25;
      wy += dy * factor + dx * factor * 0.25;
    }

    return [wx, wy];
  }
}
