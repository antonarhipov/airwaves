import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Download,
  Film,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Shuffle,
  Waves,
  X,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { SplashViewport, type SplashViewportHandle } from './components/SplashViewport';
import {
  VIDEO_DURATION_OPTIONS,
  type VideoDurationOption,
  type VideoExportProgress,
} from './export/videoExporter';
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
  const [videoDuration, setVideoDuration] = useState<VideoDurationOption>(10);
  const [videoProgress, setVideoProgress] = useState<VideoExportProgress | null>(null);

  const viewportRef = useRef<SplashViewportHandle | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);
  const seedInputId = useId();
  const exportResId = useId();
  const videoDurationId = useId();

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
      'acoustic-caustic',
      'airflow-streamlines',
      'landscape-wave',
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
        curvature: Math.round((0.75 + Math.random() * 0.7) * 100) / 100,
        turbulence:
          nextField === 'acoustic-caustic'
            ? Math.round((0.12 + Math.random() * 0.34) * 100) / 100
            : Math.round((0.25 + Math.random() * 0.75) * 100) / 100,
        dispersion: Math.round((0.22 + Math.random() * 0.42) * 100) / 100,
        vortexStrength:
          nextField === 'acoustic-caustic'
            ? Math.round((-0.25 + Math.random() * 0.55) * 100) / 100
            : Math.round((-0.8 + Math.random() * 2.1) * 100) / 100,
        guidingCurves: nextField === 'acoustic-caustic' ? 8 + Math.floor(Math.random() * 7) : 4 + Math.floor(Math.random() * 8),
        densityConcentration: Math.round((0.68 + Math.random() * 0.24) * 100) / 100,
        attractors: [
          {
            id: 'att-1',
            x: Math.round((-0.45 + Math.random() * 0.9) * 100) / 100,
            y: Math.round((-0.35 + Math.random() * 0.7) * 100) / 100,
            strength: Math.round((0.12 + Math.random() * 0.45) * 100) / 100,
            radius: Math.round((0.45 + Math.random() * 0.45) * 100) / 100,
          },
          {
            id: 'att-2',
            x: Math.round((-0.45 + Math.random() * 0.9) * 100) / 100,
            y: Math.round((-0.35 + Math.random() * 0.7) * 100) / 100,
            strength: Math.round((-0.45 + Math.random() * 0.35) * 100) / 100,
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

  const handleExportMp4 = useCallback(async () => {
    const viewport = viewportRef.current;
    if (!viewport || videoAbortRef.current) return;

    const controller = new AbortController();
    videoAbortRef.current = controller;
    setVideoProgress({
      frameIndex: 0,
      totalFrames: videoDuration * 30,
      phase: 'encoding',
      backend: 'webcodecs',
    });
    setStatusMessage(`Encoding ${videoDuration}s MP4 video…`);

    try {
      const result = await viewport.exportMp4({
        exportWidth: config.canvas.exportWidth,
        seed: config.sim.seed,
        durationSec: videoDuration,
        signal: controller.signal,
        onProgress: setVideoProgress,
      });
      if (result) {
        const sizeMb = (result.byteLength / (1024 * 1024)).toFixed(2);
        setStatusMessage(
          `Exported ${result.filename} (${result.width} × ${result.height}, ${result.durationSec}s MP4, ${sizeMb} MB)`,
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatusMessage('Cancelled MP4 export');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMessage(`MP4 export failed: ${msg}`);
      }
    } finally {
      videoAbortRef.current = null;
      setVideoProgress(null);
    }
  }, [config.canvas.exportWidth, config.sim.seed, videoDuration]);

  const handleCancelMp4 = useCallback(() => {
    videoAbortRef.current?.abort();
  }, []);

  const isExportingVideo = videoProgress !== null;
  const exportPercent = videoProgress
    ? Math.min(100, Math.round((videoProgress.frameIndex / Math.max(1, videoProgress.totalFrames)) * 100))
    : 0;

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
          <a
            className="repo-pill"
            href="https://github.com/antonarhipov/airwaves"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open antonarhipov/airwaves repository on GitHub"
            title="View antonarhipov/airwaves on GitHub"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            <span>GitHub</span>
          </a>
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
            disabled={isExportingVideo}
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

          <button
            type="button"
            className="btn btn-primary"
            disabled={isExportingVideo}
            onClick={handleExport}
          >
            <Download size={14} aria-hidden="true" />
            <span>Export PNG</span>
          </button>

          <div className="video-export-group">
            <label htmlFor={videoDurationId} className="visually-hidden">
              MP4 Duration
            </label>
            <select
              id={videoDurationId}
              className="select-input"
              style={{ width: 'auto', minBlockSize: '32px' }}
              value={videoDuration}
              disabled={isExportingVideo}
              onChange={(e) => setVideoDuration(Number(e.target.value) as VideoDurationOption)}
            >
              {VIDEO_DURATION_OPTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}s MP4
                </option>
              ))}
            </select>

            {isExportingVideo ? (
              <div className="video-export-progress" role="status" aria-live="polite">
                <div className="video-progress-track" aria-hidden="true">
                  <div className="video-progress-fill" style={{ width: `${exportPercent}%` }} />
                </div>
                <span className="video-progress-label">
                  {videoProgress?.phase === 'finalizing' ? 'Muxing…' : `${exportPercent}%`}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleCancelMp4}
                  aria-label="Cancel MP4 export"
                  title="Cancel MP4 export"
                >
                  <X size={13} aria-hidden="true" />
                  <span>Cancel</span>
                </button>
              </div>
            ) : (
              <button type="button" className="btn" onClick={handleExportMp4}>
                <Film size={14} aria-hidden="true" />
                <span>Export MP4</span>
              </button>
            )}
          </div>

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
