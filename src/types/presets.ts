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
    particleCount: 42000,
    densityConcentration: 0.74,
    sizeDistribution: 'bimodal-bokeh',
    sizeVariance: 0.78,
    flowDirection: 'diagonal',
    flowAngle: -16,
    curvature: 0.96,
    turbulence: 0.56,
    dispersion: 0.42,
    trailLength: 0.45,
    fieldMode: 'harmonic-ribbon',
    noiseType: 'simplex',
    noiseScale: 1.32,
    noiseOctaves: 3,
    vortexStrength: 0.42,
    guidingCurves: 7,
    attractors: [
      { id: 'att-1', x: 0.35, y: 0.08, strength: 0.35, radius: 0.65 },
      { id: 'att-2', x: -0.45, y: 0.32, strength: -0.45, radius: 0.55 },
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
    ambientGlow: 0.58,
    glowIntensity: 0.62,
    bloomThreshold: 0.52,
    dofStrength: 0.95,
    focalPlane: 0.05,
    particleSize: 1.0,
    particleBrightness: 1.24,
    transparency: 0.9,
    trailFade: 0.58,
    guidingCurveOpacity: 0.5,
    animateFlow: true,
    animationSpeed: 0.42,
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
      c.sim.curvature = 1.08;
      c.sim.guidingCurves = 8;
      c.visual.paletteId = 'jetbrains-magenta-blue';
      c.visual.paletteStops = [...PALETTES['jetbrains-magenta-blue'].stops];
      c.visual.backgroundColor = PALETTES['jetbrains-magenta-blue'].background;
      c.visual.glowIntensity = 0.56;
      c.visual.particleBrightness = 1.08;
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
      c.sim.densityConcentration = 0.84;
      c.sim.guidingCurves = 10;
      c.sim.curvature = 1.15;
      c.sim.turbulence = 0.42;
      c.sim.dispersion = 0.34;
      c.sim.vortexStrength = 0.72;
      c.sim.safeZone = 'none';
      c.visual.paletteId = 'airwaves-champagne';
      c.visual.paletteStops = [...PALETTES['airwaves-champagne'].stops];
      c.visual.backgroundColor = PALETTES['airwaves-champagne'].background;
      c.visual.guidingCurveOpacity = 0.72;
      c.visual.trailFade = 0.74;
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
      c.sim.particleCount = 52000;
      c.sim.densityConcentration = 0.56;
      c.sim.dispersion = 0.68;
      c.sim.turbulence = 0.85;
      c.sim.guidingCurves = 5;
      c.sim.safeZone = 'none';
      c.visual.paletteId = 'airwaves-rose';
      c.visual.paletteStops = [...PALETTES['airwaves-rose'].stops];
      c.visual.backgroundColor = PALETTES['airwaves-rose'].background;
      c.visual.dofStrength = 1.45;
      c.visual.guidingCurveOpacity = 0.22;
      c.visual.glowIntensity = 0.44;
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
];
