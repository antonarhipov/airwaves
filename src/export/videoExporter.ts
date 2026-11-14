import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import wasmEncoderScriptUrl from 'h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js?url';
import type { H264MP4Encoder } from 'h264-mp4-encoder';
import type { SplashRenderer } from '../rendering/SplashRenderer';
import { drawTypographyAndLogo } from '../rendering/overlayRenderer';
import type { TypographyParams } from '../types/config';

/**
 * Matches the real-time flow speed scaling in SplashViewport's rAF loop so exported
 * videos play at the exact visual speed shown in the live canvas preview.
 */
export const REALTIME_MOTION_SCALE = 0.2;

export const DEFAULT_EXPORT_FPS = 30;
export const VIDEO_DURATION_OPTIONS = [5, 10, 15, 30] as const;
export type VideoDurationOption = (typeof VIDEO_DURATION_OPTIONS)[number];

export type VideoEncoderBackend = 'webcodecs' | 'wasm-h264';

export interface VideoExportProgress {
  frameIndex: number;
  totalFrames: number;
  phase: 'encoding' | 'finalizing';
  backend: VideoEncoderBackend;
}

export interface VideoExportOptions {
  renderer: SplashRenderer;
  typography: TypographyParams;
  seed: string;
  startTimeSec: number;
  exportWidth: number;
  aspectRatio: number;
  durationSec: number;
  fps?: number;
  animationSpeed: number;
  signal?: AbortSignal;
  onProgress?: (progress: VideoExportProgress) => void;
}

export interface VideoExportResult {
  filename: string;
  width: number;
  height: number;
  durationSec: number;
  frameCount: number;
  byteLength: number;
  backend: VideoEncoderBackend;
}

interface VideoFrameSink {
  readonly backend: VideoEncoderBackend;
  encodeFrame(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    fps: number,
    isKeyFrame: boolean,
  ): Promise<void>;
  finalize(): Promise<Uint8Array>;
  dispose(): void;
}

interface HmeGlobal {
  createH264MP4Encoder: () => Promise<H264MP4Encoder>;
}

const AVC_CODEC_CANDIDATES = [
  'avc1.640033', // H.264 High L5.1 (supports up to 4K)
  'avc1.640028', // H.264 High L4.0 (up to 1080p)
  'avc1.4D4028', // H.264 Main L4.0
  'avc1.42E028', // H.264 Baseline L4.0
] as const;

let hmeLoaderPromise: Promise<HmeGlobal> | null = null;

/** Sanitize user seed text for safe cross-platform download filenames. */
export function sanitizeSeedForFilename(seed: string): string {
  return seed.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 32) || 'splash';
}

/** Round pixel dimensions to even integers required by H.264 yuv420p encoders. */
export function normalizeEvenDimension(value: number, min = 320): number {
  const safeMin = Math.ceil(min / 2) * 2;
  return Math.max(safeMin, Math.round(value / 2) * 2);
}

/** Calculate per-frame simulation delta matching SplashViewport's preview clock. */
export function computeSimulationTimeStep(fps: number, animationSpeed: number): number {
  return (1 / Math.max(1, fps)) * animationSpeed * REALTIME_MOTION_SCALE;
}

/** Build a descriptive MP4 filename incorporating seed, pixel dimensions, and duration. */
export function buildVideoFilename(
  seed: string,
  width: number,
  height: number,
  durationSec: number,
): string {
  return `airwaves-${sanitizeSeedForFilename(seed)}-${width}x${height}-${durationSec}s.mp4`;
}

/** Estimate an H.264 target bitrate scaled by resolution and frame rate. */
export function computeTargetBitrate(width: number, height: number, fps: number): number {
  const raw = Math.round(width * height * fps * 0.22);
  return Math.max(4_000_000, Math.min(28_000_000, raw));
}

function yieldToMainThread(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Video export cancelled', 'AbortError');
  }
}

/** Trigger a browser file download from raw bytes and revoke its object URL afterward. */
export function triggerFileDownload(bytes: Uint8Array, mimeType: string, filename: string): void {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Probe WebCodecs VideoEncoder for the first supported H.264 configuration. */
async function selectWebCodecsAvcConfig(
  width: number,
  height: number,
  fps: number,
): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }
  const bitrate = computeTargetBitrate(width, height, fps);
  const preferences: Array<HardwareAcceleration | undefined> = ['prefer-hardware', undefined];

  for (const hardwareAcceleration of preferences) {
    for (const codec of AVC_CODEC_CANDIDATES) {
      const candidate: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        ...(hardwareAcceleration ? { hardwareAcceleration } : {}),
      };
      try {
        const support = await VideoEncoder.isConfigSupported(candidate);
        if (support.supported && support.config) {
          return support.config;
        }
      } catch {
        // Ignore unsupported codec/level combinations and continue probing.
      }
    }
  }
  return null;
}

async function createWebCodecsSink(
  width: number,
  height: number,
  fps: number,
): Promise<VideoFrameSink | null> {
  const config = await selectWebCodecsAvcConfig(width, height, fps);
  if (!config) return null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });
  encoder.configure(config);

  const frameDurationUs = Math.round(1_000_000 / fps);

  return {
    backend: 'webcodecs',
    async encodeFrame(canvas, _ctx, frameIndex, _fps, isKeyFrame) {
      if (encoderError) throw encoderError;
      while (encoder.encodeQueueSize > 4) {
        if (encoderError) throw encoderError;
        await yieldToMainThread();
      }
      const timestampUs = Math.round((frameIndex * 1_000_000) / fps);
      const frame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });
      try {
        encoder.encode(frame, { keyFrame: isKeyFrame });
      } finally {
        frame.close();
      }
    },
    async finalize() {
      if (encoderError) throw encoderError;
      await encoder.flush();
      if (encoderError) throw encoderError;
      muxer.finalize();
      return new Uint8Array(target.buffer);
    },
    dispose() {
      if (encoder.state !== 'closed') {
        try {
          encoder.close();
        } catch {
          // Ignore close errors if encoder already faulted.
        }
      }
    },
  };
}

function loadWasmEncoderGlobal(): Promise<HmeGlobal> {
  const win = window as unknown as { HME?: HmeGlobal };
  if (win.HME) {
    return Promise.resolve(win.HME);
  }
  if (!hmeLoaderPromise) {
    hmeLoaderPromise = new Promise<HmeGlobal>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = wasmEncoderScriptUrl;
      script.async = true;
      script.onload = () => {
        if (win.HME) {
          resolve(win.HME);
        } else {
          hmeLoaderPromise = null;
          reject(new Error('WASM H.264 encoder script loaded without exposing HME global.'));
        }
      };
      script.onerror = () => {
        hmeLoaderPromise = null;
        reject(new Error('Failed to load fallback WASM H.264 encoder script.'));
      };
      document.head.appendChild(script);
    });
  }
  return hmeLoaderPromise;
}

async function createWasmH264Sink(
  width: number,
  height: number,
  fps: number,
): Promise<VideoFrameSink> {
  const hme = await loadWasmEncoderGlobal();
  const encoder = await hme.createH264MP4Encoder();
  encoder.width = width;
  encoder.height = height;
  encoder.frameRate = fps;
  encoder.groupOfPictures = fps;
  encoder.speed = 6;
  encoder.quantizationParameter = 18;
  encoder.initialize();

  let deleted = false;

  return {
    backend: 'wasm-h264',
    async encodeFrame(_canvas, ctx) {
      const imageData = ctx.getImageData(0, 0, width, height);
      encoder.addFrameRgba(imageData.data);
    },
    async finalize() {
      encoder.finalize();
      const raw = encoder.FS.readFile(encoder.outputFilename);
      return new Uint8Array(raw);
    },
    dispose() {
      if (!deleted) {
        deleted = true;
        try {
          encoder.delete();
        } catch {
          // Ignore double-delete.
        }
      }
    },
  };
}

/**
 * Render an offline deterministic sequence of the current Airwaves scene and
 * download it as a constant-framerate H.264 MP4 clip.
 */
export async function exportCompositionToMp4(options: VideoExportOptions): Promise<VideoExportResult> {
  const {
    renderer,
    typography,
    seed,
    startTimeSec,
    exportWidth,
    aspectRatio,
    durationSec,
    fps = DEFAULT_EXPORT_FPS,
    animationSpeed,
    signal,
    onProgress,
  } = options;

  throwIfAborted(signal);

  const safeFps = Math.max(1, Math.round(fps));
  const safeDuration = Math.max(1, Math.round(durationSec));
  const totalFrames = safeDuration * safeFps;
  const targetW = normalizeEvenDimension(exportWidth);
  const targetH = normalizeEvenDimension(targetW / Math.max(0.25, aspectRatio));
  const timeStep = computeSimulationTimeStep(safeFps, animationSpeed);

  const sink =
    (await createWebCodecsSink(targetW, targetH, safeFps)) ??
    (await createWasmH264Sink(targetW, targetH, safeFps));

  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = targetW;
  compositeCanvas.height = targetH;
  const compositeCtx = compositeCanvas.getContext('2d', {
    willReadFrequently: sink.backend === 'wasm-h264',
  });
  if (!compositeCtx) {
    sink.dispose();
    throw new Error('Could not acquire 2D compositing context for MP4 export.');
  }

  const prevViewport = renderer.getViewportState();

  try {
    renderer.resize(targetW, targetH, 1);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      throwIfAborted(signal);

      const simTime = startTimeSec + frameIndex * timeStep;
      compositeCtx.clearRect(0, 0, targetW, targetH);
      renderer.renderToContext(simTime, compositeCtx, targetW, targetH);
      drawTypographyAndLogo(compositeCtx, targetW, targetH, typography);

      const isKeyFrame = frameIndex % safeFps === 0;
      await sink.encodeFrame(compositeCanvas, compositeCtx, frameIndex, safeFps, isKeyFrame);

      onProgress?.({
        frameIndex: frameIndex + 1,
        totalFrames,
        phase: 'encoding',
        backend: sink.backend,
      });

      await yieldToMainThread();
    }

    throwIfAborted(signal);
    onProgress?.({
      frameIndex: totalFrames,
      totalFrames,
      phase: 'finalizing',
      backend: sink.backend,
    });

    const mp4Bytes = await sink.finalize();
    const filename = buildVideoFilename(seed, targetW, targetH, safeDuration);
    triggerFileDownload(mp4Bytes, 'video/mp4', filename);

    return {
      filename,
      width: targetW,
      height: targetH,
      durationSec: safeDuration,
      frameCount: totalFrames,
      byteLength: mp4Bytes.byteLength,
      backend: sink.backend,
    };
  } finally {
    sink.dispose();
    renderer.resize(prevViewport.width, prevViewport.height, prevViewport.pixelRatio);
    renderer.render(startTimeSec);
  }
}
