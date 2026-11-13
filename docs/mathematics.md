# Mathematical & Simulation Model

Every composition in Airwaves Studio is generated purely from deterministic mathematical algorithms—no raster textures, pre-baked assets, or generative AI APIs are used.

## 1. Deterministic Seeding (`src/math/prng.ts`)

User-supplied seeds (arbitrary strings such as `IDEA-2026.3`) are hashed via 32-bit **FNV-1a** (`hashSeed`) into a `Mulberry32` PRNG state. To prevent parameter changes in one subsystem from scrambling unrelated random draws, `createPRNG` supports `fork(salt)`:

- `rng.fork('noise')` builds the 512-entry noise permutation table.
- `rng.fork('curves')` derives harmonic phases, frequencies, and ribbon offsets for each guiding curve.
- `rng.fork('particles')` samples particle coordinates, depths, and size seeds.

Normal variates (`gaussian()`) are generated with the **Box-Muller transform** for smooth ribbon falloff and focal-depth spread.

## 2. Seeded Simplex, Perlin & Curl Noise (`src/math/noise.ts`)

`Noise2D` initializes its permutation lattice deterministically from the forked `noise` PRNG and supports two continuous basis functions:

- **2D Simplex Noise** (`simplex`): Triangular lattice interpolation with $O(n)$ gradient evaluation and low directional grid bias.
- **2D Perlin Gradient Noise** (`perlin`): Classic lattice interpolation using the quintic fade curve $6t^5 - 15t^4 + 10t^3$.

Both basis functions feed:
- **Fractal Brownian Motion (`fbm`)**: Multi-octave summation with lacunarity `2.02` and gain `0.5`.
- **2D Curl (`curl`)**: Computes the divergence-free vector field from finite differences of the scalar FBM potential $\psi(x, y)$:
  $$\mathbf{v}_{\text{curl}}(x, y) = \left( \frac{\partial \psi}{\partial y},\ -\frac{\partial \psi}{\partial x} \right)$$
  Because $\nabla \cdot \mathbf{v}_{\text{curl}} = 0$, particles swirl into organic eddies and braided ribbons without collapsing into unnatural sinks.

## 3. Harmonic Guiding Curves & Caustic Ridges (`src/simulation/flowField.ts`)

To create the signature braided airwave silhouette rather than uniform noise clouds:

1. `FlowField` constructs $K$ (`guidingCurves`) harmonic filaments. Most curves cluster near the main ribbon (`spreadScale = 0.45`), while up to two outer curves (`isOuterArc`) sweep wider into negative space to create delicate echoing filaments.
2. Each curve is evaluated along parameter $s \in [0, 1]$ using a carrier S-wave plus dual-frequency harmonics modulated by a pinching fan envelope (`fanEnvelope`), or an orbital spiral when `composition === 'radial-flow'`.
3. Every curve vertex and particle coordinate passes through `warpPoint(x, y)`, displacing both coherently through the curl noise, global vortex rotation, and attractor/repeller fields so particles hug the deformed streamlines.

## 4. Particle Placement, Advection & Safe Zone (`src/simulation/particleSim.ts`)

For each particle $i \in [0, N)$:

1. **Ribbon Mixture Sampling**: Particles are drawn either tightly along a guiding curve (`ridgeTightness`, forming bright caustic ridges), more broadly across the ribbon (`wideDispersion`), or as sparse ambient bokeh (`isAmbientBokeh`).
2. **Size Distributions**:
   - `bimodal-bokeh`: ~4.5% large out-of-focus bokeh orbs, ~13.5% medium pearls, and ~82% crisp micro-sparks.
   - `power-law`: Heavy-tailed Pareto-like distribution ($u^{4.2}$) dominated by fine dust with rare luminous orbs.
   - `fine-dust` / `uniform`: Tighter particle radii for architectural or misty textures.
3. **RK2 Midpoint Advection & Trails**: Particles take a deterministic 2nd-order Runge-Kutta step along `sampleField(x, y)`, which combines the selected `fieldMode` (`harmonic-ribbon`, `curl-noise`, `vortex-stream`, `interference`), curl turbulence, vortex swirl, and all `AttractorNode` potentials:
   - Each attractor/repeller applies Gaussian falloff $\exp(-d^2 / r^2)$ with radial pull/push (`strength * 0.72`) plus a subtle orbital twist (`strength * 0.32`).
   - Up to `18,000` particles emit 3-segment backwards streamline trails (`trailPositions`) with tapering alpha.
4. **Typography Safe Zone**: `safeZoneMask(x, y)` computes an elliptical smoothstep mask around the configured region (`top-left`, `bottom-left`, `top-right`, `center`), gently deflecting field vectors away from the title block and attenuating particle/curve energy inside the zone so typography remains legible.
