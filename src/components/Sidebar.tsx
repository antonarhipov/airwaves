import { useId, useState } from 'react';
import {
  LayoutGrid,
  Palette,
  Plus,
  Sigma,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import { DEFAULT_LANDSCAPE_PARAMS } from '../simulation/landscapeSim';
import type {
  AspectRatioId,
  AttractorNode,
  CanvasParams,
  LandscapeParams,
  PaletteId,
  SimParams,
  SplashConfig,
  TypographyParams,
  VisualParams,
} from '../types/config';
import { ASPECT_RATIOS, PALETTES, STUDIO_PRESETS } from '../types/presets';
import { SelectRow, SliderRow, TextInputRow, ToggleRow } from './ControlWidgets';

export type SidebarTab = 'compose' | 'particles' | 'math' | 'visual' | 'brand';

interface SidebarProps {
  isOpen: boolean;
  config: SplashConfig;
  activePresetId: string | null;
  showFieldNodes: boolean;
  onToggleFieldNodes: (show: boolean) => void;
  onSelectPreset: (presetId: string) => void;
  onUpdateSim: (patch: Partial<SimParams>) => void;
  onUpdateVisual: (patch: Partial<VisualParams>) => void;
  onUpdateTypography: (patch: Partial<TypographyParams>) => void;
  onUpdateCanvas: (patch: Partial<CanvasParams>) => void;
}

const TABS: { id: SidebarTab; label: string; icon: typeof Sparkles }[] = [
  { id: 'compose', label: 'Presets', icon: LayoutGrid },
  { id: 'particles', label: 'Particles', icon: Sparkles },
  { id: 'math', label: 'Math', icon: Sigma },
  { id: 'visual', label: 'Visuals', icon: Palette },
  { id: 'brand', label: 'Text', icon: Type },
];

export function Sidebar({
  isOpen,
  config,
  activePresetId,
  showFieldNodes,
  onToggleFieldNodes,
  onSelectPreset,
  onUpdateSim,
  onUpdateVisual,
  onUpdateTypography,
  onUpdateCanvas,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('compose');
  const bgColorId = useId();
  const textColorId = useId();

  const { sim, visual, typography, canvas } = config;

  const handlePaletteSelect = (paletteId: PaletteId) => {
    if (paletteId === 'custom') {
      onUpdateVisual({ paletteId: 'custom' });
      return;
    }
    const def = PALETTES[paletteId];
    onUpdateVisual({
      paletteId,
      paletteStops: [...def.stops],
      backgroundColor: def.background,
    });
  };

  const handleStopChange = (idx: number, hex: string) => {
    const nextStops = [...visual.paletteStops] as [string, string, string, string];
    nextStops[idx] = hex;
    onUpdateVisual({ paletteId: 'custom', paletteStops: nextStops });
  };

  const addFieldNode = (isRepeller: boolean) => {
    const idx = sim.attractors.length + 1;
    const node: AttractorNode = {
      id: `node-${Date.now()}-${idx}`,
      x: isRepeller ? -0.25 : 0.25,
      y: isRepeller ? 0.18 : -0.12,
      strength: isRepeller ? -0.55 : 0.55,
      radius: 0.6,
    };
    onUpdateSim({ attractors: [...sim.attractors, node] });
    onToggleFieldNodes(true);
  };

  const updateAttractor = (id: string, patch: Partial<AttractorNode>) => {
    onUpdateSim({
      attractors: sim.attractors.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  };

  const removeAttractor = (id: string) => {
    onUpdateSim({
      attractors: sim.attractors.filter((a) => a.id !== id),
    });
  };

  return (
    <aside
      id="controls-sidebar"
      className="studio-sidebar"
      aria-label="Generator Controls"
      hidden={!isOpen}
    >
      <div className="sidebar-tabs" role="tablist" aria-label="Control Categories">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className="tab-btn"
              onClick={() => setTab(t.id)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-scroll" role="tabpanel">
        {tab === 'compose' && (
          <>
            <section className="section-card">
              <h2 className="section-heading">Starter Compositions</h2>
              <div className="preset-grid">
                {STUDIO_PRESETS.map((preset) => {
                  const grad = `linear-gradient(90deg, ${preset.config.visual.paletteStops.join(', ')})`;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`preset-card ${activePresetId === preset.id ? 'is-active' : ''}`}
                      onClick={() => onSelectPreset(preset.id)}
                    >
                      <div className="preset-meta">
                        <span className="preset-name">{preset.name}</span>
                        <span className="preset-desc">{preset.description}</span>
                      </div>
                      <span
                        className="swatch-strip"
                        style={{ background: grad }}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="section-card">
              <h2 className="section-heading">Flow Composition</h2>
              <SelectRow
                label="Composition Layout"
                value={sim.composition}
                options={[
                  { value: 'diagonal-flow', label: 'Diagonal Flow' },
                  { value: 'central-wave', label: 'Central Wave' },
                  { value: 'horizontal-flow', label: 'Horizontal Flow' },
                  { value: 'vertical-flow', label: 'Vertical Flow' },
                  { value: 'radial-flow', label: 'Radial Flow' },
                ]}
                onChange={(composition) => onUpdateSim({ composition })}
              />
              <SelectRow
                label="Aspect Ratio"
                value={canvas.aspectRatio}
                options={(Object.keys(ASPECT_RATIOS) as AspectRatioId[]).map((key) => ({
                  value: key,
                  label: ASPECT_RATIOS[key].label,
                }))}
                onChange={(aspectRatio) => onUpdateCanvas({ aspectRatio })}
              />
            </section>

            <section className="section-card">
              <h2 className="section-heading">Typography Safe Zone</h2>
              <SelectRow
                label="Empty Space Region"
                value={sim.safeZone}
                options={[
                  { value: 'top-left', label: 'Top Left (IDEA Splash)' },
                  { value: 'bottom-left', label: 'Bottom Left' },
                  { value: 'top-right', label: 'Top Right' },
                  { value: 'center', label: 'Center Focal Clear' },
                  { value: 'none', label: 'None (Full Bleed)' },
                ]}
                onChange={(safeZone) => onUpdateSim({ safeZone })}
              />
              {sim.safeZone !== 'none' && (
                <>
                  <SliderRow
                    label="Clearance Strength"
                    value={sim.safeZoneStrength}
                    min={0}
                    max={1}
                    step={0.02}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(safeZoneStrength) => onUpdateSim({ safeZoneStrength })}
                  />
                  <SliderRow
                    label="Safe Zone Radius"
                    value={sim.safeZoneRadius}
                    min={0.18}
                    max={0.68}
                    step={0.02}
                    formatValue={(v) => v.toFixed(2)}
                    onChange={(safeZoneRadius) => onUpdateSim({ safeZoneRadius })}
                  />
                </>
              )}
            </section>
          </>
        )}

        {tab === 'particles' && (
          <>
            <section className="section-card">
              <h2 className="section-heading">Population &amp; Sizing</h2>
              <SliderRow
                label="Particle Count"
                value={sim.particleCount}
                min={5000}
                max={120000}
                step={1000}
                formatValue={(v) => `${(v / 1000).toFixed(0)}k`}
                onChange={(particleCount) => onUpdateSim({ particleCount })}
              />
              <SliderRow
                label="Ridge Density"
                value={sim.densityConcentration}
                min={0.15}
                max={0.98}
                step={0.02}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(densityConcentration) => onUpdateSim({ densityConcentration })}
              />
              <SelectRow
                label="Size Distribution"
                value={sim.sizeDistribution}
                options={[
                  { value: 'bimodal-bokeh', label: 'Bimodal Sparks + Bokeh' },
                  { value: 'power-law', label: 'Power-Law Heavy Tail' },
                  { value: 'fine-dust', label: 'Fine Caustic Dust' },
                  { value: 'uniform', label: 'Uniform Pearls' },
                ]}
                onChange={(sizeDistribution) => onUpdateSim({ sizeDistribution })}
              />
              <SliderRow
                label="Size Variance"
                value={sim.sizeVariance}
                min={0}
                max={1}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(sizeVariance) => onUpdateSim({ sizeVariance })}
              />
            </section>

            <section className="section-card">
              <h2 className="section-heading">Flow &amp; Dispersion</h2>
              <SelectRow
                label="Flow Direction"
                value={sim.flowDirection}
                options={[
                  { value: 'diagonal', label: 'Diagonal' },
                  { value: 'horizontal', label: 'Horizontal' },
                  { value: 'vertical', label: 'Vertical' },
                  { value: 'radial', label: 'Radial' },
                ]}
                onChange={(flowDirection) => onUpdateSim({ flowDirection })}
              />
              <SliderRow
                label="Flow Angle"
                value={sim.flowAngle}
                min={-180}
                max={180}
                step={1}
                formatValue={(v) => `${v}°`}
                onChange={(flowAngle) => onUpdateSim({ flowAngle })}
              />
              <SliderRow
                label="Wave Curvature"
                value={sim.curvature}
                min={0}
                max={2}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(curvature) => onUpdateSim({ curvature })}
              />
              <SliderRow
                label="Dispersion Spread"
                value={sim.dispersion}
                min={0.05}
                max={1.4}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(dispersion) => onUpdateSim({ dispersion })}
              />
              <SliderRow
                label="Trail Length"
                value={sim.trailLength}
                min={0}
                max={1}
                step={0.02}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(trailLength) => onUpdateSim({ trailLength })}
              />
            </section>
          </>
        )}

        {tab === 'math' && (
          <>
            <section className="section-card">
              <h2 className="section-heading">Vector Field &amp; Noise</h2>
              <TextInputRow
                label="Deterministic Seed"
                value={sim.seed}
                placeholder="e.g. IDEA-2026.3"
                onChange={(seed) => onUpdateSim({ seed })}
              />
              <SelectRow
                label="Vector Field Mode"
                value={sim.fieldMode}
                options={[
                  { value: 'acoustic-caustic', label: 'Acoustic Caustic Ribbon' },
                  { value: 'airflow-streamlines', label: 'Airflow RK2 Streamlines' },
                  { value: 'landscape-wave', label: '3D Landscape Wave (Closed-Form)' },
                  { value: 'harmonic-ribbon', label: 'Harmonic Airwave Ribbon' },
                  { value: 'curl-noise', label: 'Incompressible Curl Field' },
                  { value: 'vortex-stream', label: 'Vortex Streamlines' },
                  { value: 'interference', label: 'Wave Interference' },
                ]}
                onChange={(fieldMode) => onUpdateSim({ fieldMode })}
              />
              <SelectRow
                label="Noise Basis"
                value={sim.noiseType}
                options={[
                  { value: 'simplex', label: '2D Simplex Noise' },
                  { value: 'perlin', label: '2D Perlin Gradient Noise' },
                ]}
                onChange={(noiseType) => onUpdateSim({ noiseType })}
              />
              <SliderRow
                label="Guiding Curves"
                value={sim.guidingCurves}
                min={1}
                max={24}
                step={1}
                formatValue={(v) => `${v} curves`}
                onChange={(guidingCurves) => onUpdateSim({ guidingCurves })}
              />
              <SliderRow
                label="Turbulence"
                value={sim.turbulence}
                min={0}
                max={2}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(turbulence) => onUpdateSim({ turbulence })}
              />
              <SliderRow
                label="Noise Frequency"
                value={sim.noiseScale}
                min={0.3}
                max={4}
                step={0.05}
                formatValue={(v) => v.toFixed(2)}
                onChange={(noiseScale) => onUpdateSim({ noiseScale })}
              />
              <SliderRow
                label="FBM Octaves"
                value={sim.noiseOctaves}
                min={1}
                max={5}
                step={1}
                onChange={(noiseOctaves) => onUpdateSim({ noiseOctaves })}
              />
              <SliderRow
                label="Vortex Strength"
                value={sim.vortexStrength}
                min={-2}
                max={2}
                step={0.05}
                formatValue={(v) => v.toFixed(2)}
                onChange={(vortexStrength) => onUpdateSim({ vortexStrength })}
              />
            </section>

            {sim.fieldMode === 'landscape-wave' && (() => {
              const lp = { ...DEFAULT_LANDSCAPE_PARAMS, ...(sim.landscape ?? {}) };
              const updateLandscape = (patch: Partial<LandscapeParams>) =>
                onUpdateSim({ landscape: { ...lp, ...patch } });
              return (
                <section className="section-card">
                  <h2 className="section-heading">3D Landscape Manifold</h2>
                  <SliderRow
                    label="Ridge Ratio (ρ)"
                    value={lp.ridgeRatio}
                    min={0.2}
                    max={0.95}
                    step={0.02}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(ridgeRatio) => updateLandscape({ ridgeRatio })}
                  />
                  <SliderRow
                    label="Ridge Sharpness (p)"
                    value={lp.ridgeSharpness}
                    min={1.5}
                    max={4.5}
                    step={0.1}
                    formatValue={(v) => v.toFixed(1)}
                    onChange={(ridgeSharpness) => updateLandscape({ ridgeSharpness })}
                  />
                  <SliderRow
                    label="Plane Slope (α)"
                    value={lp.planeSlopeAlpha}
                    min={-0.6}
                    max={0.6}
                    step={0.02}
                    formatValue={(v) => v.toFixed(2)}
                    onChange={(planeSlopeAlpha) => updateLandscape({ planeSlopeAlpha })}
                  />
                  <SliderRow
                    label="Terrain Relief (H)"
                    value={lp.terrainRoughness}
                    min={0}
                    max={1.2}
                    step={0.02}
                    formatValue={(v) => v.toFixed(2)}
                    onChange={(terrainRoughness) => updateLandscape({ terrainRoughness })}
                  />
                  <SliderRow
                    label="3D Curl Scale (L)"
                    value={lp.curlScale}
                    min={1.0}
                    max={6.0}
                    step={0.1}
                    formatValue={(v) => v.toFixed(1)}
                    onChange={(curlScale) => updateLandscape({ curlScale })}
                  />
                  <SliderRow
                    label="Aperture CoC (k)"
                    value={lp.apertureScale}
                    min={0.5}
                    max={7.5}
                    step={0.1}
                    formatValue={(v) => v.toFixed(1)}
                    onChange={(apertureScale) => updateLandscape({ apertureScale })}
                  />
                  <SliderRow
                    label="Core Incandescence (μ)"
                    value={lp.coreIncandescence}
                    min={0}
                    max={1.0}
                    step={0.02}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(coreIncandescence) => updateLandscape({ coreIncandescence })}
                  />
                </section>
              );
            })()}

            <section className="section-card">
              <div className="section-heading">
                <span>Attractors &amp; Repellers</span>
                <ToggleRow
                  label="Handles"
                  checked={showFieldNodes}
                  onChange={onToggleFieldNodes}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.45rem' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => addFieldNode(false)}
                >
                  <Plus size={13} aria-hidden="true" /> Attractor
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => addFieldNode(true)}
                >
                  <Plus size={13} aria-hidden="true" /> Repeller
                </button>
              </div>
              {sim.attractors.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  No active field nodes. Add an attractor or repeller to sculpt the flow.
                </p>
              ) : (
                sim.attractors.map((node, index) => (
                  <div key={node.id} className="attractor-item">
                    <div className="attractor-item-head">
                      <span>
                        #{index + 1} {node.strength >= 0 ? 'Attractor (+)' : 'Repeller (−)'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`Remove field node ${index + 1}`}
                        onClick={() => removeAttractor(node.id)}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                    <SliderRow
                      label="Strength"
                      value={node.strength}
                      min={-1.5}
                      max={1.5}
                      step={0.05}
                      formatValue={(v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
                      onChange={(strength) => updateAttractor(node.id, { strength })}
                    />
                    <SliderRow
                      label="Radius"
                      value={node.radius}
                      min={0.18}
                      max={1.4}
                      step={0.02}
                      formatValue={(v) => v.toFixed(2)}
                      onChange={(radius) => updateAttractor(node.id, { radius })}
                    />
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {tab === 'visual' && (
          <>
            <section className="section-card">
              <div className="section-heading">
                <span>Color &amp; Atmosphere</span>
                <span className="instant-badge">GPU Instant</span>
              </div>
              <SelectRow
                label="Color Palette"
                value={visual.paletteId}
                options={[
                  ...(Object.keys(PALETTES) as Exclude<PaletteId, 'custom'>[]).map((id) => ({
                    value: id as PaletteId,
                    label: PALETTES[id].name,
                  })),
                  { value: 'custom', label: 'Custom 4-Stop Gradient' },
                ]}
                onChange={handlePaletteSelect}
              />

              <div className="color-stops-grid">
                {visual.paletteStops.map((hex, i) => (
                  <div key={i} className="color-chip-wrap">
                    <label htmlFor={`stop-${i}`}>Stop {i + 1}</label>
                    <input
                      id={`stop-${i}`}
                      type="color"
                      value={hex}
                      onChange={(e) => handleStopChange(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="control-row">
                <div className="control-header">
                  <label className="control-label" htmlFor={bgColorId}>
                    Background Color
                  </label>
                  <span className="control-value">{visual.backgroundColor}</span>
                </div>
                <input
                  id={bgColorId}
                  type="color"
                  value={visual.backgroundColor}
                  onChange={(e) => onUpdateVisual({ backgroundColor: e.target.value })}
                />
              </div>

              <SliderRow
                label="Ambient Edge Glow"
                value={visual.ambientGlow}
                min={0}
                max={1.5}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(ambientGlow) => onUpdateVisual({ ambientGlow })}
              />
            </section>

            <section className="section-card">
              <div className="section-heading">
                <span>Optics, Bloom &amp; Filaments</span>
                <span className="instant-badge">GPU Instant</span>
              </div>
              <SliderRow
                label="Bloom Intensity"
                value={visual.glowIntensity}
                min={0}
                max={2}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(glowIntensity) => onUpdateVisual({ glowIntensity })}
              />
              <SliderRow
                label="Bloom Threshold"
                value={visual.bloomThreshold}
                min={0.08}
                max={1.1}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(bloomThreshold) => onUpdateVisual({ bloomThreshold })}
              />
              <SliderRow
                label="Depth of Field (Bokeh)"
                value={visual.dofStrength}
                min={0}
                max={2}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(dofStrength) => onUpdateVisual({ dofStrength })}
              />
              <SliderRow
                label="Focal Plane Depth"
                value={visual.focalPlane}
                min={-1}
                max={1}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(focalPlane) => onUpdateVisual({ focalPlane })}
              />
              <SliderRow
                label="Particle Scale"
                value={visual.particleSize}
                min={0.35}
                max={2.4}
                step={0.05}
                formatValue={(v) => `${v.toFixed(2)}×`}
                onChange={(particleSize) => onUpdateVisual({ particleSize })}
              />
              <SliderRow
                label="Particle Brightness"
                value={visual.particleBrightness}
                min={0.2}
                max={2.4}
                step={0.02}
                formatValue={(v) => v.toFixed(2)}
                onChange={(particleBrightness) => onUpdateVisual({ particleBrightness })}
              />
              <SliderRow
                label="Transparency"
                value={visual.transparency}
                min={0.1}
                max={1}
                step={0.02}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(transparency) => onUpdateVisual({ transparency })}
              />
              <SliderRow
                label="Trail Fade Opacity"
                value={visual.trailFade}
                min={0}
                max={1}
                step={0.02}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(trailFade) => onUpdateVisual({ trailFade })}
              />
              <SliderRow
                label="Airwave Curve Clues"
                value={visual.guidingCurveOpacity}
                min={0}
                max={1}
                step={0.02}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(guidingCurveOpacity) => onUpdateVisual({ guidingCurveOpacity })}
              />
              <ToggleRow
                label="Live Harmonic Motion"
                checked={visual.animateFlow}
                onChange={(animateFlow) => onUpdateVisual({ animateFlow })}
              />
              {visual.animateFlow && (
                <SliderRow
                  label="Motion Speed"
                  value={visual.animationSpeed}
                  min={0.05}
                  max={2}
                  step={0.05}
                  formatValue={(v) => `${v.toFixed(2)}×`}
                  onChange={(animationSpeed) => onUpdateVisual({ animationSpeed })}
                />
              )}
            </section>
          </>
        )}

        {tab === 'brand' && (
          <>
            <section className="section-card">
              <div className="section-heading">
                <span>Splash Typography</span>
                <span className="instant-badge">Vector Layer</span>
              </div>
              <ToggleRow
                label="Show Title Text"
                checked={typography.showText}
                onChange={(showText) => onUpdateTypography({ showText })}
              />
              {typography.showText && (
                <>
                  <TextInputRow
                    label="Primary Title"
                    value={typography.title}
                    placeholder="IntelliJ IDEA"
                    onChange={(title) => onUpdateTypography({ title })}
                  />
                  <TextInputRow
                    label="Version / Subtitle"
                    value={typography.subtitle}
                    placeholder="2026.3"
                    onChange={(subtitle) => onUpdateTypography({ subtitle })}
                  />
                  <SelectRow
                    label="Typeface"
                    value={typography.fontFamily}
                    options={[
                      { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans' },
                      { value: 'Inter', label: 'Inter' },
                      { value: 'JetBrains Mono', label: 'JetBrains Mono' },
                    ]}
                    onChange={(fontFamily) => onUpdateTypography({ fontFamily })}
                  />
                  <SelectRow
                    label="Anchor Position"
                    value={typography.textPosition}
                    options={[
                      { value: 'top-left', label: 'Top Left' },
                      { value: 'bottom-left', label: 'Bottom Left' },
                      { value: 'top-right', label: 'Top Right' },
                      { value: 'center', label: 'Centered' },
                    ]}
                    onChange={(textPosition) => onUpdateTypography({ textPosition })}
                  />
                  <SliderRow
                    label="Text Scale"
                    value={typography.textScale}
                    min={0.5}
                    max={1.8}
                    step={0.02}
                    formatValue={(v) => `${v.toFixed(2)}×`}
                    onChange={(textScale) => onUpdateTypography({ textScale })}
                  />
                  <SliderRow
                    label="Offset X"
                    value={typography.textOffsetX}
                    min={-25}
                    max={25}
                    step={0.5}
                    formatValue={(v) => `${v}%`}
                    onChange={(textOffsetX) => onUpdateTypography({ textOffsetX })}
                  />
                  <SliderRow
                    label="Offset Y"
                    value={typography.textOffsetY}
                    min={-25}
                    max={25}
                    step={0.5}
                    formatValue={(v) => `${v}%`}
                    onChange={(textOffsetY) => onUpdateTypography({ textOffsetY })}
                  />
                  <div className="control-row">
                    <div className="control-header">
                      <label className="control-label" htmlFor={textColorId}>
                        Text &amp; Logo Color
                      </label>
                      <span className="control-value">{typography.textColor}</span>
                    </div>
                    <input
                      id={textColorId}
                      type="color"
                      value={typography.textColor}
                      onChange={(e) => onUpdateTypography({ textColor: e.target.value })}
                    />
                  </div>
                  <SliderRow
                    label="Subtitle Opacity"
                    value={typography.subtitleOpacity}
                    min={0.3}
                    max={1}
                    step={0.02}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(subtitleOpacity) => onUpdateTypography({ subtitleOpacity })}
                  />
                </>
              )}
            </section>

            <section className="section-card">
              <h2 className="section-heading">JetBrains Branding</h2>
              <ToggleRow
                label="Show JetBrains Logo"
                checked={typography.showLogo}
                onChange={(showLogo) => onUpdateTypography({ showLogo })}
              />
              {typography.showLogo && (
                <>
                  <SelectRow
                    label="Logo Style"
                    value={typography.logoStyle}
                    options={[
                      { value: 'mono', label: 'Official Monochrome' },
                      { value: 'color', label: 'Official Brand Gradient' },
                    ]}
                    onChange={(logoStyle) => onUpdateTypography({ logoStyle })}
                  />
                  <SelectRow
                    label="Logo Variant"
                    value={typography.logoVariant}
                    options={[
                      { value: 'full', label: 'Mark + JETBRAINS' },
                      { value: 'mark', label: 'Cube Mark Only' },
                      { value: 'wordmark', label: 'Wordmark Only' },
                    ]}
                    onChange={(logoVariant) => onUpdateTypography({ logoVariant })}
                  />
                  <SelectRow
                    label="Logo Corner"
                    value={typography.logoPosition}
                    options={[
                      { value: 'bottom-right', label: 'Bottom Right' },
                      { value: 'bottom-left', label: 'Bottom Left' },
                      { value: 'top-right', label: 'Top Right' },
                    ]}
                    onChange={(logoPosition) => onUpdateTypography({ logoPosition })}
                  />
                  <SliderRow
                    label="Logo Scale"
                    value={typography.logoScale}
                    min={0.5}
                    max={1.8}
                    step={0.02}
                    formatValue={(v) => `${v.toFixed(2)}×`}
                    onChange={(logoScale) => onUpdateTypography({ logoScale })}
                  />
                  <SliderRow
                    label="Logo Opacity"
                    value={typography.logoOpacity}
                    min={0.2}
                    max={1}
                    step={0.02}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(logoOpacity) => onUpdateTypography({ logoOpacity })}
                  />
                </>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
