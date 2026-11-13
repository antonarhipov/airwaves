export type SizeDistribution = 'bimodal-bokeh' | 'power-law' | 'uniform' | 'fine-dust';
export type FlowDirection = 'horizontal' | 'vertical' | 'diagonal' | 'radial';
export type FieldMode =
  | 'acoustic-caustic'
  | 'airflow-streamlines'
  | 'landscape-wave'
  | 'harmonic-ribbon'
  | 'curl-noise'
  | 'vortex-stream'
  | 'interference';

export interface LandscapeParams {
  /** Fraction of particles clustered onto ridge contours (rho_ridge) */
  ridgeRatio: number;
  /** Power exponent controlling cross-sectional ridge tightness (p) */
  ridgeSharpness: number;
  /** Spatial width of base wave manifold (W) */
  worldWidth: number;
  /** Spatial depth of base wave manifold (D) */
  worldDepth: number;
  /** Longitudinal plane inclination (alpha) */
  planeSlopeAlpha: number;
  /** Lateral plane tilt (beta) */
  planeTiltBeta: number;
  /** Spatial wavelength of 3D curl noise eddies (L_curl) */
  curlScale: number;
  /** Core curl turbulence amplitude (gamma_0) */
  curlCoreStrength: number;
  /** Outer curl dispersion amplitude (gamma_1) */
  curlOuterStrength: number;
  /** Terrain fBm relief roughness weight (H_terrain) */
  terrainRoughness: number;
  /** Camera-space focal depth plane (z_focus) */
  focalDepth: number;
  /** Aperture CoC growth rate (k_aperture) */
  apertureScale: number;
  /** Out-of-focus bokeh attenuation exponent (eta) */
  bokehDecay: number;
  /** White-hot ridge core incandescence blend factor (mu_core) */
  coreIncandescence: number;
}
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

  // Optional 3D Closed-Form Landscape specification parameters
  landscape?: LandscapeParams;
}

export type PaletteId =
  | 'jetbrains-amber-blue'
  | 'jetbrains-magenta-blue'
  | 'airflow-prism'
  | 'landscape-champagne'
  | 'landscape-neon'
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
