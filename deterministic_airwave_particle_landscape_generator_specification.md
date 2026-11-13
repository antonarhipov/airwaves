# Technical Specification: Deterministic Airwave Particle Landscape Generator

## 1. Overview & Design Goals

This document specifies a deterministic, closed-form procedural generator designed to synthesize 3D particle swarms and continuous vector filaments that resemble rolling landscapes and harmonic airwaves.

### Core Requirements
* **Strict Determinism:** Given an identical seed $S$ and parameter set $\Theta$, the generator must produce bit-identical spatial coordinates across platforms without relying on stateful PRNG sequences or iterative physics integration.
* **Temporal Scrubbability:** Time $t$ acts as a continuous phase input parameter ($P(i, t)$), allowing smooth animation or static frame extraction at any timestamp without simulation warm-up.
* **Landscape Topology:** The macro-structure must read as a sweeping, undulating ribbon of ridges and valleys tilted in 3D perspective space.
* **Optical Realism:** Visual depth relies on thin-lens Circle of Confusion (CoC) bokeh simulation, energy-conserving opacity scaling, and additive light accumulation.

---

## 2. Coordinate Domain & Deterministic Seeding

Rather than spawning particles via uniform pseudorandom distributions (`rand()`), which introduce clumping and voids, every particle index $i \in \{0, 1, \dots, N-1\}$ is mapped deterministically into a normalized 2D parameter domain $(u, v)$ using a low-discrepancy quasi-random sequence.

### 2.1 Quasi-Random Parameter Mapping
Using the 2D Halton sequence with coprime bases $b_1 = 2$ and $b_2 = 3$ (or the additive $R_2$ plastic-constant sequence):

$$u_i = \text{Halton}(i + \text{offset}_u, 2) \in [0, 1]$$

$$v_{\text{raw}, i} = 2 \cdot \text{Halton}(i + \text{offset}_v, 3) - 1 \in [-1, 1]$$

* $u_i$: Longitudinal coordinate along the primary wave propagation axis (left-to-right).
* $v_{\text{raw}, i}$: Lateral cross-sectional coordinate across the ribbon's depth/width.

### 2.2 Ridge Clustering vs. Ambient Dust Stratification
To achieve high-contrast luminous ridge lines surrounded by sparse atmospheric dust, particles are partitioned deterministically using a stateless integer hash $H(i, S) \in [0, 1)$:

* **Ridge Population ($H(i, S) < \rho_{\text{ridge}}$, default $\rho_{\text{ridge}} = 0.70$):**
  Concentrated non-linearly toward the central spine ($v = 0$) or discrete harmonic contour lanes $v_m$:
  $$v_i = \text{sign}(v_{\text{raw}, i}) \cdot |v_{\text{raw}, i}|^{p} \quad \text{where } p \in [2.5, 4.0]$$

* **Ambient Dust Population ($H(i, S) \ge \rho_{\text{ridge}}$):**
  Distributed broadly across the vertical and lateral envelope:
  $$v_i = v_{\text{raw}, i} \cdot w_{\text{scatter}} \quad \text{where } w_{\text{scatter}} \in [1.2, 1.8]$$

---

## 3. Macro-Geometry: The Landscape Wave Surface

Each particle's domain coordinate $(u_i, v_i)$ is mapped onto a tilted 3D manifold $\mathbf{P}_0(u, v, t) = (x_0, y_0, z_0)$.

### 3.1 Base Perspective Plane
Define physical world dimensions $W$ (width) and $D$ (depth), inclined by longitudinal slope $\alpha$ and lateral tilt $\beta$:

$$x_0 = (u - 0.5) \cdot W$$

$$z_0 = v \cdot D$$

$$y_{\text{plane}} = \alpha x_0 + \beta z_0$$

### 3.2 Multi-Harmonic Elevation & Terrain Relief
Elevation $y_0$ is computed by superimposing $K$ directional sine harmonics (forming the primary wave crests) with 2D Fractional Brownian Motion ($\text{fBm}$) to introduce organic geological irregularity:

$$y_0(u, v, t) = y_{\text{plane}} + \sum_{k=1}^{K} A_k \sin\left(\omega_k u + \phi_k z_0 - \nu_k t + \psi_k\right) + H_{\text{terrain}} \cdot \text{fBm}_{2\text{D}}\left(u \cdot s_u, \, v \cdot s_v; \, S\right)$$

Where:
* $A_k, \omega_k, \phi_k$: Amplitude, longitudinal frequency, and depth phase-shift of harmonic $k$.
* $\nu_k$: Temporal phase velocity for deterministic animation.
* $H_{\text{terrain}}$: Scalar weight controlling landscape roughness.

---

## 4. Micro-Geometry: Divergence-Free Curl Turbulence

To transform the rigid wave surface into fluid-like airwaves and sweeping hair-thin filaments without unnatural particle compression, points are displaced using a **3D Curl Noise** field.

### 4.1 Curl Vector Field Formulation
Let $\mathbf{\Psi}(\mathbf{p}) = (\Psi_x(\mathbf{p}), \Psi_y(\mathbf{p}), \Psi_z(\mathbf{p}))$ be a 3D vector potential constructed from three decorrelated 3D Simplex/Perlin noise octaves seeded by $S$. The divergence-free velocity/displacement field $\mathbf{F}_{\text{curl}}$ is given by:

$$\mathbf{F}_{\text{curl}}(\mathbf{p}) = \nabla \times \mathbf{\Psi}(\mathbf{p}) = \begin{pmatrix} \frac{\partial \Psi_z}{\partial y} - \frac{\partial \Psi_y}{\partial z} \\ \frac{\partial \Psi_x}{\partial z} - \frac{\partial \Psi_z}{\partial x} \\ \frac{\partial \Psi_y}{\partial x} - \frac{\partial \Psi_x}{\partial y} \end{pmatrix}$$

Partial derivatives are evaluated analytically or via central finite differences with step $\epsilon \approx 10^{-4}$.

### 4.2 Envelope-Modulated Displacement
The final 3D world position $\mathbf{P}(u, v, t)$ applies the curl vector modulated by a dispersion envelope $E(u, v)$ so the primary ridge remains crisp while outer edges dissolve into wide laminar arcs:

$$E(u, v) = \gamma_0 + \gamma_1 |v|^{1.5} + \gamma_2 \sin^2(\pi u)$$

$$\mathbf{P}(u, v, t) = \mathbf{P}_0(u, v, t) + E(u, v) \cdot \mathbf{F}_{\text{curl}}\left(\frac{\mathbf{P}_0(u, v, t)}{L_{\text{curl}}} + \mathbf{v}_{\text{drift}} t\right)$$

---

## 5. Continuous Filament Geometry (Streamlines)

In addition to discrete particles, the generator synthesizes $M$ continuous vector curves (streamlines) that trace the exact flow topology of the surface.

1. Select $M$ fixed lateral coordinates $\{v_1, v_2, \dots, v_M\}$ sampled across $[-0.85, 0.85]$ (e.g., via Chebyshev nodes or stratified Halton offsets).
2. For each filament $m \in \{1, \dots, M\}$, evaluate $\mathbf{P}(u_j, v_m, t)$ across $J$ uniform subdivisions $u_j = \frac{j}{J - 1}$ for $j \in \{0, \dots, J-1\}$.
3. Render each sequence $\{\mathbf{P}(u_j, v_m, t)\}_{j=0}^{J-1}$ as a smooth spline or anti-aliased polyline with per-vertex opacity attenuated near the endpoints ($u \to 0$ and $u \to 1$) and defocused depth zones.

---

## 6. Optical Projection & Rendering Pipeline

### 6.1 Camera Transform & Circle of Confusion (CoC)
Transform world coordinate $\mathbf{P}$ by the view matrix $\mathbf{V}$ into camera space $\mathbf{P}_c = (x_c, y_c, z_c)$, followed by perspective projection onto screen coordinates $(X_s, Y_s)$ with focal length $f$:

$$X_s = \frac{f \cdot x_c}{z_c}, \quad Y_s = \frac{f \cdot y_c}{z_c}$$

Define a focal plane depth $z_{\text{focus}}$ intersecting the central ridge of the wave. The optical blur radius $r_{\text{bokeh}}$ (in pixels) is proportional to the signed depth distance from the focal plane:

$$r_{\text{bokeh}} = r_{\text{min}} + k_{\text{aperture}} \cdot |z_c - z_{\text{focus}}|$$

### 6.2 Energy-Conserving Luminance Attenuation
Because a defocused point-spread function distributes constant luminous flux over a disc of area $A \propto r_{\text{bokeh}}^2$, particle opacity $\alpha$ must decay inversely with radius to prevent foreground/background over-saturation:

$$\alpha = \alpha_{\text{base}} \cdot \left(\frac{r_{\text{min}}}{r_{\text{bokeh}}}\right)^{\eta} \cdot W_{\text{edge}}(u, v)$$

Where:
* $\eta \in [1.5, 2.0]$ controls bokeh disc translucency.
* $W_{\text{edge}}(u, v) = \sin^\kappa(\pi u) \cdot \exp(-\lambda v^2)$ smoothly vignettes the boundaries of the wave field.

### 6.3 Spectral Color Mapping & Core Incandescence
Each particle's base RGB color $\mathbf{C}_{\text{base}}$ is sampled from a 1D perceptual gradient $G(s)$ parameterized along the wave:

$$s = \text{clamp}\left(u + \delta_v v + \delta_y y_0, \, 0, \, 1\right)$$

* **Example Preset A (Warm-to-Cool Atmospheric):** Champagne Gold (`#F5C284`) $\rightarrow$ Soft Pearl (`#E6D5C3`) $\rightarrow$ Ice Blue (`#7FA8D6`).
* **Example Preset B (High-Contrast Neon):** Crimson-Coral (`#FD3D30`) $\rightarrow$ Deep Violet (`#6D1C57`) $\rightarrow$ Electric Azure (`#007EFF`).

To simulate intense light accumulation along dense, in-focus ridges, compute a local incandescence factor $I_{\text{core}} \in [0, 1]$ and blend toward white (`#FFFFFF`):

$$I_{\text{core}} = \exp\left(-\sigma_v v^2\right) \cdot \left(\frac{r_{\text{min}}}{r_{\text{bokeh}}}\right)$$

$$\mathbf{C}_{\text{final}} = \text{lerp}\left(\mathbf{C}_{\text{base}}, \, (1, 1, 1), \, \mu_{\text{core}} \cdot I_{\text{core}}\right)$$

### 6.4 Compositing & Post-Processing
1. **Background Pass:** Render a radial vignette gradient from deep obsidian-navy (`#040811`) at the edges to midnight blue (`#0B1528`) behind the wave center.
2. **Bokeh Sprite Kernel:** Render each particle as a screen-aligned quad using a radial falloff texture (a soft Gaussian core for sharp particles, transitioning to a flat disc with a subtle bright rim for large $r_{\text{bokeh}}$).
3. **Blending Mode:** Composite all particles and filaments using **Additive Blending** (`glBlendFunc(GL_SRC_ALPHA, GL_ONE)`) into an HDR floating-point framebuffer (`RGBA16F`).
4. **Tone Mapping & Bloom:** Apply a subtle multi-pass Gaussian bloom on highlights exceeding luminance $1.0$, followed by ACES Filmic tone mapping to compress HDR highlights smoothly into sRGB output.

---

## 7. Configurable Parameter Schema ($\Theta$)

| Parameter | Symbol | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `seed` | $S$ | `uint64` | `42026` | Master deterministic seed for hashes and noise fields. |
| `particleCount` | $N$ | `int` | `120000` | Total number of discrete particles evaluated. |
| `filamentCount` | $M$ | `int` | `18` | Number of continuous vector streamlines. |
| `ridgeRatio` | $\rho_{\text{ridge}}$ | `float` | `0.70` | Fraction of particles clustered onto ridge contours. |
| `ridgeSharpness` | $p$ | `float` | `3.2` | Power exponent controlling cross-sectional ridge tightness. |
| `worldDimensions` | $(W, D)$ | `vec2` | `(18.0, 7.0)` | Spatial width and depth of the base wave manifold. |
| `planeSlope` | $(\alpha, \beta)$ | `vec2` | `(0.28, 0.14)` | Diagonal inclination and camera tilt of the landscape. |
| `curlScale` | $L_{\text{curl}}$ | `float` | `2.8` | Spatial wavelength of the 3D curl noise eddies. |
| `curlStrength` | $(\gamma_0, \gamma_1)$ | `vec2` | `(0.25, 1.15)` | Core vs. outer dispersion amplitude of curl turbulence. |
| `focalDepth` | $z_{\text{focus}}$ | `float` | `12.5` | Camera-space depth of sharp focus plane. |
| `apertureScale` | $k_{\text{aperture}}$ | `float` | `3.8` | Rate at which Circle of Confusion grows with depth offset. |
| `bokehDecay` | $\eta$ | `float` | `1.65` | Opacity falloff exponent for out-of-focus bokeh discs. |
| `coreIncandescence`| $\mu_{\text{core}}$ | `float` | `0.75` | Intensity of white-hot color shift along sharp ridges. |

---

## 8. Execution & Determinism Guarantees

To guarantee identical output across CPU (Python/C++/Kotlin) and GPU (WebGL/Metal/Vulkan) implementations:
1. **Stateless Noise:** Implement 3D Simplex or Gradient noise using integer bit-mixing (e.g., PCG or MurmurHash3 finalizers) rather than lookup permutation tables that vary across implementations.
2. **Closed-Form Evaluation:** Every particle $i$ must be computed independently in $O(1)$ time with zero data dependencies on particle $i-1$ or frame $t-\Delta t$.
3. **Order-Independent Blending:** Because additive blending (`SRC_ALPHA, ONE`) is commutative, parallel GPU vertex/compute threads can emit particles in arbitrary execution order while producing mathematically identical pixel sums (up to floating-point associativity).