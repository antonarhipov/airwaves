export const BG_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const BG_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform vec3 uBgColor;
  uniform vec3 uColor0;
  uniform vec3 uColor3;
  uniform float uAmbientGlow;
  uniform float uAspect;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= uAspect;

    // Subtle atmospheric entry/exit glows matching airwave colors
    float leftGlow = exp(-length(p - vec2(-0.92 * uAspect, -0.14)) * 1.55);
    float rightGlow = exp(-length(p - vec2(0.84 * uAspect, 0.34)) * 1.45);
    float centerHaze = exp(-length(p * vec2(0.55, 1.25)) * 2.1);

    vec3 col = uBgColor;
    col += uColor0 * leftGlow * 0.22 * uAmbientGlow;
    col += uColor3 * rightGlow * 0.12 * uAmbientGlow;
    col += mix(uColor0, uColor3, 0.5) * centerHaze * 0.03 * uAmbientGlow;

    // Subtle vignette
    float vig = 1.0 - smoothstep(0.65, 1.55, length(vUv - 0.5) * 1.65);
    col *= mix(0.65, 1.0, vig);

    // Subtle film dither to prevent 8-bit gradient banding
    float dither = (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    col += dither;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

export const LINE_VERTEX_SHADER = /* glsl */ `
  attribute vec2 aPosition;
  attribute vec2 aLineAttr; // x: tColor, y: alpha

  uniform float uAspect;
  uniform float uTime;
  uniform float uAnimate;

  varying float vT;
  varying float vAlpha;

  void main() {
    vT = aLineAttr.x;
    vAlpha = aLineAttr.y;

    vec2 pos = aPosition;
    if (uAnimate > 0.5) {
      float phase = uTime * 0.55;
      pos.y += sin(pos.x * 2.4 + phase) * 0.012 * sin(vT * 3.14159);
      pos.x += cos(pos.y * 2.1 - phase * 0.8) * 0.006 * sin(vT * 3.14159);
    }

    gl_Position = vec4(pos.x / max(0.3, uAspect) * 1.25, pos.y * 1.15, 0.0, 1.0);
  }
`;

export const LINE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uOpacity;
  uniform float uBrightness;
  uniform float uTime;
  uniform float uAnimate;

  varying float vT;
  varying float vAlpha;

  vec3 samplePalette(float t) {
    float x = clamp(t, 0.0, 1.0) * 3.0;
    if (x < 1.0) return mix(uColor0, uColor1, x);
    if (x < 2.0) return mix(uColor1, uColor2, x - 1.0);
    return mix(uColor2, uColor3, x - 2.0);
  }

  void main() {
    vec3 baseCol = samplePalette(vT);
    vec3 col = mix(baseCol, vec3(1.0, 0.98, 0.96), 0.18 * clamp(vAlpha, 0.0, 1.0));
    float pulse = 1.0;
    if (uAnimate > 0.5) {
      pulse = 0.85 + 0.22 * sin(vT * 10.0 - uTime * 1.8);
    }
    float alpha = vAlpha * uOpacity * 0.54 * pulse;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col * uBrightness * 0.95 * alpha, alpha);
  }
`;

export const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aOffset;   // particle (x, y, z)
  attribute vec2 aVelocity; // unit direction (vx, vy)
  attribute vec4 aAttr;     // (tColor, sizeSeed, energy, bokehFactor)

  uniform float uAspect;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uAnimate;
  uniform float uDofStrength;
  uniform float uFocalPlane;
  uniform float uParticleSize;

  varying vec2 vQuadUv;
  varying float vT;
  varying float vEnergy;
  varying float vCoc;
  varying float vBokeh;

  // Compact 2D Simplex-like organic drift in GLSL
  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float gradNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vQuadUv = position.xy;
    vT = aAttr.x;
    vEnergy = aAttr.z;
    vBokeh = aAttr.w;

    vec2 center = aOffset.xy;
    float z = aOffset.z;

    if (uAnimate > 0.5) {
      float t = uTime * 0.45;
      float n1 = gradNoise(center * 2.1 + vec2(t * 0.35, -t * 0.25));
      float n2 = gradNoise(center * 2.1 + vec2(-t * 0.25 + 5.2, t * 0.3));
      float driftAmp = 0.016 * (0.45 + abs(z) * 0.55);
      center += aVelocity * sin(t + vT * 6.283) * 0.010 + vec2(n1, n2) * driftAmp;
    }

    // Circle of Confusion for Depth of Field bokeh
    float coc = abs(z - uFocalPlane) * uDofStrength;
    vCoc = coc;

    // Base radius in logical reference pixels (keep floor >= 0.76px so fine grains remain crisp)
    float scaleRef = uResolution.y / 1080.0;
    float glintBoost = 1.0 + max(0.0, vEnergy - 1.42) * 3.8 * (1.0 - clamp(coc * 2.0, 0.0, 1.0));
    float basePx = aAttr.y * uParticleSize * 1.24 * scaleRef * glintBoost;
    float radiusPx = basePx * (1.0 + coc * 2.8);
    float minRadius = mix(max(0.76, 0.92 * scaleRef), 2.0 * scaleRef, clamp(coc, 0.0, 1.0));
    radiusPx = clamp(radiusPx, minRadius, 56.0 * scaleRef);

    // Subtle velocity stretch for sharp in-focus sparks, round for bokeh
    float isGlint = step(1.42, vEnergy);
    float stretch = mix(1.0 + max(0.0, 1.0 - coc * 1.5) * 0.45 * vEnergy, 1.0, isGlint);
    vec2 dir = normalize(aVelocity + vec2(0.0001));
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 localQuad = dir * (position.x * stretch) + perp * position.y;

    vec2 ndcCenter = vec2(center.x / max(0.3, uAspect) * 1.25, center.y * 1.15);
    vec2 ndcOffset = (localQuad * radiusPx * 2.0) / uResolution;

    gl_Position = vec4(ndcCenter + ndcOffset, 0.0, 1.0);
  }
`;

export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uBrightness;
  uniform float uTransparency;
  uniform float uDensityNorm;

  varying vec2 vQuadUv;
  varying float vT;
  varying float vEnergy;
  varying float vCoc;
  varying float vBokeh;

  vec3 samplePalette(float t) {
    float x = clamp(t, 0.0, 1.0) * 3.0;
    if (x < 1.0) return mix(uColor0, uColor1, x);
    if (x < 2.0) return mix(uColor1, uColor2, x - 1.0);
    return mix(uColor2, uColor3, x - 2.0);
  }

  void main() {
    float r2 = dot(vQuadUv, vQuadUv);
    if (r2 > 1.0) discard;
    float r = sqrt(r2);

    // Sharp spark profile vs optical DoF bokeh disc
    float sharpCore = exp(-r2 * 14.5) * 0.85 + exp(-r2 * 4.5) * 0.14;
    float glintMask = max(0.0, vEnergy - 1.42) * (1.0 - clamp(vCoc * 3.0, 0.0, 1.0));
    float starRays =
      exp(-abs(vQuadUv.x) * 18.0) * exp(-abs(vQuadUv.y) * 2.8) +
      exp(-abs(vQuadUv.y) * 18.0) * exp(-abs(vQuadUv.x) * 2.8);
    sharpCore += glintMask * starRays * 1.65;
    float bokehDisc = smoothstep(1.0, 0.58, r) * (0.24 + 0.14 * smoothstep(0.45, 0.88, r));

    float blurBlend = clamp(vCoc * 0.92, 0.0, 1.0);
    float profile = mix(sharpCore, bokehDisc, blurBlend);

    // Balanced DoF attenuation so sparse bokeh circles stay luminous & colorful without smoking out sky
    float areaDamp = 1.0 / (1.0 + vCoc * vCoc * 2.25);
    float intensity = profile * areaDamp * (0.28 + 1.18 * vEnergy) * uDensityNorm;

    vec3 baseCol = samplePalette(vT);
    // Crisp specular pinpoint highlight preserving rich palette saturation along spine
    float hotCenter = smoothstep(0.32, 0.0, r) * (1.0 - blurBlend) * vEnergy * 0.34;
    vec3 col = mix(baseCol, vec3(1.0, 0.98, 0.95), clamp(hotCenter, 0.0, 0.72));

    float alpha = clamp(intensity * uTransparency, 0.0, 1.0);
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(col * uBrightness * intensity, alpha);
  }
`;
