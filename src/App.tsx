import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Download,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Shuffle,
  Waves,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { SplashViewport, type SplashViewportHandle } from './components/SplashViewport';
import { generateRandomSeed } from './math/prng';
import { runSimulation } from './simulation/particleSim';
import type {
  CanvasParams,
  CompositionPreset,
  FieldMode,
  PaletteId,
  SimParams,
  SplashConfig,
  TypographyParams,
  VisualParams,
} from './types/config';
import {
  ASPECT_RATIOS,
  DEFAULT_CONFIG,
  EXPORT_WIDTH_OPTIONS,
  PALETTES,
  STUDIO_PRESETS,
} from './types/presets';

function cloneSplashConfig(cfg: SplashConfig): SplashConfig {
  return {
    sim: {
      ...cfg.sim,
      attractors: cfg.sim.attractors.map((a) => ({ ...a })),
    },
    visual: {
      ...cfg.visual,
      paletteStops: [...cfg.visual.paletteStops] as [string, string, string, string],
    },
    typography: { ...cfg.typography },
    canvas: { ...cfg.canvas },
  };
}

export function App() {
  const [config, setConfig] = useState<SplashConfig>(() => cloneSplashConfig(DEFAULT_CONFIG));
  const [activePresetId, setActivePresetId] = useState<string | null>(STUDIO_PRESETS[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showFieldNodes, setShowFieldNodes] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const viewportRef = useRef<SplashViewportHandle | null>(null);
  const seedInputId = useId();
  const exportResId = useId();

  // Strictly decoupled: simulation ONLY recalculates when config.sim changes.
  const simData = useMemo(() => runSimulation(config.sim), [config.sim]);

  const updateSim = useCallback((patch: Partial<SimParams>) => {
    setActivePresetId(null);
    setConfig((prev) => ({
      ...prev,
      sim: { ...prev.sim, ...patch },
    }));
  }, []);

  const updateVisual = useCallback((patch: Partial<VisualParams>) => {
    setActivePresetId(null);
    setConfig((prev) => ({
      ...prev,
      visual: { ...prev.visual, ...patch },
    }));
  }, []);

  const updateTypography = useCallback((patch: Partial<TypographyParams>) => {
    setConfig((prev) => ({
      ...prev,
      typography: { ...prev.typography, ...patch },
    }));
  }, []);

  const updateCanvas = useCallback((patch: Partial<CanvasParams>) => {
    setConfig((prev) => ({
      ...prev,
      canvas: { ...prev.canvas, ...patch },
    }));
  }, []);

  const handleSelectPreset = useCallback((presetId: string) => {
    const found = STUDIO_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(presetId);
    setConfig(cloneSplashConfig(found.config));
    setStatusMessage(`Loaded preset: ${found.name}`);
  }, []);

  const handleRandomize = useCallback(() => {
    const newSeed = generateRandomSeed();
    const compositions: CompositionPreset[] = [
      'diagonal-flow',
      'central-wave',
      'horizontal-flow',
      'radial-flow',
    ];
    const fieldModes: FieldMode[] = [
      'harmonic-ribbon',
      'curl-noise',
      'vortex-stream',
      'interference',
    ];
    const paletteIds = Object.keys(PALETTES) as Exclude<PaletteId, 'custom'>[];
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    const nextComp = pick(compositions);
    const nextField = pick(fieldModes);
    const nextPalette = pick(paletteIds);
    const paletteDef = PALETTES[nextPalette];

    setActivePresetId(null);
    setConfig((prev) => ({
      ...prev,
      sim: {
        ...prev.sim,
        seed: newSeed,
        composition: nextComp,
        flowDirection:
          nextComp === 'radial-flow'
            ? 'radial'
            : nextComp === 'horizontal-flow'
              ? 'horizontal'
              : 'diagonal',
        flowAngle: Math.round(-30 + Math.random() * 60),
        fieldMode: nextField,
        curvature: Math.round((0.55 + Math.random() * 1.1) * 100) / 100,
        turbulence: Math.round((0.25 + Math.random() * 0.95) * 100) / 100,
        dispersion: Math.round((0.22 + Math.random() * 0.55) * 100) / 100,
        vortexStrength: Math.round((-0.8 + Math.random() * 2.1) * 100) / 100,
        guidingCurves: 4 + Math.floor(Math.random() * 8),
        densityConcentration: Math.round((0.55 + Math.random() * 0.35) * 100) / 100,
        attractors: [
          {
            id: 'att-1',
            x: Math.round((-0.45 + Math.random() * 0.9) * 100) / 100,
            y: Math.round((-0.35 + Math.random() * 0.7) * 100) / 100,
            strength: Math.round((0.2 + Math.random() * 0.8) * 100) / 100,
            radius: Math.round((0.45 + Math.random() * 0.45) * 100) / 100,
          },
          {
            id: 'att-2',
            x: Math.round((-0.45 + Math.random() * 0.9) * 100) / 100,
            y: Math.round((-0.35 + Math.random() * 0.7) * 100) / 100,
            strength: Math.round((-0.8 + Math.random() * 0.6) * 100) / 100,
            radius: Math.round((0.4 + Math.random() * 0.4) * 100) / 100,
          },
        ],
      },
      visual: {
        ...prev.visual,
        paletteId: nextPalette,
        paletteStops: [...paletteDef.stops],
        backgroundColor: paletteDef.background,
      },
    }));
    setStatusMessage(`Generated new composition with seed ${newSeed}`);
  }, []);

  const handleMoveAttractor = useCallback((id: string, x: number, y: number) => {
    setConfig((prev) => ({
      ...prev,
      sim: {
        ...prev.sim,
        attractors: prev.sim.attractors.map((a) => (a.id === id ? { ...a, x, y } : a)),
      },
    }));
  }, []);

  const handleExport = useCallback(() => {
    viewportRef.current?.exportPng(config.canvas.exportWidth, config.sim.seed);
  }, [config.canvas.exportWidth, config.sim.seed]);

  const handleExportComplete = useCallback((filename: string, width: number, height: number) => {
    setStatusMessage(`Exported ${filename} (${width} × ${height} PNG)`);
  }, []);

  const ratio = ASPECT_RATIOS[config.canvas.aspectRatio].ratio;
  const exportHeight = Math.round(config.canvas.exportWidth / ratio);

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="brand-group">
          <div className="brand-badge" aria-hidden="true">
            <Waves size={16} />
          </div>
          <h1 className="brand-title">Airwaves Studio</h1>
          <span className="telemetry-pill" title="Simulation separated from GPU rendering">
            {simData.computeTimeMs} ms sim
          </span>
        </div>

        <div className="header-actions">
          <div className="seed-control">
            <label htmlFor={seedInputId}>Seed</label>
            <input
              id={seedInputId}
              type="text"
              className="seed-input"
              value={config.sim.seed}
              onChange={(e) => updateSim({ seed: e.target.value })}
            />
          </div>

          <button type="button" className="btn" onClick={handleRandomize}>
            <Shuffle size={14} aria-hidden="true" />
            <span>Randomize</span>
          </button>

          <button
            type="button"
            className="btn"
            aria-pressed={config.visual.animateFlow}
            onClick={() => updateVisual({ animateFlow: !config.visual.animateFlow })}
          >
            {config.visual.animateFlow ? (
              <Pause size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            <span>{config.visual.animateFlow ? 'Pause' : 'Play'}</span>
          </button>

          <label htmlFor={exportResId} className="visually-hidden">
            Export Resolution
          </label>
          <select
            id={exportResId}
            className="select-input"
            style={{ width: 'auto', minBlockSize: '32px' }}
            value={config.canvas.exportWidth}
            onChange={(e) => updateCanvas({ exportWidth: Number(e.target.value) })}
          >
            {EXPORT_WIDTH_OPTIONS.map((opt) => {
              const h = Math.round(opt.value / ratio);
              return (
                <option key={opt.value} value={opt.value}>
                  {opt.value} × {h}
                </option>
              );
            })}
          </select>

          <button type="button" className="btn btn-primary" onClick={handleExport}>
            <Download size={14} aria-hidden="true" />
            <span>Export PNG</span>
          </button>

          <button
            type="button"
            className="btn"
            aria-expanded={sidebarOpen}
            aria-controls="controls-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? (
              <PanelRightClose size={15} aria-hidden="true" />
            ) : (
              <PanelRightOpen size={15} aria-hidden="true" />
            )}
            <span>{sidebarOpen ? 'Hide Controls' : 'Controls'}</span>
          </button>
        </div>
      </header>

      <div className="studio-workspace">
        <SplashViewport
          ref={viewportRef}
          simData={simData}
          visual={config.visual}
          typography={config.typography}
          aspectRatio={config.canvas.aspectRatio}
          attractors={config.sim.attractors}
          showFieldNodes={showFieldNodes}
          onMoveAttractor={handleMoveAttractor}
          onExportComplete={handleExportComplete}
          statusAnnouncement={
            statusMessage ||
            `Rendering ${simData.particleCount} particles at ${config.canvas.exportWidth} by ${exportHeight} export target`
          }
        />

        <Sidebar
          isOpen={sidebarOpen}
          config={config}
          activePresetId={activePresetId}
          showFieldNodes={showFieldNodes}
          onToggleFieldNodes={setShowFieldNodes}
          onSelectPreset={handleSelectPreset}
          onUpdateSim={updateSim}
          onUpdateVisual={updateVisual}
          onUpdateTypography={updateTypography}
          onUpdateCanvas={updateCanvas}
        />
      </div>
    </div>
  );
}

export default App;
