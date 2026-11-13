# WebGL Shaders, Optics & Vector Compositing

## 1. Instanced Quad Particles vs. `gl_PointSize`

WebGL implementations on macOS (Metal/ANGLE) and several desktop GPUs clamp `gl_PointSize` to `64px` or `128px`, which breaks large out-of-focus bokeh discs—especially when exporting high-resolution `3840 × 2160` PNGs.

To eliminate hardware point-size caps, `SplashRenderer` uses `THREE.InstancedBufferGeometry` with a `2 × 2` unit quad instanced `particleCount` times ([src/rendering/SplashRenderer.ts](file:///Users/anton/IdeaProjects/splashes/src/rendering/SplashRenderer.ts)):

- Per-instance attributes: `aOffset (x, y, z)`, `aVelocity (vx, vy)`, and `aAttr (tColor, sizeSeed, energy, bokehFactor)`.
- In `PARTICLE_VERTEX_SHADER` ([src/rendering/shaders.ts](file:///Users/anton/IdeaProjects/splashes/src/rendering/shaders.ts)), particle radii scale proportionally to `uResolution.y / 1080.0` with a `>= 0.76px` sub-pixel floor, preserving crisp pinpoint dust across both preview sizes and 4K exports.
- Sharp in-focus sparks stretch subtly along their velocity vector (`dir = normalize(aVelocity)`), while out-of-focus bokeh particles and peak caustic glint stars relax toward symmetrical shapes.

## 2. Optical Depth of Field (Circle of Confusion) & Star Glints

Every particle carries a depth coordinate $z \in [-1, 1]$ (core caustic particles cluster near $z \approx 0$, while peripheral bokeh orbs span foreground/background depths). In the vertex and fragment shaders:

1. **Circle of Confusion**: $\text{coc} = |z - \text{uFocalPlane}| \cdot \text{uDofStrength}$.
2. **Aperture Expansion**: Quad radius expands by $(1 + 2.8 \cdot \text{coc})$.
3. **Profile Morphing & Star Glints**: `blurBlend = clamp(coc * 0.92, 0.0, 1.0)` blends between a razor-crisp dual-Gaussian pinpoint spark (`exp(-r2 * 14.5) * 0.85 + exp(-r2 * 4.5) * 0.14`) and a soft optical bokeh disc (`smoothstep`). Peak-energy particles (`vEnergy > 1.42` in focus) add 4-point diffraction star rays (`starRays`).
4. **Energy Conservation**: Intensity is attenuated by `1.0 / (1.0 + coc * coc * 2.25)` so expanded colored bokeh discs remain luminous and translucent without hazing the background sky.
5. **Density Normalization**: `SplashRenderer` computes `uDensityNorm = clamp(sqrt(28000 / particleCount), 0.55, 1.45)` so changing particle count from `5k` to `100k` preserves balanced contrast.

## 3. Multi-Pass HDR Bloom & Tone Mapping

- The Three.js `EffectComposer` renders into a `THREE.HalfFloatType` `WebGLRenderTarget` so additive particle overlaps accumulate smoothly above `1.0` without 8-bit clipping.
- `UnrealBloomPass` extracts highlights above `bloomThreshold` and composites a soft glow scaled by `glowIntensity`.
- `THREE.ACESFilmicToneMapping` (`toneMappingExposure = 0.95`) compresses bright caustic ridges gracefully into warm white-gold or cyan-white cores while keeping surrounding colors saturated.
- `BG_FRAGMENT_SHADER` applies a subtle per-pixel screen-space dither (`(hash12(gl_FragCoord.xy) - 0.5) / 255.0`) to eliminate gradient banding on dark midnight backgrounds.

## 4. Official JetBrains Vector Overlay (`src/rendering/overlayRenderer.ts`)

Typography (`Plus Jakarta Sans`, `Inter`, or `JetBrains Mono`) and the JetBrains logo are drawn on a 2D `<canvas>` using synchronous `Path2D` objects constructed directly from the official SVG path strings in [jetbrains-mono-white.svg](file:///Users/anton/IdeaProjects/splashes/jetbrains/jetbrains/jetbrains-mono-white.svg) and [jetbrains.svg](file:///Users/anton/IdeaProjects/splashes/jetbrains/jetbrains/jetbrains.svg):

- **Official Monochrome (`logoStyle: 'mono'`)**: Draws the beveled cube frame using the `evenodd` fill rule so the center stays transparent over particles, plus the signature underscore bar and `JETBRAINS` wordmark tinted to `textColor`.
- **Official Brand Gradient (`logoStyle: 'color'`)**: Fills the outer cube with the 3-stop linear gradient (`#FF9419` → `#FF021D` → `#E600FF`), `#000000` inner square, `#FFFFFF` underscore, and `textColor` wordmark.
