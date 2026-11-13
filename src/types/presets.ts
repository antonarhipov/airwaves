import { DEFAULT_LANDSCAPE_PARAMS } from '../simulation/landscapeSim';
import type { AspectRatioId, PaletteDefinition, PaletteId, SplashConfig, StudioPreset } from './config';

export const PALETTES: Record<Exclude<PaletteId, 'custom'>, PaletteDefinition> = {
  'jetbrains-amber-blue': {
    id: 'jetbrains-amber-blue',
    name: 'Amber → Cobalt',
    stops: ['#ff9d5c', '#ffd6a8', '#8ab8ff', '#1e6bff'],
    background: '#040814',
  },
  'jetbrains-magenta-blue': {
    id: 'jetbrains-magenta-blue',
    name: 'Magenta → Electric Blue',
    stops: ['#ff1b75', '#d946ef', '#6366f1', '#0088ff'],
    background: '#050414',
  },
  'airflow-prism': {
    id: 'airflow-prism',
    name: 'Airflow Cyan ↔ Magenta',
    stops: ['#ff1e8a', '#9d4edd', '#3b82f6', '#00e5ff'],
    background: '#030612',
  },
  'landscape-champagne': {
    id: 'landscape-champagne',
    name: 'Landscape Champagne → Ice',
    stops: ['#F5C284', '#E6D5C3', '#AFC6E2', '#7FA8D6'],
    background: '#040811',
  },
  'landscape-neon': {
    id: 'landscape-neon',
    name: 'Landscape Crimson → Azure',
    stops: ['#FD3D30', '#E84878', '#8B3DFF', '#0096FF'],
    background: '#040610',
  },
  'airwaves-champagne': {
    id: 'airwaves-champagne',
    name: 'Champagne → Ice',
    stops: ['#ffb673', '#ffe5c4', '#cbd5e1', '#6096d8'],
    background: '#060c16',
  },
  'airwaves-rose': {
    id: 'airwaves-rose',
    name: 'Rose Gold → Slate',
    stops: ['#f6b18f', '#fde0cf', '#a8b7d4', '#4b6587'],
    background: '#090e18',
  },
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome Silver',
    stops: ['#ffffff', '#cbd5e1', '#94a3b8', '#475569'],
    background: '#06080d',
  },
  'warm-solar': {
    id: 'warm-solar',
    name: 'Warm Solar',
    stops: ['#ff4d2e', '#ff9933', '#ffd27d', '#fff0c2'],
    background: '#0d0608',
  },
  'aurora-emerald': {
    id: 'aurora-emerald',
    name: 'Aurora Mint',
    stops: ['#10b981', '#5eead4', '#38bdf8', '#6366f1'],
    background: '#040b12',
  },
};

export const ASPECT_RATIOS: Record<AspectRatioId, { label: string; ratio: number }> = {
  '16:9': { label: '16:9 Widescreen', ratio: 16 / 9 },
  '16:10': { label: '16:10 Display', ratio: 16 / 10 },
  '4:3': { label: '4:3 Classic', ratio: 4 / 3 },
  '1:1': { label: '1:1 Square', ratio: 1 },
  '21:9': { label: '21:9 Ultrawide', ratio: 21 / 9 },
  '9:16': { label: '9:16 Vertical', ratio: 9 / 16 },
};

export const EXPORT_WIDTH_OPTIONS = [
  { label: 'HD (1280px)', value: 1280 },
  { label: 'Full HD (1920px)', value: 1920 },
  { label: 'QHD (2560px)', value: 2560 },
  { label: '4K UHD (3840px)', value: 3840 },
];

export const DEFAULT_CONFIG: SplashConfig = {
  sim: {
    seed: 'IDEA-2026.3',
    particleCount: 58000,
    densityConcentration: 0.84,
    sizeDistribution: 'bimodal-bokeh',
    sizeVariance: 0.72,
    flowDirection: 'diagonal',
    flowAngle: -6,
    curvature: 1.06,
    turbulence: 0.24,
    dispersion: 0.34,
    trailLength: 0.32,
    fieldMode: 'acoustic-caustic',
    noiseType: 'simplex',
    noiseScale: 1.15,
    noiseOctaves: 2,
    vortexStrength: 0.14,
    guidingCurves: 12,
    attractors: [
      { id: 'att-1', x: 0.38, y: 0.06, strength: 0.22, radius: 0.72 },
      { id: 'att-2', x: -0.48, y: 0.36, strength: -0.28, radius: 0.58 },
    ],
    composition: 'diagonal-flow',
    safeZone: 'top-left',
    safeZoneStrength: 0.88,
    safeZoneRadius: 0.42,
  },
  visual: {
    paletteId: 'jetbrains-amber-blue',
    paletteStops: [...PALETTES['jetbrains-amber-blue'].stops],
    backgroundColor: PALETTES['jetbrains-amber-blue'].background,
    ambientGlow: 0.65,
    glowIntensity: 0.38,
    bloomThreshold: 0.62,
    dofStrength: 1.0,
    focalPlane: 0.04,
    particleSize: 0.84,
    particleBrightness: 1.18,
    transparency: 0.94,
    trailFade: 0.48,
    guidingCurveOpacity: 0.44,
    animateFlow: true,
    animationSpeed: 0.55,
  },
  typography: {
    showText: true,
    title: 'IntelliJ IDEA',
    subtitle: '2026.3',
    fontFamily: 'Plus Jakarta Sans',
    textPosition: 'top-left',
    textOffsetX: 0,
    textOffsetY: 0,
    textScale: 1.0,
    textColor: '#f8fafc',
    subtitleOpacity: 0.82,
    showLogo: true,
    logoStyle: 'mono',
    logoVariant: 'full',
    logoPosition: 'bottom-right',
    logoScale: 1.0,
    logoOpacity: 0.95,
  },
  canvas: {
    aspectRatio: '16:9',
    exportWidth: 1920,
  },
};

function cloneConfig(base: SplashConfig): SplashConfig {
  return {
    sim: {
      ...base.sim,
      attractors: base.sim.attractors.map((a) => ({ ...a })),
      landscape: base.sim.landscape ? { ...base.sim.landscape } : undefined,
    },
    visual: {
      ...base.visual,
      paletteStops: [...base.visual.paletteStops] as [string, string, string, string],
    },
    typography: { ...base.typography },
    canvas: { ...base.canvas },
  };
}

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'idea-amber-blue',
    name: 'IDEA 2026.3 Amber',
    description: 'Warm amber-to-cobalt harmonic ribbon with safe-zone title framing',
    config: cloneConfig(DEFAULT_CONFIG),
  },
  {
    id: 'idea-magenta-blue',
    name: 'IDEA 2026.3 Magenta',
    description: 'Vibrant JetBrains magenta-violet-blue airwaves splash',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = 'IDEA-2026.3-neon';
      c.sim.curvature = 1.12;
      c.sim.guidingCurves = 13;
      c.visual.paletteId = 'jetbrains-magenta-blue';
      c.visual.paletteStops = [...PALETTES['jetbrains-magenta-blue'].stops];
      c.visual.backgroundColor = PALETTES['jetbrains-magenta-blue'].background;
      c.visual.glowIntensity = 0.42;
      c.visual.bloomThreshold = 0.60;
      c.visual.particleBrightness = 1.20;
      c.visual.guidingCurveOpacity = 0.46;
      return c;
    })(),
  },
  {
    id: 'airwaves-caustics',
    name: 'Airwaves Caustics',
    description: 'Crisp braided acoustic filaments with sweeping outer wave clues',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = 'airwaves-01';
      c.sim.particleCount = 62000;
      c.sim.densityConcentration = 0.88;
      c.sim.guidingCurves = 14;
      c.sim.curvature = 1.16;
      c.sim.turbulence = 0.18;
      c.sim.dispersion = 0.28;
      c.sim.vortexStrength = 0.12;
      c.sim.safeZone = 'none';
      c.visual.paletteId = 'airwaves-champagne';
      c.visual.paletteStops = [...PALETTES['airwaves-champagne'].stops];
      c.visual.backgroundColor = PALETTES['airwaves-champagne'].background;
      c.visual.particleSize = 0.80;
      c.visual.particleBrightness = 1.16;
      c.visual.guidingCurveOpacity = 0.62;
      c.visual.trailFade = 0.64;
      c.visual.glowIntensity = 0.36;
      c.typography.showText = false;
      c.typography.showLogo = false;
      return c;
    })(),
  },
  {
    id: 'airwaves-bokeh',
    name: 'Velvet Bokeh Dispersion',
    description: 'Soft tilt-shift depth of field with fine sparkling particle spray',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = 'velvet-404';
      c.sim.particleCount = 64000;
      c.sim.densityConcentration = 0.68;
      c.sim.dispersion = 0.56;
      c.sim.turbulence = 0.34;
      c.sim.guidingCurves = 10;
      c.sim.safeZone = 'none';
      c.visual.paletteId = 'airwaves-rose';
      c.visual.paletteStops = [...PALETTES['airwaves-rose'].stops];
      c.visual.backgroundColor = PALETTES['airwaves-rose'].background;
      c.visual.particleSize = 0.86;
      c.visual.particleBrightness = 1.16;
      c.visual.dofStrength = 1.45;
      c.visual.guidingCurveOpacity = 0.28;
      c.visual.glowIntensity = 0.34;
      c.typography.showText = false;
      c.typography.showLogo = false;
      return c;
    })(),
  },
  {
    id: 'monochrome-precision',
    name: 'Monochrome Field',
    description: 'Architectural silver-on-obsidian central harmonic stream',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = 'mono-wave-99';
      c.sim.composition = 'central-wave';
      c.sim.flowDirection = 'horizontal';
      c.sim.flowAngle = 0;
      c.sim.fieldMode = 'curl-noise';
      c.sim.guidingCurves = 9;
      c.sim.safeZone = 'top-left';
      c.visual.paletteId = 'monochrome';
      c.visual.paletteStops = [...PALETTES['monochrome'].stops];
      c.visual.backgroundColor = PALETTES['monochrome'].background;
      c.visual.guidingCurveOpacity = 0.55;
      return c;
    })(),
  },
  {
    id: 'radial-vortex',
    name: 'Radial Vortex Bloom',
    description: 'Orbital vortex field with twin attractors and interference curves',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = 'vortex-777';
      c.sim.composition = 'radial-flow';
      c.sim.flowDirection = 'radial';
      c.sim.fieldMode = 'vortex-stream';
      c.sim.vortexStrength = 1.35;
      c.sim.guidingCurves = 8;
      c.sim.attractors = [
        { id: 'att-1', x: 0.22, y: -0.05, strength: 0.85, radius: 0.75 },
        { id: 'att-2', x: -0.35, y: 0.22, strength: -0.5, radius: 0.55 },
      ];
      c.visual.paletteId = 'aurora-emerald';
      c.visual.paletteStops = [...PALETTES['aurora-emerald'].stops];
      c.visual.backgroundColor = PALETTES['aurora-emerald'].background;
      c.visual.guidingCurveOpacity = 0.52;
      return c;
    })(),
  },
  {
    id: 'airflow-electric-prism',
    name: 'Airflow RK2 Prism',
    description: 'True 6-stage RK2 vector-field streamline advection with crossed cyan-magenta silk sheets',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = 'airflow-prism-26';
      c.sim.particleCount = 54000;
      c.sim.fieldMode = 'airflow-streamlines';
      c.sim.composition = 'diagonal-flow';
      c.sim.flowDirection = 'diagonal';
      c.sim.flowAngle = -4;
      c.sim.curvature = 1.08;
      c.sim.turbulence = 0.22;
      c.sim.dispersion = 0.32;
      c.sim.densityConcentration = 0.86;
      c.sim.vortexStrength = 0.18;
      c.sim.guidingCurves = 12;
      c.sim.trailLength = 0.46;
      c.sim.safeZone = 'none';
      c.sim.attractors = [
        { id: 'att-1', x: 0.26, y: 0.08, strength: 0.28, radius: 0.65 },
        { id: 'att-2', x: -0.36, y: -0.18, strength: -0.22, radius: 0.55 },
      ];
      c.visual.paletteId = 'airflow-prism';
      c.visual.paletteStops = [...PALETTES['airflow-prism'].stops];
      c.visual.backgroundColor = PALETTES['airflow-prism'].background;
      c.visual.particleSize = 0.90;
      c.visual.particleBrightness = 1.38;
      c.visual.glowIntensity = 0.48;
      c.visual.bloomThreshold = 0.48;
      c.visual.dofStrength = 0.95;
      c.visual.guidingCurveOpacity = 0.62;
      c.visual.trailFade = 0.62;
      c.visual.animationSpeed = 0.85;
      c.typography.showText = false;
      c.typography.showLogo = false;
      return c;
    })(),
  },
  {
    id: 'landscape-champagne-wave',
    name: '3D Landscape Champagne',
    description: 'Closed-form Halton + 3D Curl manifold with optical CoC bokeh & core incandescence',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = '42026';
      c.sim.particleCount = 120000;
      c.sim.fieldMode = 'landscape-wave';
      c.sim.composition = 'diagonal-flow';
      c.sim.curvature = 1.05;
      c.sim.dispersion = 0.38;
      c.sim.densityConcentration = 0.85;
      c.sim.guidingCurves = 18;
      c.sim.safeZone = 'none';
      c.sim.landscape = { ...DEFAULT_LANDSCAPE_PARAMS };
      c.visual.paletteId = 'landscape-champagne';
      c.visual.paletteStops = [...PALETTES['landscape-champagne'].stops];
      c.visual.backgroundColor = PALETTES['landscape-champagne'].background;
      c.visual.particleSize = 0.96;
      c.visual.particleBrightness = 1.24;
      c.visual.transparency = 0.92;
      c.visual.glowIntensity = 0.42;
      c.visual.bloomThreshold = 0.56;
      c.visual.dofStrength = 1.0;
      c.visual.focalPlane = 0.0;
      c.visual.guidingCurveOpacity = 0.58;
      c.visual.animationSpeed = 0.80;
      c.typography.showText = false;
      c.typography.showLogo = false;
      return c;
    })(),
  },
  {
    id: 'landscape-neon-wave',
    name: '3D Landscape Neon',
    description: 'High-contrast crimson-to-azure 3D terrain relief with turbulent laminar filaments',
    config: (() => {
      const c = cloneConfig(DEFAULT_CONFIG);
      c.sim.seed = '90210';
      c.sim.particleCount = 120000;
      c.sim.fieldMode = 'landscape-wave';
      c.sim.composition = 'diagonal-flow';
      c.sim.curvature = 1.18;
      c.sim.dispersion = 0.44;
      c.sim.densityConcentration = 0.82;
      c.sim.guidingCurves = 18;
      c.sim.safeZone = 'none';
      c.sim.landscape = {
        ...DEFAULT_LANDSCAPE_PARAMS,
        planeSlopeAlpha: 0.24,
        terrainRoughness: 0.52,
        curlOuterStrength: 1.28,
        coreIncandescence: 0.82,
      };
      c.visual.paletteId = 'landscape-neon';
      c.visual.paletteStops = [...PALETTES['landscape-neon'].stops];
      c.visual.backgroundColor = PALETTES['landscape-neon'].background;
      c.visual.particleSize = 0.98;
      c.visual.particleBrightness = 1.28;
      c.visual.transparency = 0.93;
      c.visual.glowIntensity = 0.44;
      c.visual.bloomThreshold = 0.54;
      c.visual.dofStrength = 1.05;
      c.visual.focalPlane = 0.0;
      c.visual.guidingCurveOpacity = 0.62;
      c.visual.animationSpeed = 0.85;
      c.typography.showText = false;
      c.typography.showLogo = false;
      return c;
    })(),
  },
];
