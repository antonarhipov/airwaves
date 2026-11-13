const GLSL3_LANDSCAPE_EVAL = /* glsl */ `
  uniform float uAspect;
  uniform float uTime;
  uniform float uAnimate;
  uniform int uSeed;
  uniform float uCurvature;
  uniform float uDispersion;
  uniform vec2 uWorldDim;       // (W, D)
  uniform vec2 uPlaneSlope;     // (alpha, beta)
  uniform float uTerrainRough;  // H_terrain
  uniform float uCurlScale;     // L_curl
  uniform vec3 uCurlStrength;   // (gamma_0, gamma_1, gamma_2)
  uniform float uFocalDepth;    // z_focus

  uint murmurMix32(uint x) {
    x ^= x >> 16u;
    x *= 0x85ebca6bu;
    x ^= x >> 13u;
    x *= 0xc2b2ae35u;
    x ^= x >> 16u;
    return x;
  }

  uint hashLattice2D(int ix, int iy, uint seed) {
    uint h = (uint(ix) * 0x9e3779b1u) ^ (uint(iy) * 0x85ebca77u) ^ seed;
    return murmurMix32(h);
  }

  uint hashLattice3D(int ix, int iy, int iz, uint seed) {
    uint h = (uint(ix) * 0x9e3779b1u) ^ (uint(iy) * 0x85ebca77u) ^ (uint(iz) * 0xc2b2ae3du) ^ seed;
    return murmurMix32(h);
  }

  float fade5(float t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  float grad2(int ix, int iy, float dx, float dy, uint seed) {
    uint h = hashLattice2D(ix, iy, seed) & 7u;
    if (h == 0u) return dx + dy;
    if (h == 1u) return -dx + dy;
    if (h == 2u) return dx - dy;
    if (h == 3u) return -dx - dy;
    if (h == 4u) return dx * 1.41421356;
    if (h == 5u) return -dx * 1.41421356;
    if (h == 6u) return dy * 1.41421356;
    return -dy * 1.41421356;
  }

  float noise2DStateless(float x, float y, uint seed) {
    int ix = int(floor(x));
    int iy = int(floor(y));
    float fx = x - float(ix);
    float fy = y - float(iy);
    float u = fade5(fx);
    float v = fade5(fy);

    float n00 = grad2(ix, iy, fx, fy, seed);
    float n10 = grad2(ix + 1, iy, fx - 1.0, fy, seed);
    float n01 = grad2(ix, iy + 1, fx, fy - 1.0, seed);
    float n11 = grad2(ix + 1, iy + 1, fx - 1.0, fy - 1.0, seed);

    return mix(mix(n00, n10, u), mix(n01, n11, u), v) * 0.72;
  }

  float fbm2DStateless(float x, float y, uint seed) {
    float sum = 0.0;
    float amp = 0.55;
    float freq = 1.0;
    float norm = 0.0;
    for (int o = 0; o < 3; o++) {
      uint s = seed + uint(o + 1) * 0x27d4eb2du;
      sum += noise2DStateless(x * freq, y * freq, s) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.07;
    }
    return sum / norm;
  }

  float grad3(int ix, int iy, int iz, float dx, float dy, float dz, uint seed) {
    uint h = hashLattice3D(ix, iy, iz, seed) & 15u;
    float u = h < 8u ? dx : dy;
    float v = h < 4u ? dy : (h == 12u || h == 14u ? dx : dz);
    return ((h & 1u) == 0u ? u : -u) + ((h & 2u) == 0u ? v : -v);
  }

  float noise3DStateless(vec3 p, uint seed) {
    ivec3 ip = ivec3(floor(p));
    vec3 f = p - vec3(ip);
    vec3 u = vec3(fade5(f.x), fade5(f.y), fade5(f.z));

    float n000 = grad3(ip.x, ip.y, ip.z, f.x, f.y, f.z, seed);
    float n100 = grad3(ip.x + 1, ip.y, ip.z, f.x - 1.0, f.y, f.z, seed);
    float n010 = grad3(ip.x, ip.y + 1, ip.z, f.x, f.y - 1.0, f.z, seed);
    float n110 = grad3(ip.x + 1, ip.y + 1, ip.z, f.x - 1.0, f.y - 1.0, f.z, seed);
    float n001 = grad3(ip.x, ip.y, ip.z + 1, f.x, f.y, f.z - 1.0, seed);
    float n101 = grad3(ip.x + 1, ip.y, ip.z + 1, f.x - 1.0, f.y, f.z - 1.0, seed);
    float n011 = grad3(ip.x, ip.y + 1, ip.z + 1, f.x, f.y - 1.0, f.z - 1.0, seed);
    float n111 = grad3(ip.x + 1, ip.y + 1, ip.z + 1, f.x - 1.0, f.y - 1.0, f.z - 1.0, seed);

    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z) * 0.68;
  }

  vec3 potentialPsi(vec3 p, uint seed) {
    uint s1 = seed ^ 0x9e3779b9u;
    uint s2 = seed ^ 0x85ebca6bu;
    uint s3 = seed ^ 0xc2b2ae35u;
    return vec3(
      noise3DStateless(p, s1) + 0.45 * noise3DStateless(p * 2.03 + vec3(7.1, -3.4, 0.0), s1),
      noise3DStateless(p + vec3(31.7, -17.3, 11.9), s2) +
        0.45 * noise3DStateless(p * 2.03 + vec3(19.2, 5.7, -9.1), s2),
      noise3DStateless(p + vec3(-13.4, 29.1, -23.8), s3) +
        0.45 * noise3DStateless(p * 2.03 + vec3(-6.3, 14.8, 4.2), s3)
    );
  }

  vec3 curl3DStateless(vec3 p, uint seed) {
    const float eps = 0.004;
    const float inv2Eps = 125.0; // 0.5 / 0.004

    vec3 px1 = potentialPsi(p + vec3(eps, 0.0, 0.0), seed);
    vec3 px0 = potentialPsi(p - vec3(eps, 0.0, 0.0), seed);
    vec3 py1 = potentialPsi(p + vec3(0.0, eps, 0.0), seed);
    vec3 py0 = potentialPsi(p - vec3(0.0, eps, 0.0), seed);
    vec3 pz1 = potentialPsi(p + vec3(0.0, 0.0, eps), seed);
    vec3 pz0 = potentialPsi(p - vec3(0.0, 0.0, eps), seed);

    return vec3(
      (py1.z - py0.z) - (pz1.y - pz0.y),
      (pz1.x - pz0.x) - (px1.z - px0.z),
      (px1.y - px0.y) - (py1.x - py0.x)
    ) * inv2Eps;
  }

  struct LandscapeCamPoint {
    vec2 ndc;
    float zCam;
    float tColor;
  };

  LandscapeCamPoint evaluateLandscapeCam(float u, float v, float tSec) {
    uint seed = uint(uSeed);
    float curv = max(0.2, uCurvature);
    float x0 = (u - 0.5) * uWorldDim.x;
    float z0 = v * uWorldDim.y;
    float yPlane = uPlaneSlope.x * x0 + uPlaneSlope.y * z0;

    float h1 = 1.28 * curv * sin(4.2 * curv * u + 0.42 * z0 - 0.85 * tSec + 0.35);
    float h2 = 0.54 * curv * sin(7.4 * curv * u - 0.55 * z0 - 1.35 * tSec + 1.85);
    float h3 = 0.16 * curv * sin(10.8 * curv * u + 0.72 * z0 - 1.85 * tSec + 0.92);

    float relief = uTerrainRough * 0.75 * fbm2DStateless(u * 2.8, v * 2.2, seed);
    float y0 = yPlane + h1 + h2 + h3 + relief;

    float invCurl = 1.0 / max(0.35, uCurlScale);
    vec3 p0 = vec3(x0, y0, z0);
    vec3 drift = vec3(0.18, -0.09, 0.12) * tSec;
    vec3 curlVec = curl3DStateless(p0 * invCurl + drift, seed);

    float dispBoost = 0.65 + uDispersion * 1.1;
    float sinPiU = sin(3.14159265 * u);
    float envelope =
      (uCurlStrength.x * 0.45 + uCurlStrength.y * pow(abs(v), 1.4) + uCurlStrength.z * sinPiU * sinPiU * 0.55) *
      dispBoost;

    vec3 pWorld = p0 + envelope * curlVec;

    const float cosP = 0.9838437; // cos(-0.18)
    const float sinP = -0.1790296; // sin(-0.18)
    float xc = pWorld.x;
    float yc = pWorld.y * cosP + pWorld.z * sinP;
    float zc = max(2.0, uFocalDepth + (-pWorld.y * sinP + pWorld.z * cosP));

    float focalProj = 2.48;
    vec2 ndc = vec2(
      (focalProj * xc) / (zc * max(0.4, uAspect)),
      (focalProj * yc) / zc
    );
    float tColor = clamp(u + 0.08 * v + 0.055 * y0, 0.0, 1.0);

    LandscapeCamPoint res;
    res.ndc = ndc;
    res.zCam = zc;
    res.tColor = tColor;
    return res;
  }
`;

export const LANDSCAPE_PARTICLE_VERTEX_SHADER = /* glsl */ `
  in vec4 aDomain; // (u, v, sizeSeed, isRidge)

  uniform vec2 uResolution;
  uniform float uDofStrength;
  uniform float uFocalPlane;
  uniform float uApertureScale;
  uniform float uBokehDecay;
  uniform float uParticleSize;
  uniform float uCoreIncandescence;
  uniform float uDensityNorm;

  out vec2 vQuadUv;
  out float vT;
  out float vBokehBlur;
  out float vEnergy;
  out float vIncandescence;

  ${GLSL3_LANDSCAPE_EVAL}

  void main() {
    vQuadUv = position.xy;

    float u = aDomain.x;
    float v = aDomain.y;
    float sizeSeed = aDomain.z;
    float isRidge = aDomain.w;

    float tSec = uAnimate > 0.5 ? uTime : 0.0;
    LandscapeCamPoint camPt = evaluateLandscapeCam(u, v, tSec);

    float scaleRef = uResolution.y / 1080.0;
    float rMin = max(1.05, 1.45 * scaleRef);
    float focalShift = uFocalDepth - uFocalPlane * 4.2;
    float cocDepth = abs(camPt.zCam - focalShift);

    float aperture = max(0.1, uApertureScale * uDofStrength);
    float rBokeh = clamp(
      rMin * sizeSeed * uParticleSize + aperture * cocDepth * scaleRef * mix(0.95, 0.52, isRidge) * (0.45 + 0.55 * sizeSeed),
      rMin * 0.85,
      62.0 * scaleRef
    );

    // Energy-conserving thin-lens luminance falloff preserving rich palette hue + luminous dust bokeh
    float ratio = min(1.0, rMin / max(0.01, rBokeh));
    float energyConserv = pow(ratio, uBokehDecay * mix(0.68, 0.90, isRidge));
    float edgeU = pow(max(0.0, sin(3.14159265 * u)), 0.65);
    float edgeV = exp(-0.34 * v * v);
    float popBoost = mix(1.35, 1.38, isRidge);

    vT = camPt.tColor;
    vBokehBlur = clamp((rBokeh - rMin * sizeSeed * uParticleSize) / (12.0 * scaleRef), 0.0, 1.0);
    vEnergy = energyConserv * edgeU * edgeV * popBoost * 1.95 * uDensityNorm;
    vIncandescence = exp(-4.2 * v * v) * pow(ratio, 0.95) * uCoreIncandescence * 0.42 * mix(0.15, 1.0, isRidge);

    vec2 ndcOffset = (position.xy * rBokeh * 2.0) / uResolution;
    gl_Position = vec4(camPt.ndc + ndcOffset, 0.0, 1.0);
  }
`;

export const LANDSCAPE_PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uBrightness;
  uniform float uTransparency;

  in vec2 vQuadUv;
  in float vT;
  in float vBokehBlur;
  in float vEnergy;
  in float vIncandescence;

  out vec4 fragColor;

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

    // Gaussian core transitioning into thin-lens rimmed bokeh disc
    float sharpCore = exp(-r2 * 7.8) * 0.90 + exp(-r2 * 2.8) * 0.22;
    float bokehDisc = smoothstep(1.0, 0.56, r) * (0.38 + 0.30 * smoothstep(0.50, 0.88, r));
    float profile = mix(sharpCore, bokehDisc, vBokehBlur);

    float intensity = profile * vEnergy;
    vec3 baseCol = samplePalette(vT);
    vec3 finalCol = mix(baseCol, vec3(1.0, 0.98, 0.95), clamp(vIncandescence, 0.0, 0.45));

    float alpha = clamp(intensity * uTransparency, 0.0, 1.0);
    if (alpha < 0.002) discard;

    fragColor = vec4(finalCol * uBrightness * intensity, alpha);
  }
`;

export const LANDSCAPE_LINE_VERTEX_SHADER = /* glsl */ `
  in vec2 aLineDomain; // (u_j, v_m)

  uniform float uDofStrength;
  uniform float uFocalPlane;

  out float vT;
  out float vAlpha;

  ${GLSL3_LANDSCAPE_EVAL}

  void main() {
    float u = aLineDomain.x;
    float v = aLineDomain.y;
    float tSec = uAnimate > 0.5 ? uTime : 0.0;

    LandscapeCamPoint camPt = evaluateLandscapeCam(u, v, tSec);

    float focalShift = uFocalDepth - uFocalPlane * 4.2;
    float cocDepth = abs(camPt.zCam - focalShift);
    float endFade = pow(max(0.0, sin(3.14159265 * u)), 0.55);
    float depthFade = 1.0 / (1.0 + cocDepth * (0.35 + uDofStrength * 0.25));

    vT = camPt.tColor;
    vAlpha = 0.88 * endFade * depthFade;

    gl_Position = vec4(camPt.ndc, 0.0, 1.0);
  }
`;

export const LANDSCAPE_LINE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uOpacity;
  uniform float uBrightness;
  uniform float uTime;
  uniform float uAnimate;

  in float vT;
  in float vAlpha;

  out vec4 fragColor;

  vec3 samplePalette(float t) {
    float x = clamp(t, 0.0, 1.0) * 3.0;
    if (x < 1.0) return mix(uColor0, uColor1, x);
    if (x < 2.0) return mix(uColor1, uColor2, x - 1.0);
    return mix(uColor2, uColor3, x - 2.0);
  }

  void main() {
    vec3 baseCol = samplePalette(vT);
    vec3 col = mix(baseCol, vec3(1.0, 0.99, 0.97), 0.22 * clamp(vAlpha, 0.0, 1.0));
    float pulse = 1.0;
    if (uAnimate > 0.5) {
      pulse = 0.76 + 0.28 * sin(vT * 14.0 - uTime * 2.8);
    }
    float alpha = vAlpha * uOpacity * 0.72 * pulse;
    if (alpha < 0.002) discard;

    fragColor = vec4(col * uBrightness * alpha, alpha);
  }
`;
