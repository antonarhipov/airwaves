import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { SplashRenderer } from '../rendering/SplashRenderer';
import { drawTypographyAndLogo } from '../rendering/overlayRenderer';
import type { SimulationData } from '../simulation/particleSim';
import type {
  AspectRatioId,
  AttractorNode,
  TypographyParams,
  VisualParams,
} from '../types/config';
import { ASPECT_RATIOS } from '../types/presets';

export interface SplashViewportHandle {
  exportPng: (exportWidth: number, seed: string) => void;
}

interface SplashViewportProps {
  simData: SimulationData;
  visual: VisualParams;
  typography: TypographyParams;
  aspectRatio: AspectRatioId;
  attractors: AttractorNode[];
  showFieldNodes: boolean;
  statusAnnouncement: string;
  onMoveAttractor: (id: string, x: number, y: number) => void;
  onExportComplete: (filename: string, width: number, height: number) => void;
}

export const SplashViewport = forwardRef<SplashViewportHandle, SplashViewportProps>(
  function SplashViewport(
    {
      simData,
      visual,
      typography,
      aspectRatio,
      attractors,
      showFieldNodes,
      statusAnnouncement,
      onMoveAttractor,
      onExportComplete,
    },
    ref,
  ) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const rendererRef = useRef<SplashRenderer | null>(null);

    const timeRef = useRef(0);
    const visualRef = useRef(visual);
    visualRef.current = visual;

    const [frameSize, setFrameSize] = useState({ width: 960, height: 540 });
    const draggingIdRef = useRef<string | null>(null);

    const ratio = ASPECT_RATIOS[aspectRatio].ratio;

    // Fit canvas frame cleanly inside the stage while preserving exact aspect ratio
    const updateLayoutSize = useCallback(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const padX = 48;
      const padY = 76;
      const availW = Math.max(240, stage.clientWidth - padX);
      const availH = Math.max(180, stage.clientHeight - padY);

      let w = availW;
      let h = w / ratio;
      if (h > availH) {
        h = availH;
        w = h * ratio;
      }
      setFrameSize({ width: Math.round(w), height: Math.round(h) });
    }, [ratio]);

    useEffect(() => {
      updateLayoutSize();
      const stage = stageRef.current;
      if (!stage) return;
      const observer = new ResizeObserver(() => updateLayoutSize());
      observer.observe(stage);
      return () => observer.disconnect();
    }, [updateLayoutSize]);

    // Initialize WebGL Three.js renderer once
    useEffect(() => {
      const canvas = webglCanvasRef.current;
      if (!canvas) return;
      const renderer = new SplashRenderer(canvas);
      rendererRef.current = renderer;

      let rafId = 0;
      let lastNow = performance.now();

      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - lastNow) / 1000);
        lastNow = now;
        if (visualRef.current.animateFlow) {
          timeRef.current += dt * visualRef.current.animationSpeed;
        }
        renderer.render(timeRef.current);
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(rafId);
        renderer.dispose();
        rendererRef.current = null;
      };
    }, []);

    // Upload simulation buffers only when simData changes
    useEffect(() => {
      rendererRef.current?.setSimulationData(simData);
    }, [simData]);

    // Update GPU shader uniforms instantaneously when visual params change
    useEffect(() => {
      rendererRef.current?.updateVisualParams(visual);
    }, [visual]);

    // Resize WebGL renderer and redraw 2D vector overlay when frame dimensions or typography change
    useEffect(() => {
      rendererRef.current?.resize(frameSize.width, frameSize.height);

      const overlay = overlayCanvasRef.current;
      if (!overlay) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      overlay.width = Math.round(frameSize.width * dpr);
      overlay.height = Math.round(frameSize.height * dpr);
      const ctx = overlay.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, frameSize.width, frameSize.height);
      drawTypographyAndLogo(ctx, frameSize.width, frameSize.height, typography);
    }, [frameSize, typography]);

    // Export high-resolution PNG combining WebGL frame + crisp vector typography/logo
    useImperativeHandle(
      ref,
      () => ({
        exportPng: (exportWidth: number, seed: string) => {
          const renderer = rendererRef.current;
          if (!renderer) return;
          const targetW = Math.max(320, Math.round(exportWidth));
          const targetH = Math.max(320, Math.round(targetW / ratio));

          const composite = renderer.renderHighResFrame(targetW, targetH, timeRef.current);
          const ctx = composite.getContext('2d');
          if (ctx) {
            drawTypographyAndLogo(ctx, targetW, targetH, typography);
          }

          composite.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const safeSeed = seed.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 32) || 'splash';
            const filename = `airwaves-${safeSeed}-${targetW}x${targetH}.png`;
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            onExportComplete(filename, targetW, targetH);
          }, 'image/png');
        },
      }),
      [ratio, typography, onExportComplete],
    );

    // Coordinate conversion between normalized sim space and canvas frame percentages
    const simToScreenPct = (x: number, y: number) => {
      const ndcX = (x / Math.max(0.3, ratio)) * 1.25;
      const ndcY = y * 1.15;
      return {
        leftPct: (ndcX * 0.5 + 0.5) * 100,
        topPct: (-ndcY * 0.5 + 0.5) * 100,
      };
    };

    const pointerToSim = (clientX: number, clientY: number) => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      return {
        x: Math.max(-1.4, Math.min(1.4, (ndcX / 1.25) * Math.max(0.3, ratio))),
        y: Math.max(-1.1, Math.min(1.1, ndcY / 1.15)),
      };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingIdRef.current) return;
      const { x, y } = pointerToSim(e.clientX, e.clientY);
      onMoveAttractor(draggingIdRef.current, Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    };

    const stopDragging = () => {
      draggingIdRef.current = null;
    };

    return (
      <main ref={stageRef} className="canvas-stage" aria-label="Particle Art Preview">
        <div
          ref={frameRef}
          className="canvas-frame"
          style={{ width: `${frameSize.width}px`, height: `${frameSize.height}px` }}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <canvas ref={webglCanvasRef} className="canvas-layer" />
          <canvas ref={overlayCanvasRef} className="canvas-layer overlay-layer" />

          {showFieldNodes && (
            <div className="gizmo-layer" aria-label="Interactive field nodes">
              {attractors.map((node) => {
                const pos = simToScreenPct(node.x, node.y);
                const isAttractor = node.strength >= 0;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`attractor-handle ${isAttractor ? 'is-attractor' : 'is-repeller'}`}
                    style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
                    aria-label={`${isAttractor ? 'Attractor' : 'Repeller'} handle — drag to reposition`}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      draggingIdRef.current = node.id;
                    }}
                  >
                    {isAttractor ? '+' : '−'}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="stage-footer-bar">
          <span>{aspectRatio}</span>
          <span aria-hidden="true">•</span>
          <span>
            {simData.particleCount.toLocaleString()} particles ({simData.computeTimeMs} ms sim)
          </span>
        </div>

        <div className="visually-hidden" aria-live="polite">
          {statusAnnouncement}
        </div>
      </main>
    );
  },
);
