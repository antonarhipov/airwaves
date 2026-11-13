export type SizeDistribution = 'bimodal-bokeh' | 'power-law' | 'uniform' | 'fine-dust';
export type FlowDirection = 'horizontal' | 'vertical' | 'diagonal' | 'radial';
export type FieldMode = 'harmonic-ribbon' | 'curl-noise' | 'vortex-stream' | 'interference';
export type NoiseType = 'simplex' | 'perlin';
export type CompositionPreset =
  | 'central-wave'
  | 'horizontal-flow'
  | 'vertical-flow'
  | 'diagonal-flow'
  | 'radial-flow';
export type SafeZonePreset = 'top-left' | 'bottom-left' | 'center' | 'top-right' | 'none';

export interface AttractorNode {
  id: string;
  /** Normalized X in [-1, 1] */
  x: number;
  /** Normalized Y in [-1, 1] */
  y: number;
  /** Positive = attractor, negative = repeller */
  strength: number;
  /** Effective influence radius in normalized units */
  radius: number;
}

/**
 * Pure mathematical simulation parameters.
 * Separated from VisualParams so changing colors, bloom, DoF, or typography
 * never triggers a particle/flow-field recomputation.
 */
export interface SimParams {
  seed: string;
  // Particle system
  particleCount: number;
  densityConcentration: number;
  sizeDistribution: SizeDistribution;
  sizeVariance: number;
  flowDirection: FlowDirection;
  flowAngle: number;
  curvature: number;
  turbulence: number;
  dispersion: number;
  trailLength: number;

  // Mathematical controls
  fieldMode: FieldMode;
  noiseType: NoiseType;
  noiseScale: number;
  noiseOctaves: number;
  vortexStrength: number;
  guidingCurves: number;
  attractors: AttractorNode[];

  // Composition layout
  composition: CompositionPreset;
  safeZone: SafeZonePreset;
  safeZoneStrength: number;
  safeZoneRadius: number;
}

export type PaletteId =
  | 'jetbrains-amber-blue'
  | 'jetbrains-magenta-blue'
  | 'airwaves-champagne'
  | 'airwaves-rose'
  | 'monochrome'
  | 'warm-solar'
  | 'aurora-emerald'
  | 'custom';

/**
 * GPU rendering & post-processing parameters.
 * Applied instantaneously via shader uniforms without touching the simulation.
 */
export interface VisualParams {
  paletteId: PaletteId;
  paletteStops: [string, string, string, string];
  backgroundColor: string;
  ambientGlow: number;
  glowIntensity: number;
  bloomThreshold: number;
  dofStrength: number;
  focalPlane: number;
  particleSize: number;
  particleBrightness: number;
  transparency: number;
  trailFade: number;
  guidingCurveOpacity: number;
  animateFlow: boolean;
  animationSpeed: number;
}

export type FontChoice = 'Plus Jakarta Sans' | 'Inter' | 'JetBrains Mono';
export type TextPosition = 'top-left' | 'bottom-left' | 'center' | 'top-right';
export type LogoPosition = 'bottom-right' | 'bottom-left' | 'top-right';
export type LogoVariant = 'full' | 'mark' | 'wordmark';
export type LogoStyle = 'mono' | 'color';

export interface TypographyParams {
  showText: boolean;
  title: string;
  subtitle: string;
  fontFamily: FontChoice;
  textPosition: TextPosition;
  textOffsetX: number;
  textOffsetY: number;
  textScale: number;
  textColor: string;
  subtitleOpacity: number;
  showLogo: boolean;
  logoStyle: LogoStyle;
  logoVariant: LogoVariant;
  logoPosition: LogoPosition;
  logoScale: number;
  logoOpacity: number;
}

export type AspectRatioId = '16:9' | '16:10' | '4:3' | '1:1' | '21:9' | '9:16';

export interface CanvasParams {
  aspectRatio: AspectRatioId;
  exportWidth: number;
}

export interface SplashConfig {
  sim: SimParams;
  visual: VisualParams;
  typography: TypographyParams;
  canvas: CanvasParams;
}

export interface PaletteDefinition {
  id: PaletteId;
  name: string;
  stops: [string, string, string, string];
  background: string;
}

export interface StudioPreset {
  id: string;
  name: string;
  description: string;
  config: SplashConfig;
}
