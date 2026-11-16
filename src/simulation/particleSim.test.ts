import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, STUDIO_PRESETS } from '../types/presets';
import {
  DEFAULT_LANDSCAPE_PARAMS,
  compositionToLandscapeLayout,
  evaluateLandscapePoint,
} from './landscapeSim';
import { runSimulation } from './particleSim';

describe('Deterministic Particle Airwave Simulation', () => {
  it('produces bit-identical simulation buffers for the same seed and parameters', () => {
    const params = { ...DEFAULT_CONFIG.sim, particleCount: 4000 };
    const runA = runSimulation(params);
    const runB = runSimulation(params);

    expect(runA.particleCount).toBe(4000);
    expect(runA.positions).toEqual(runB.positions);
    expect(runA.velocities).toEqual(runB.velocities);
    expect(runA.attributes).toEqual(runB.attributes);
    expect(runA.trailPositions).toEqual(runB.trailPositions);
    expect(runA.curvePositions).toEqual(runB.curvePositions);
  });

  it('produces distinct particle distributions for different seeds', () => {
    const runA = runSimulation({ ...DEFAULT_CONFIG.sim, seed: 'seed-alpha', particleCount: 2000 });
    const runB = runSimulation({ ...DEFAULT_CONFIG.sim, seed: 'seed-beta', particleCount: 2000 });

    let diffCount = 0;
    for (let i = 0; i < runA.positions.length; i++) {
      if (runA.positions[i] !== runB.positions[i]) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(1000);
  });

  it('supports both simplex and perlin noise without NaN values', () => {
    for (const noiseType of ['simplex', 'perlin'] as const) {
      const sim = runSimulation({ ...DEFAULT_CONFIG.sim, noiseType, particleCount: 3000 });
      for (let i = 0; i < sim.positions.length; i++) {
        expect(Number.isFinite(sim.positions[i])).toBe(true);
      }
      for (let i = 0; i < sim.curvePositions.length; i++) {
        expect(Number.isFinite(sim.curvePositions[i])).toBe(true);
      }
    }
  });

  it('attenuates particle energy inside the typography safe zone', () => {
    const withSafe = runSimulation({
      ...DEFAULT_CONFIG.sim,
      particleCount: 5000,
      safeZone: 'top-left',
      safeZoneStrength: 1.0,
      safeZoneRadius: 0.5,
    });
    const withoutSafe = runSimulation({
      ...DEFAULT_CONFIG.sim,
      particleCount: 5000,
      safeZone: 'none',
    });

    const avgEnergyInTopLeft = (sim: ReturnType<typeof runSimulation>) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < sim.particleCount; i++) {
        const x = sim.positions[i * 3];
        const y = sim.positions[i * 3 + 1];
        if (x < -0.25 && y > 0.2) {
          sum += sim.attributes[i * 4 + 2];
          n++;
        }
      }
      return n > 0 ? sum / n : 0;
    };

    expect(avgEnergyInTopLeft(withSafe)).toBeLessThan(avgEnergyInTopLeft(withoutSafe));
  });

  it('generates expected guiding curve and trail vertex counts', () => {
    const sim = runSimulation({
      ...DEFAULT_CONFIG.sim,
      fieldMode: 'acoustic-caustic',
      particleCount: 2000,
      guidingCurves: 6,
      trailLength: 0.5,
    });
    expect(sim.curveVertexCount).toBe(6 * 219 * 2);
    expect(sim.trailVertexCount).toBe(2000 * 3 * 2);

    const legacySim = runSimulation({
      ...DEFAULT_CONFIG.sim,
      fieldMode: 'harmonic-ribbon',
      particleCount: 2000,
      guidingCurves: 6,
      trailLength: 0.5,
    });
    expect(legacySim.curveVertexCount).toBe(6 * 139 * 2);

    const noTrails = runSimulation({
      ...DEFAULT_CONFIG.sim,
      particleCount: 2000,
      trailLength: 0,
    });
    expect(noTrails.trailVertexCount).toBe(0);
  });

  it('produces finite coherent coordinates across acoustic-caustic and airflow-streamlines compositions', () => {
    for (const fieldMode of ['acoustic-caustic', 'airflow-streamlines'] as const) {
      for (const composition of ['diagonal-flow', 'central-wave', 'radial-flow'] as const) {
        const sim = runSimulation({
          ...DEFAULT_CONFIG.sim,
          fieldMode,
          composition,
          flowDirection: composition === 'radial-flow' ? 'radial' : 'diagonal',
          particleCount: 2500,
        });
        expect(sim.curveVertexCount).toBe(DEFAULT_CONFIG.sim.guidingCurves * 219 * 2);
        for (let i = 0; i < sim.positions.length; i++) {
          expect(Number.isFinite(sim.positions[i])).toBe(true);
        }
        for (let i = 0; i < sim.curvePositions.length; i++) {
          expect(Number.isFinite(sim.curvePositions[i])).toBe(true);
        }
      }
    }
  });

  it('implements closed-form Halton + Murmur3 3D Landscape evaluation with deterministic scrubbability', () => {
    const preset = STUDIO_PRESETS.find((p) => p.id === 'landscape-champagne-wave');
    expect(preset).toBeDefined();

    const params = {
      ...preset!.config.sim,
      particleCount: 3000,
      guidingCurves: 18,
    };
    const simA = runSimulation(params);
    const simB = runSimulation(params);

    expect(simA.landscape).toBeDefined();
    expect(simA.positions).toEqual(simB.positions);
    expect(simA.landscape!.particleDomain).toEqual(simB.landscape!.particleDomain);
    expect(simA.curveVertexCount).toBe(18 * 159 * 2);

    // Ridge vs dust stratification matches rho_ridge = 0.70 within Monte Carlo tolerance
    let ridgeCount = 0;
    for (let i = 0; i < simA.particleCount; i++) {
      if (simA.landscape!.particleDomain[i * 4 + 3] > 0.5) ridgeCount++;
    }
    const ridgeFrac = ridgeCount / simA.particleCount;
    expect(ridgeFrac).toBeGreaterThan(0.66);
    expect(ridgeFrac).toBeLessThan(0.74);

    // Closed-form temporal scrubbability: same inputs at t=0, t=2.5, t=0 produce identical results
    const ptT0 = evaluateLandscapePoint(0.42, 0.08, 0, 1.0, 0.35, DEFAULT_LANDSCAPE_PARAMS, 42026);
    const ptT2 = evaluateLandscapePoint(0.42, 0.08, 2.5, 1.0, 0.35, DEFAULT_LANDSCAPE_PARAMS, 42026);
    const ptT0Again = evaluateLandscapePoint(0.42, 0.08, 0, 1.0, 0.35, DEFAULT_LANDSCAPE_PARAMS, 42026);

    expect(ptT0).toEqual(ptT0Again);
    expect(ptT2.yWorld).not.toBe(ptT0.yWorld);
    expect(Number.isFinite(ptT2.xNdc)).toBe(true);
    expect(Number.isFinite(ptT2.yNdc)).toBe(true);
  });

  it('produces distinct coherent 3D landscape geometry across all 5 composition layouts', () => {
    const preset = STUDIO_PRESETS.find((p) => p.id === 'landscape-champagne-wave')!;
    const layouts = [
      'diagonal-flow',
      'horizontal-flow',
      'central-wave',
      'vertical-flow',
      'radial-flow',
    ] as const;

    const snapshots: Array<{ layoutMode: number; x0: number; y0: number }> = [];
    for (const composition of layouts) {
      const sim = runSimulation({
        ...preset.config.sim,
        composition,
        particleCount: 1000,
        guidingCurves: 6,
      });
      expect(sim.landscape?.layoutMode).toBe(compositionToLandscapeLayout(composition));
      for (let i = 0; i < sim.positions.length; i++) {
        expect(Number.isFinite(sim.positions[i])).toBe(true);
      }
      snapshots.push({
        layoutMode: sim.landscape!.layoutMode,
        x0: sim.positions[0],
        y0: sim.positions[1],
      });
    }

    expect(new Set(snapshots.map((s) => s.layoutMode)).size).toBe(5);
    expect(new Set(snapshots.map((s) => `${s.x0.toFixed(4)},${s.y0.toFixed(4)}`)).size).toBe(5);

    // Radial vortex ring closes seamlessly at u = 0 and u = 1
    const radial0 = evaluateLandscapePoint(0, 0, 0, 1.0, 0.35, DEFAULT_LANDSCAPE_PARAMS, 42026, 16 / 9, true, 4);
    const radial1 = evaluateLandscapePoint(1, 0, 0, 1.0, 0.35, DEFAULT_LANDSCAPE_PARAMS, 42026, 16 / 9, true, 4);
    expect(radial0.xNdc).toBeCloseTo(radial1.xNdc, 5);
    expect(radial0.yNdc).toBeCloseTo(radial1.yNdc, 5);
  });

  it('applies Size Distribution and Size Variance cleanly across 3D Landscape particles', () => {
    const preset = STUDIO_PRESETS.find((p) => p.id === 'landscape-champagne-wave')!;
    const dists = ['bimodal-bokeh', 'power-law', 'fine-dust', 'uniform'] as const;

    const getSizeStats = (sizeDistribution: (typeof dists)[number], sizeVariance: number) => {
      const sim = runSimulation({
        ...preset.config.sim,
        sizeDistribution,
        sizeVariance,
        particleCount: 2000,
        guidingCurves: 4,
      });
      const domain = sim.landscape!.particleDomain;
      const sizes: number[] = [];
      for (let i = 0; i < sim.particleCount; i++) {
        sizes.push(domain[i * 4 + 2]);
      }
      const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      const stdDev = Math.sqrt(sizes.reduce((acc, s) => acc + (s - mean) ** 2, 0) / sizes.length);
      return { mean, stdDev };
    };

    const statsByDist = dists.map((d) => getSizeStats(d, 0.72));
    // Each distribution mode should create a measurable signature in size spread / mean
    expect(new Set(statsByDist.map((s) => `${s.mean.toFixed(2)},${s.stdDev.toFixed(2)}`)).size).toBe(4);

    // Higher sizeVariance widens particle size variance for every distribution mode
    for (const dist of dists) {
      const lowVar = getSizeStats(dist, 0.0);
      const highVar = getSizeStats(dist, 1.0);
      expect(highVar.stdDev).toBeGreaterThan(lowVar.stdDev * 1.4);
    }
  });
});
