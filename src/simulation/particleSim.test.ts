import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../types/presets';
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
      particleCount: 2000,
      guidingCurves: 6,
      trailLength: 0.5,
    });
    expect(sim.curveVertexCount).toBe(6 * 139 * 2);
    expect(sim.trailVertexCount).toBe(2000 * 3 * 2);

    const noTrails = runSimulation({
      ...DEFAULT_CONFIG.sim,
      particleCount: 2000,
      trailLength: 0,
    });
    expect(noTrails.trailVertexCount).toBe(0);
  });
});
