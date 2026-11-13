# Mathematical & Simulation Model

Every composition in Airwaves Studio is generated purely from deterministic mathematical algorithms—no raster textures, pre-baked assets, or generative AI APIs are used.

## 1. Deterministic Seeding (`src/math/prng.ts`)

User-supplied seeds (arbitrary strings such as `IDEA-2026.3`) are hashed via 32-bit **FNV-1a** (`hashSeed`) into a `Mulberry32` PRNG state. To prevent parameter changes in one subsystem from scrambling unrelated random draws, `createPRNG` supports `fork(salt)`:

- `rng.fork('noise')` builds the 512-entry noise permutation table.
- `rng.fork('acoustic')` seeds twisted ribbon frequencies, pinch waist position, and carrier phases.
- `rng.fork('vortices')` places localized Gaussian rotational eddies for `airflow-streamlines`.
- `rng.fork('curves')` derives harmonic phases, frequencies, and ribbon offsets for each guiding curve.
- `rng.fork('particles')` samples particle coordinates, depths, roles, and size seeds.

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

## 3. Acoustic Caustic Ribbon (`acoustic-caustic`) & Guiding Curves (`src/simulation/flowField.ts`)

To create sculptural braided airwaves rather than dispersed star swarms:

1. **Twisted Parametric Sheet**: `evalAcousticRibbon(s, phi)` parameterizes a continuous 3D wave sheet across longitudinal flow $s \in [0, 1]$ and strand phase $\phi \in [0, 2\pi)$ modulated by a pinch-and-swell harmonic envelope (`entryPinch * nodePinch`).
2. **Optical Fold Caustics**: Along fold crests ($\theta_1 \approx \pi / 2$, where $|\partial v / \partial \phi| \to 0$), neighboring strands bunch together naturally, creating bright caustic ridges (`causticBoost`), gauzy translucent pockets between crossings, and up to ~26% taller echoing outer filaments (`isOuterArc`).
3. **Coherent Low-Frequency Bending**: Both guiding filaments (`220` segments per curve) and core particles share `warpPoint(x, y)` with smooth low-frequency curl noise (`0.48 * noiseScale`) so waves bend gracefully around attractors without tearing into noisy clumps.
4. **Role-Partitioned Sampling**: `runSimulation()` balances primary caustic fold grains, discrete braided strand particles, continuous sheet fill, crisp focal-plane spray dust, beads riding outer arcs, and sparse (~1.5%) peripheral optical bokeh orbs.

## 4. Six-Stage Airflow RK2 Streamline Simulation (`airflow-streamlines`)

For dynamic, crossed-sheet vector-field compositions (`Airflow RK2 Prism`):

1. **Composite Vector Field**: `sampleField(x, y)` sums base directional flow, dual-carrier harmonic waves, gentle caustic sheet convergence (`fvConverge`), 3 seeded `GaussianVortex` eddies, seeded 2D curl noise, user attractors/repellers, and typography safe-zone deflection.
2. **Cached Eulerian Grid**: `ensureFieldGrid()` samples the vector field once onto a deterministic `200 × 120` bilinear grid (`sampleFieldCached`), keeping multi-step Runge-Kutta integration fast (~100 ms for 54k particles).
3. **Multi-Step RK2 Particle Advection**: Particles spawn across three overlapping wave sheets and advect for 8–27 RK2 midpoint steps ($\Delta t = 0.024$) through `sampleFieldCached`, allowing luminous ridges and density gradients to emerge organically from streamline convergence.
4. **Unit-Tangent Streamline Integration**: Guiding lines integrate `220` RK2 steps of $\frac{dP}{ds} = \frac{F(P)}{|F(P)|}$ (`integrateStreamline`) from seeded left-edge anchors through the exact same vector field driving the particles.
5. **Cross-Sheet Color & Diffraction Glints**: Longitudinal coordinate $u$, cross-sheet index, and local velocity speed shift palette parameter $t$, while top-energy crest hotspots trigger 4-point optical diffraction glints.

## 5. Legacy Fields, Particle Placement & Safe Zone (`src/simulation/particleSim.ts`)

For `harmonic-ribbon`, `curl-noise`, `vortex-stream`, and `interference` modes:

1. **Mixture Sampling**: Particles sample along `140`-step guiding curves (`ridgeTightness`), broad dispersion around filaments (`wideDispersion`), or ambient bokeh (`isAmbientBokeh`), followed by single-step RK2 advection and 3-segment motion trails.
2. **Size Distributions**:
   - `bimodal-bokeh`: crisp micro-sparks combined with medium pearls and out-of-focus bokeh orbs (restricted off the caustic spine in `acoustic-caustic` / `airflow-streamlines`).
   - `power-law`: Heavy-tailed distribution dominated by fine dust with rare luminous orbs.
   - `fine-dust` / `uniform`: Tighter particle radii for architectural or misty textures.
3. **Attractors & Typography Safe Zone**: Each attractor/repeller applies Gaussian falloff $\exp(-d^2 / r^2)$ with radial pull/push plus gentle orbital twist. `safeZoneMask(x, y)` computes an elliptical smoothstep mask around `top-left`, `bottom-left`, `top-right`, or `center` to keep title typography crisp and readable.
