import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SimulationData } from '../simulation/particleSim';
import type { VisualParams } from '../types/config';
import {
  BG_FRAGMENT_SHADER,
  BG_VERTEX_SHADER,
  LINE_FRAGMENT_SHADER,
  LINE_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
} from './shaders';

function hexToVec3(hex: string): THREE.Vector3 {
  const col = new THREE.Color(hex);
  return new THREE.Vector3(col.r, col.g, col.b);
}

/**
 * WebGL / Three.js GPU renderer for particles, advection trails, guiding curves,
 * and multi-pass HDR bloom post-processing.
 * Accepts SimulationData separately from VisualParams so visual edits never
 * recompute the simulation.
 */
export class SplashRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  private readonly bgMesh: THREE.Mesh;
  private readonly bgUniforms: Record<string, THREE.IUniform>;

  private readonly curveUniforms: Record<string, THREE.IUniform>;
  private readonly trailUniforms: Record<string, THREE.IUniform>;
  private readonly particleUniforms: Record<string, THREE.IUniform>;

  private curveLines: THREE.LineSegments | null = null;
  private trailLines: THREE.LineSegments | null = null;
  private particleMesh: THREE.Mesh | null = null;

  private width = 1280;
  private height = 720;
  private pixelRatio = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

    // Background quad
    this.bgUniforms = {
      uBgColor: { value: new THREE.Vector3(0.02, 0.03, 0.07) },
      uColor0: { value: new THREE.Vector3(1.0, 0.6, 0.35) },
      uColor3: { value: new THREE.Vector3(0.15, 0.45, 1.0) },
      uAmbientGlow: { value: 0.6 },
      uAspect: { value: 16 / 9 },
    };
    const bgGeo = new THREE.PlaneGeometry(2, 2);
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERTEX_SHADER,
      fragmentShader: BG_FRAGMENT_SHADER,
      uniforms: this.bgUniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.bgMesh.frustumCulled = false;
    this.bgMesh.renderOrder = 0;
    this.scene.add(this.bgMesh);

    const sharedPaletteUniforms = () => ({
      uColor0: { value: new THREE.Vector3(1.0, 0.6, 0.35) },
      uColor1: { value: new THREE.Vector3(1.0, 0.85, 0.65) },
      uColor2: { value: new THREE.Vector3(0.55, 0.72, 1.0) },
      uColor3: { value: new THREE.Vector3(0.12, 0.42, 1.0) },
    });

    this.curveUniforms = {
      ...sharedPaletteUniforms(),
      uAspect: { value: 16 / 9 },
      uTime: { value: 0 },
      uAnimate: { value: 1 },
      uOpacity: { value: 0.44 },
      uBrightness: { value: 1.1 },
    };

    this.trailUniforms = {
      ...sharedPaletteUniforms(),
      uAspect: { value: 16 / 9 },
      uTime: { value: 0 },
      uAnimate: { value: 1 },
      uOpacity: { value: 0.6 },
      uBrightness: { value: 1.0 },
    };

    this.particleUniforms = {
      ...sharedPaletteUniforms(),
      uAspect: { value: 16 / 9 },
      uResolution: { value: new THREE.Vector2(1280, 720) },
      uTime: { value: 0 },
      uAnimate: { value: 1 },
      uDofStrength: { value: 1.0 },
      uFocalPlane: { value: 0.05 },
      uParticleSize: { value: 1.0 },
      uBrightness: { value: 1.0 },
      uTransparency: { value: 0.85 },
      uDensityNorm: { value: 0.85 },
    };

    const renderTarget = new THREE.WebGLRenderTarget(1280, 720, {
      type: THREE.HalfFloatType,
      samples: 0,
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.48, 0.45, 0.62);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  /**
   * Upload newly computed SimulationData buffers to the GPU.
   */
  setSimulationData(sim: SimulationData): void {
    // 1. Guiding airwave curves
    if (this.curveLines) {
      this.scene.remove(this.curveLines);
      this.curveLines.geometry.dispose();
      (this.curveLines.material as THREE.Material).dispose();
    }
    if (sim.curveVertexCount > 0) {
      const curveGeo = new THREE.BufferGeometry();
      // Dummy 3D position attribute required by Three.js bounding/draw count
      const dummyPos = new Float32Array(sim.curveVertexCount * 3);
      curveGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
      curveGeo.setAttribute('aPosition', new THREE.BufferAttribute(sim.curvePositions, 2));
      curveGeo.setAttribute('aLineAttr', new THREE.BufferAttribute(sim.curveAttributes, 2));

      const curveMat = new THREE.ShaderMaterial({
        vertexShader: LINE_VERTEX_SHADER,
        fragmentShader: LINE_FRAGMENT_SHADER,
        uniforms: this.curveUniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      });
      this.curveLines = new THREE.LineSegments(curveGeo, curveMat);
      this.curveLines.frustumCulled = false;
      this.curveLines.renderOrder = 1;
      this.scene.add(this.curveLines);
    }

    // 2. Particle trails
    if (this.trailLines) {
      this.scene.remove(this.trailLines);
      this.trailLines.geometry.dispose();
      (this.trailLines.material as THREE.Material).dispose();
      this.trailLines = null;
    }
    if (sim.trailVertexCount > 0) {
      const trailGeo = new THREE.BufferGeometry();
      const dummyPos = new Float32Array(sim.trailVertexCount * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
      trailGeo.setAttribute('aPosition', new THREE.BufferAttribute(sim.trailPositions, 2));
      trailGeo.setAttribute('aLineAttr', new THREE.BufferAttribute(sim.trailAttributes, 2));

      const trailMat = new THREE.ShaderMaterial({
        vertexShader: LINE_VERTEX_SHADER,
        fragmentShader: LINE_FRAGMENT_SHADER,
        uniforms: this.trailUniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      });
      this.trailLines = new THREE.LineSegments(trailGeo, trailMat);
      this.trailLines.frustumCulled = false;
      this.trailLines.renderOrder = 2;
      this.scene.add(this.trailLines);
    }

    // 3. Instanced quad particles
    if (this.particleMesh) {
      this.scene.remove(this.particleMesh);
      this.particleMesh.geometry.dispose();
      (this.particleMesh.material as THREE.Material).dispose();
    }

    const baseQuad = new THREE.PlaneGeometry(2, 2);
    const instGeo = new THREE.InstancedBufferGeometry();
    instGeo.index = baseQuad.index;
    instGeo.attributes.position = baseQuad.attributes.position;
    instGeo.instanceCount = sim.particleCount;

    instGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(sim.positions, 3));
    instGeo.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(sim.velocities, 2));
    instGeo.setAttribute('aAttr', new THREE.InstancedBufferAttribute(sim.attributes, 4));

    const particleMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      uniforms: this.particleUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.particleMesh = new THREE.Mesh(instGeo, particleMat);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.renderOrder = 3;
    this.scene.add(this.particleMesh);

    // Keep visual exposure balanced across particle counts (5k–100k)
    const densityNorm = Math.max(
      0.55,
      Math.min(1.45, Math.sqrt(28000 / Math.max(5000, sim.particleCount))),
    );
    this.particleUniforms.uDensityNorm.value = densityNorm;
  }

  /**
   * Instantaneously update visual appearance uniforms without recomputing simulation.
   */
  updateVisualParams(visual: VisualParams): void {
    const c0 = hexToVec3(visual.paletteStops[0]);
    const c1 = hexToVec3(visual.paletteStops[1]);
    const c2 = hexToVec3(visual.paletteStops[2]);
    const c3 = hexToVec3(visual.paletteStops[3]);
    const bg = hexToVec3(visual.backgroundColor);

    this.bgUniforms.uBgColor.value.copy(bg);
    this.bgUniforms.uColor0.value.copy(c0);
    this.bgUniforms.uColor3.value.copy(c3);
    this.bgUniforms.uAmbientGlow.value = visual.ambientGlow;

    const applyPalette = (u: Record<string, THREE.IUniform>) => {
      u.uColor0.value.copy(c0);
      u.uColor1.value.copy(c1);
      u.uColor2.value.copy(c2);
      u.uColor3.value.copy(c3);
    };

    applyPalette(this.curveUniforms);
    this.curveUniforms.uOpacity.value = visual.guidingCurveOpacity;
    this.curveUniforms.uBrightness.value = visual.particleBrightness;
    this.curveUniforms.uAnimate.value = visual.animateFlow ? 1 : 0;

    applyPalette(this.trailUniforms);
    this.trailUniforms.uOpacity.value = visual.trailFade * 0.65;
    this.trailUniforms.uBrightness.value = visual.particleBrightness;
    this.trailUniforms.uAnimate.value = visual.animateFlow ? 1 : 0;

    applyPalette(this.particleUniforms);
    this.particleUniforms.uDofStrength.value = visual.dofStrength;
    this.particleUniforms.uFocalPlane.value = visual.focalPlane;
    this.particleUniforms.uParticleSize.value = visual.particleSize;
    this.particleUniforms.uBrightness.value = visual.particleBrightness;
    this.particleUniforms.uTransparency.value = visual.transparency;
    this.particleUniforms.uAnimate.value = visual.animateFlow ? 1 : 0;

    this.bloomPass.strength = visual.glowIntensity;
    this.bloomPass.threshold = visual.bloomThreshold;
    this.bloomPass.radius = 0.45;
  }

  resize(width: number, height: number, pixelRatio = Math.min(window.devicePixelRatio || 1, 2)): void {
    const safeW = Math.max(64, Math.round(width));
    const safeH = Math.max(64, Math.round(height));
    this.width = safeW;
    this.height = safeH;
    this.pixelRatio = pixelRatio;

    const aspect = safeW / safeH;
    this.bgUniforms.uAspect.value = aspect;
    this.curveUniforms.uAspect.value = aspect;
    this.trailUniforms.uAspect.value = aspect;
    this.particleUniforms.uAspect.value = aspect;
    this.particleUniforms.uResolution.value.set(safeW * pixelRatio, safeH * pixelRatio);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(safeW, safeH, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(safeW, safeH);
    this.bloomPass.resolution.set(safeW * pixelRatio, safeH * pixelRatio);
  }

  render(timeSec: number): void {
    this.curveUniforms.uTime.value = timeSec;
    this.trailUniforms.uTime.value = timeSec;
    this.particleUniforms.uTime.value = timeSec;
    this.composer.render();
  }

  /**
   * Render a crisp frame at arbitrary target export pixel dimensions and return
   * an HTMLCanvasElement copy, then immediately restore the interactive preview viewport.
   */
  renderHighResFrame(exportW: number, exportH: number, timeSec: number): HTMLCanvasElement {
    const prevW = this.width;
    const prevH = this.height;
    const prevDpr = this.pixelRatio;

    this.resize(exportW, exportH, 1);
    this.render(timeSec);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = exportW;
    outCanvas.height = exportH;
    const ctx = outCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(this.canvas, 0, 0, exportW, exportH);
    }

    this.resize(prevW, prevH, prevDpr);
    this.render(timeSec);

    return outCanvas;
  }

  dispose(): void {
    if (this.curveLines) {
      this.curveLines.geometry.dispose();
      (this.curveLines.material as THREE.Material).dispose();
    }
    if (this.trailLines) {
      this.trailLines.geometry.dispose();
      (this.trailLines.material as THREE.Material).dispose();
    }
    if (this.particleMesh) {
      this.particleMesh.geometry.dispose();
      (this.particleMesh.material as THREE.Material).dispose();
    }
    this.bgMesh.geometry.dispose();
    (this.bgMesh.material as THREE.Material).dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
