import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, STUDIO_PRESETS } from '../types/presets';
import { DEFAULT_LANDSCAPE_PARAMS, evaluateLandscapePoint } from './landscapeSim';
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
});
