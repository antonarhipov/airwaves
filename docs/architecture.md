# System Architecture

Airwaves Studio is designed around a strict separation between **deterministic mathematical simulation**, **real-time GPU shading/post-processing**, and **resolution-independent vector typography compositing**.

## High-Level Data Flow

```text
SimParams (seed, particleCount, fieldMode, noise, attractors, safeZone, ...)
   │
   ▼  (recomputed ONLY when SimParams change)
runSimulation(SimParams)
   │  ├── PRNG (FNV-1a + Mulberry32)
   │  ├── Noise2D (Seeded Simplex / Perlin + FBM + Curl)
   │  ├── FlowField (3D twisted acoustic sheet, 200×120 vector grid, Gaussian vortices)
   │  └── Sampling & RK2 Integration (multi-step advection + 220-step streamlines)
   ▼
SimulationData (Float32Array GPU buffers)
   │  ├── positions (x, y, z)
   │  ├── velocities (vx, vy)
   │  ├── attributes (tColor, sizeSeed, energy, bokehFactor)
   │  ├── trailPositions / trailAttributes
   │  └── curvePositions / curveAttributes
   │
   ├──────────────────────────────────────────┐
   ▼                                          ▼
SplashRenderer (Three.js + GLSL)        VisualParams (instant GPU uniforms)
   │  ├── Background Glow Shader           ◄── paletteStops, backgroundColor,
   │  ├── Guiding Curve Line Shader        ◄── glowIntensity, bloomThreshold,
   │  ├── Advection Trail Shader           ◄── dofStrength, focalPlane,
   │  ├── Instanced Quad Particle Shader   ◄── particleSize, brightness,
   │  └── HalfFloat FBO + UnrealBloomPass  ◄── transparency, animateFlow
   │
   ▼
Live WebGL Canvas  +  Synchronized 2D Overlay Canvas (drawTypographyAndLogo)
   │
   ▼  (on Export PNG)
Offscreen Render at targetW × targetH (up to 3840 × 2160) → PNG Download
```

## Key Design Decisions

### 1. Simulation / Rendering Separation

In [src/App.tsx](file:///Users/anton/IdeaProjects/splashes/src/App.tsx), `simData` is memoized strictly on `config.sim`:

```ts
const simData = useMemo(() => runSimulation(config.sim), [config.sim]);
```

- **Simulation edits** (seed, particle count, guiding curves, turbulence, attractors, composition, safe zone) rerun `runSimulation()` and upload fresh typed-array buffers to the GPU via `SplashRenderer.setSimulationData()`.
- **Visual edits** (color palette, custom gradient stops, background color, ambient glow, bloom intensity/threshold, Depth of Field focal plane/aperture, brightness, transparency, curve/trail opacity, live motion) call `SplashRenderer.updateVisualParams()`, updating only GLSL uniforms and `UnrealBloomPass` properties in sub-millisecond time without touching particle geometry.

### 2. Dual-Layer Preview & 1:1 High-Resolution PNG Export

Because typography (`IntelliJ IDEA`, `2026.3`) and the official JetBrains logo must remain razor-sharp at every export resolution without being distorted by WebGL bloom:

1. During live preview, [src/components/SplashViewport.tsx](file:///Users/anton/IdeaProjects/splashes/src/components/SplashViewport.tsx) stacks two aligned `<canvas>` elements inside `.canvas-frame`:
   - Bottom layer: WebGL Three.js `<canvas>` managed by `SplashRenderer`.
   - Top layer: High-DPI 2D `<canvas>` drawn synchronously by `drawTypographyAndLogo()` in [src/rendering/overlayRenderer.ts](file:///Users/anton/IdeaProjects/splashes/src/rendering/overlayRenderer.ts).
2. During **Export PNG**, `SplashRenderer.renderHighResFrame(targetW, targetH, timeSec)` temporarily resizes the WebGL renderer, `EffectComposer`, and `UnrealBloomPass` (`pixelRatio = 1`) to exact target pixels (e.g., `3840 × 2160`), renders one frame, copies it onto an offscreen 2D `<canvas>`, executes the exact same `drawTypographyAndLogo()` function at `(targetW, targetH)`, exports a PNG blob, and immediately restores the interactive preview viewport.

### 3. Module Map

| Module | Responsibility |
| :--- | :--- |
| [src/types/config.ts](file:///Users/anton/IdeaProjects/splashes/src/types/config.ts) | Strongly typed `SimParams`, `VisualParams`, `TypographyParams`, `CanvasParams` |
| [src/types/presets.ts](file:///Users/anton/IdeaProjects/splashes/src/types/presets.ts) | Curated presets, color palettes, aspect ratios, export width options |
| [src/math/prng.ts](file:///Users/anton/IdeaProjects/splashes/src/math/prng.ts) | FNV-1a seed hash, Mulberry32 PRNG, Gaussian sampler, sub-stream forking |
| [src/math/noise.ts](file:///Users/anton/IdeaProjects/splashes/src/math/noise.ts) | Seeded 2D Simplex & Perlin noise, FBM, finite-difference 2D curl |
| [src/simulation/flowField.ts](file:///Users/anton/IdeaProjects/splashes/src/simulation/flowField.ts) | Twisted acoustic ribbon evaluation, 200×120 cached Eulerian vector grid, streamlines, vortices, attractors, safe-zone mask |
| [src/simulation/particleSim.ts](file:///Users/anton/IdeaProjects/splashes/src/simulation/particleSim.ts) | Caustic strand/sheet sampling, multi-step RK2 trajectory advection, streamline & trail buffers |
| [src/rendering/shaders.ts](file:///Users/anton/IdeaProjects/splashes/src/rendering/shaders.ts) | GLSL shaders for atmospheric backdrop, filaments/trails, bokeh particles, and star-glint hotspots |
| [src/rendering/SplashRenderer.ts](file:///Users/anton/IdeaProjects/splashes/src/rendering/SplashRenderer.ts) | Three.js scene, instanced geometry management, HDR bloom composer, export |
| [src/rendering/overlayRenderer.ts](file:///Users/anton/IdeaProjects/splashes/src/rendering/overlayRenderer.ts) | Vector typography and official JetBrains `Path2D` logo rendering |
| [src/components/SplashViewport.tsx](file:///Users/anton/IdeaProjects/splashes/src/components/SplashViewport.tsx) | Responsive aspect-preserving canvas stage and interactive field node handles |
| [src/components/Sidebar.tsx](file:///Users/anton/IdeaProjects/splashes/src/components/Sidebar.tsx) | Collapsible 5-tab control panel (`Presets`, `Particles`, `Math`, `Visuals`, `Text`) |
