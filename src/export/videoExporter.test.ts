import { describe, expect, it } from 'vitest';
import {
  REALTIME_MOTION_SCALE,
  buildVideoFilename,
  computeSimulationTimeStep,
  computeTargetBitrate,
  exportCompositionToMp4,
  normalizeEvenDimension,
  sanitizeSeedForFilename,
} from './videoExporter';
import type { SplashRenderer } from '../rendering/SplashRenderer';
import { DEFAULT_CONFIG } from '../types/presets';

describe('videoExporter helpers', () => {
  it('normalizes dimensions to even integers >= minimum size for H.264 yuv420p', () => {
    expect(normalizeEvenDimension(1920)).toBe(1920);
    expect(normalizeEvenDimension(1079)).toBe(1080);
    expect(normalizeEvenDimension(1081) % 2).toBe(0);
    expect(normalizeEvenDimension(125)).toBe(320);
    expect(normalizeEvenDimension(321, 321)).toBe(322);
  });

  it('matches SplashViewport realtime motion scaling per frame', () => {
    const dt30 = computeSimulationTimeStep(30, 1.0);
    expect(dt30).toBeCloseTo((1 / 30) * REALTIME_MOTION_SCALE, 8);
    expect(computeSimulationTimeStep(60, 2.5)).toBeCloseTo((2.5 / 60) * REALTIME_MOTION_SCALE, 8);
  });

  it('builds sanitized descriptive MP4 filenames', () => {
    expect(sanitizeSeedForFilename('air flow / test!')).toBe('air-flow-test-');
    expect(buildVideoFilename('airflow-01', 1920, 1080, 10)).toBe(
      'airwaves-airflow-01-1920x1080-10s.mp4',
    );
  });

  it('clamps target H.264 bitrates within safe desktop and 4K bounds', () => {
    expect(computeTargetBitrate(320, 320, 30)).toBe(4_000_000);
    expect(computeTargetBitrate(1920, 1080, 30)).toBeGreaterThan(10_000_000);
    expect(computeTargetBitrate(7680, 4320, 60)).toBe(28_000_000);
  });

  it('aborts immediately when signal is already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      exportCompositionToMp4({
        renderer: {} as SplashRenderer,
        typography: DEFAULT_CONFIG.typography,
        seed: 'cancelled',
        startTimeSec: 0,
        exportWidth: 1280,
        aspectRatio: 16 / 9,
        durationSec: 5,
        animationSpeed: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
