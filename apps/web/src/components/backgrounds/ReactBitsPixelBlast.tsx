import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer, EffectPass, Effect, RenderPass } from 'postprocessing';

const MAX_CLICKS = 10;

type PixelBlastVariant = 'square' | 'circle' | 'triangle' | 'diamond';

export type PixelBlastProps = {
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly variant?: PixelBlastVariant;
  readonly pixelSize?: number;
  readonly color?: string;
  readonly antialias?: boolean;
  readonly patternScale?: number;
  readonly patternDensity?: number;
  readonly liquid?: boolean;
  readonly liquidStrength?: number;
  readonly liquidRadius?: number;
  readonly pixelSizeJitter?: number;
  readonly enableRipples?: boolean;
  readonly rippleIntensityScale?: number;
  readonly rippleThickness?: number;
  readonly rippleSpeed?: number;
  readonly liquidWobbleSpeed?: number;
  readonly autoPauseOffscreen?: boolean;
  readonly speed?: number;
  readonly transparent?: boolean;
  readonly edgeFade?: number;
  readonly noiseAmount?: number;
};

type TouchPoint = {
  x: number;
  y: number;
  age: number;
  force: number;
  vx: number;
  vy: number;
};

const createTouchTexture = () => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D context not available');
  }
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.Texture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const trail: TouchPoint[] = [];
  let last: { x: number; y: number } | null = null;
  const maxAge = 64;
  let radius = 0.1 * size;
  const speed = 1 / maxAge;

  const clear = () => {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const drawPoint = (point: TouchPoint) => {
    const pos = { x: point.x * size, y: (1 - point.y) * size };
    let intensity = 1;
    const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2);
    const easeOutQuad = (t: number) => -t * (t - 2);
    if (point.age < maxAge * 0.3) {
      intensity = easeOutSine(point.age / (maxAge * 0.3));
    } else {
      intensity = easeOutQuad(1 - (point.age - maxAge * 0.3) / (maxAge * 0.7)) || 0;
    }
    intensity *= point.force;
    const color = `${((point.vx + 1) / 2) * 255}, ${((point.vy + 1) / 2) * 255}, ${intensity * 255}`;
    const offset = size * 5;
    ctx.shadowOffsetX = offset;
    ctx.shadowOffsetY = offset;
    ctx.shadowBlur = radius;
    ctx.shadowColor = `rgba(${color},${0.22 * intensity})`;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,0,0,1)';
    ctx.arc(pos.x - offset, pos.y - offset, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const addTouch = (norm: { x: number; y: number }) => {
    let force = 0;
    let vx = 0;
    let vy = 0;
    if (last) {
      const dx = norm.x - last.x;
      const dy = norm.y - last.y;
      if (dx === 0 && dy === 0) {
        return;
      }
      const dd = dx * dx + dy * dy;
      const d = Math.sqrt(dd);
      vx = dx / (d || 1);
      vy = dy / (d || 1);
      force = Math.min(dd * 10_000, 1);
    }
    last = { x: norm.x, y: norm.y };
    trail.push({ x: norm.x, y: norm.y, age: 0, force, vx, vy });
  };

  const update = () => {
    clear();
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      const point = trail[i];
      const f = point.force * speed * (1 - point.age / maxAge);
      point.x += point.vx * f;
      point.y += point.vy * f;
      point.age += 1;
      if (point.age > maxAge) {
        trail.splice(i, 1);
      }
    }
    for (let i = 0; i < trail.length; i += 1) {
      drawPoint(trail[i]);
    }
    texture.needsUpdate = true;
  };

  return {
    canvas,
    texture,
    addTouch,
    update,
    set radiusScale(value: number) {
      radius = 0.1 * size * value;
    },
    get radiusScale() {
      return radius / (0.1 * size);
    },
    size
  };
};

const createLiquidEffect = (texture: THREE.Texture, opts?: { strength?: number; freq?: number }) => {
  const fragment = `
    uniform sampler2D uTexture;
    uniform float uStrength;
    uniform float uTime;
    uniform float uFreq;

    void mainUv(inout vec2 uv) {
      vec4 tex = texture2D(uTexture, uv);
      float vx = tex.r * 2.0 - 1.0;
      float vy = tex.g * 2.0 - 1.0;
      float intensity = tex.b;

      float wave = 0.5 + 0.5 * sin(uTime * uFreq + intensity * 6.2831853);

      float amt = uStrength * intensity * wave;

      uv += vec2(vx, vy) * amt;
    }
  `;
  return new Effect('LiquidEffect', fragment, {
    uniforms: new Map([
      ['uTexture', new THREE.Uniform(texture)],
      ['uStrength', new THREE.Uniform(opts?.strength ?? 0.025)],
      ['uTime', new THREE.Uniform(0)],
      ['uFreq', new THREE.Uniform(opts?.freq ?? 4.5)]
    ])
  });
};

const SHAPE_MAP: Record<PixelBlastVariant, number> = {
  square: 0,
  circle: 1,
  triangle: 2,
  diamond: 3
};

const VERTEX_BODY = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_BODY = `
uniform vec3  uColor;
uniform vec2  uResolution;
uniform float uTime;
uniform float uPixelSize;
uniform float uScale;
uniform float uDensity;
uniform float uPixelJitter;
uniform int   uEnableRipples;
uniform float uRippleSpeed;
uniform float uRippleThickness;
uniform float uRippleIntensity;
uniform float uEdgeFade;

uniform int   uShapeType;
const int SHAPE_SQUARE   = 0;
const int SHAPE_CIRCLE   = 1;
const int SHAPE_TRIANGLE = 2;
const int SHAPE_DIAMOND  = 3;

const int   MAX_CLICKS = 10;

uniform vec2  uClickPos  [MAX_CLICKS];
uniform float uClickTimes[MAX_CLICKS];

float Bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2. + a.y * a.y * .75);
}
#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

#define FBM_OCTAVES     5
#define FBM_LACUNARITY  1.25
#define FBM_GAIN        1.0

float hash11(float n){ return fract(sin(n)*43758.5453); }

float vnoise(vec3 p){
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);
  float x00 = mix(n000, n100, w.x);
  float x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x);
  float x11 = mix(n011, n111, w.x);
  float y0  = mix(x00, x10, w.y);
  float y1  = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

float fbm2(vec2 uv, float t){
  vec3 p = vec3(uv * uScale, t);
  float amp = 1.0;
  float freq = 1.0;
  float sum = 1.0;
  for (int i = 0; i < FBM_OCTAVES; ++i){
    sum  += amp * vnoise(p * freq);
    freq *= FBM_LACUNARITY;
    amp  *= FBM_GAIN;
  }
  return sum * 0.5 + 0.5;
}

float maskCircle(vec2 p, float cov){
  float r = sqrt(cov) * .25;
  float d = length(p - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d * 2.0));
}

float maskTriangle(vec2 p, vec2 id, float cov){
  bool flip = mod(id.x + id.y, 2.0) > 0.5;
  if (flip) p.x = 1.0 - p.x;
  float r = sqrt(cov);
  float d  = p.y - r*(1.0 - p.x);
  float aa = fwidth(d);
  return cov * clamp(0.5 - d/aa, 0.0, 1.0);
}

float maskDiamond(vec2 p, float cov){
  float r = sqrt(cov) * 0.564;
  return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
}

void main(){
  float pixelSize = uPixelSize;
  vec2 fragCoord = gl_FragCoord.xy - uResolution * .5;
  float aspectRatio = uResolution.x / uResolution.y;

  vec2 pixelId = floor(fragCoord / pixelSize);
  vec2 pixelUV = fract(fragCoord / pixelSize);

  float cellPixelSize = 8.0 * pixelSize;
  vec2 cellId = floor(fragCoord / cellPixelSize);
  vec2 cellCoord = cellId * cellPixelSize;
  vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);

  float base = fbm2(uv, uTime * 0.05);
  base = base * 0.5 - 0.65;

  float feed = base + (uDensity - 0.5) * 0.3;

  float speed     = uRippleSpeed;
  float thickness = uRippleThickness;
  const float dampT     = 1.0;
  const float dampR     = 10.0;

  if (uEnableRipples == 1) {
    for (int i = 0; i < MAX_CLICKS; ++i){
      vec2 pos = uClickPos[i];
      if (pos.x < 0.0) continue;
      float cellPixelSize = 8.0 * pixelSize;
      vec2 cuv = (((pos - uResolution * .5 - cellPixelSize * .5) / (uResolution))) * vec2(aspectRatio, 1.0);
      float t = max(uTime - uClickTimes[i], 0.0);
      float r = distance(uv, cuv);
      float waveR = speed * t;
      float ring  = exp(-pow((r - waveR) / thickness, 2.0));
      float atten = exp(-dampT * t) * exp(-dampR * r);
      feed = max(feed, ring * atten * uRippleIntensity);
    }
  }

  float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;
  float bw = step(0.5, feed + bayer);

  float h = fract(sin(dot(floor(fragCoord / uPixelSize), vec2(127.1, 311.7))) * 43758.5453);
  float jitterScale = 1.0 + (h - 0.5) * uPixelJitter;
  float coverage = bw * jitterScale;
  float M;
  if      (uShapeType == SHAPE_CIRCLE)   M = maskCircle (pixelUV, coverage);
  else if (uShapeType == SHAPE_TRIANGLE) M = maskTriangle(pixelUV, pixelId, coverage);
  else if (uShapeType == SHAPE_DIAMOND)  M = maskDiamond(pixelUV, coverage);
  else                                   M = coverage;

  if (uEdgeFade > 0.0) {
    vec2 norm = gl_FragCoord.xy / uResolution;
    float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
    float fade = smoothstep(0.0, uEdgeFade, edge);
    M *= fade;
  }

  vec3 color = uColor;
  FRAG_COLOR = vec4(color, M);
}
`;

const randomFloat = () => {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const u32 = new Uint32Array(1);
    window.crypto.getRandomValues(u32);
    return u32[0] / 0xffffffff;
  }
  return Math.random();
};
const getVertexShader = (isWebGL2: boolean) =>
  isWebGL2
    ? `#version 300 es\nprecision highp float;\nin vec3 position;\n${VERTEX_BODY}`
    : `precision highp float;\nattribute vec3 position;\n${VERTEX_BODY}`;

const getFragmentShader = (isWebGL2: boolean) =>
  isWebGL2
    ? `#version 300 es\nprecision highp float;\nout vec4 fragColor;\n#define FRAG_COLOR fragColor\n${FRAGMENT_BODY}`
    : `#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n#define FRAG_COLOR gl_FragColor\n${FRAGMENT_BODY}`;

const PixelBlast: React.FC<PixelBlastProps> = ({
  className,
  style,
  variant = 'circle',
  pixelSize = 6,
  color = '#B19EEF',
  antialias = true,
  patternScale = 3,
  patternDensity = 1.2,
  liquid = true,
  liquidStrength = 0.12,
  liquidRadius = 1.2,
  pixelSizeJitter = 0.5,
  enableRipples = true,
  rippleIntensityScale = 1.5,
  rippleThickness = 0.12,
  rippleSpeed = 0.4,
  liquidWobbleSpeed = 5,
  autoPauseOffscreen = true,
  speed = 0.6,
  transparent = true,
  edgeFade = 0.25,
  noiseAmount = 0
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visibilityRef = useRef({ visible: true });
  const speedRef = useRef(speed);
  const runtimeRef = useRef<any>(null);
  const prevConfigRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') {
      return undefined;
    }
    speedRef.current = speed;
    const needsReinitKeys: Array<keyof PixelBlastProps> = ['antialias', 'liquid', 'noiseAmount'];
    const cfg = { antialias, liquid, noiseAmount };
    let mustReinit = false;
    if (!runtimeRef.current) {
      mustReinit = true;
    } else if (prevConfigRef.current) {
      for (const key of needsReinitKeys) {
        if (prevConfigRef.current[key] !== cfg[key]) {
          mustReinit = true;
          break;
        }
      }
    }

    const disposeRuntime = () => {
      const rt = runtimeRef.current;
      if (!rt) {
        return;
      }
      rt.resizeObserver?.disconnect();
      cancelAnimationFrame(rt.raf);
      rt.quad?.geometry.dispose();
      rt.material.dispose();
      rt.composer?.dispose();
      rt.renderer.dispose();
      if (rt.renderer.domElement.parentElement === container) {
        container.removeChild(rt.renderer.domElement);
      }
      runtimeRef.current = null;
    };

    const init = () => {
      const canvas = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias,
        alpha: true,
        powerPreference: 'high-performance'
      });
      const isWebGL2 = renderer.capabilities.isWebGL2;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);
      if (transparent) {
        renderer.setClearAlpha(0);
      } else {
        renderer.setClearColor(0x000000, 1);
      }

      const uniforms = {
        uResolution: { value: new THREE.Vector2(0, 0) },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uClickPos: {
          value: Array.from({ length: MAX_CLICKS }, () => new THREE.Vector2(-1, -1))
        },
        uClickTimes: { value: new Float32Array(MAX_CLICKS) },
        uShapeType: { value: SHAPE_MAP[variant] ?? 0 },
        uPixelSize: { value: pixelSize * renderer.getPixelRatio() },
        uScale: { value: patternScale },
        uDensity: { value: patternDensity },
        uPixelJitter: { value: pixelSizeJitter },
        uEnableRipples: { value: enableRipples ? 1 : 0 },
        uRippleSpeed: { value: rippleSpeed },
        uRippleThickness: { value: rippleThickness },
        uRippleIntensity: { value: rippleIntensityScale },
        uEdgeFade: { value: edgeFade }
      };

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const material = new THREE.RawShaderMaterial({
        vertexShader: getVertexShader(isWebGL2),
        fragmentShader: getFragmentShader(isWebGL2),
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        glslVersion: isWebGL2 ? THREE.GLSL3 : undefined
      });
      const quadGeom = new THREE.PlaneGeometry(2, 2);
      const quad = new THREE.Mesh(quadGeom, material);
      scene.add(quad);
      const clock = new THREE.Clock();

      const setSize = () => {
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        renderer.setSize(w, h, false);
        uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
        runtimeRef.current?.composer?.setSize(renderer.domElement.width, renderer.domElement.height);
        uniforms.uPixelSize.value = pixelSize * renderer.getPixelRatio();
      };
      setSize();
      const resizeObserver = new ResizeObserver(setSize);
      resizeObserver.observe(container);

      const timeOffset = randomFloat() * 1000;
      let composer: EffectComposer | undefined;
      let touch: ReturnType<typeof createTouchTexture> | undefined;
      let liquidEffect: Effect | undefined;

      if (liquid) {
        touch = createTouchTexture();
        touch.radiusScale = liquidRadius;
        composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        liquidEffect = createLiquidEffect(touch.texture, {
          strength: liquidStrength,
          freq: liquidWobbleSpeed
        });
        const effectPass = new EffectPass(camera, liquidEffect);
        effectPass.renderToScreen = true;
        composer.addPass(renderPass);
        composer.addPass(effectPass);
      }

      if (noiseAmount > 0) {
        if (!composer) {
          composer = new EffectComposer(renderer);
          composer.addPass(new RenderPass(scene, camera));
        }
        const noiseEffect = new Effect(
          'NoiseEffect',
          `uniform float uTime; uniform float uAmount; float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);} void mainUv(inout vec2 uv){} void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){ float n=hash(floor(uv*vec2(1920.0,1080.0))+floor(uTime*60.0)); float g=(n-0.5)*uAmount; outputColor=inputColor+vec4(vec3(g),0.0);} `,
          {
            uniforms: new Map([
              ['uTime', new THREE.Uniform(0)],
              ['uAmount', new THREE.Uniform(noiseAmount)]
            ])
          }
        );
        const noisePass = new EffectPass(camera, noiseEffect);
        noisePass.renderToScreen = true;
        composer.passes.forEach((pass) => {
          pass.renderToScreen = false;
        });
        composer.addPass(noisePass);
      }

      composer?.setSize(renderer.domElement.width, renderer.domElement.height);

      const mapToPixels = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const scaleX = renderer.domElement.width / rect.width;
        const scaleY = renderer.domElement.height / rect.height;
        const fx = (event.clientX - rect.left) * scaleX;
        const fy = (rect.height - (event.clientY - rect.top)) * scaleY;
        return { fx, fy, w: renderer.domElement.width, h: renderer.domElement.height };
      };

      const onPointerDown = (event: PointerEvent) => {
        const { fx, fy } = mapToPixels(event);
        const ix = runtimeRef.current?.clickIx ?? 0;
        uniforms.uClickPos.value[ix].set(fx, fy);
        uniforms.uClickTimes.value[ix] = uniforms.uTime.value;
        if (runtimeRef.current) {
          runtimeRef.current.clickIx = (ix + 1) % MAX_CLICKS;
        }
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!touch) {
          return;
        }
        const { fx, fy, w, h } = mapToPixels(event);
        touch.addTouch({ x: fx / w, y: fy / h });
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
      renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });

      let raf = 0;
      const animate = () => {
        if (autoPauseOffscreen && !visibilityRef.current.visible) {
          raf = requestAnimationFrame(animate);
          return;
        }
        uniforms.uTime.value = timeOffset + clock.getElapsedTime() * speedRef.current;
        if (liquidEffect) {
          liquidEffect.uniforms.get('uTime')!.value = uniforms.uTime.value;
        }
        if (composer) {
          if (touch) {
            touch.update();
          }
          composer.passes.forEach((pass) => {
            const effects = (pass as any).effects as Effect[] | undefined;
            effects?.forEach((effect) => {
              const uniform = effect.uniforms?.get('uTime');
              if (uniform) {
                uniform.value = uniforms.uTime.value;
              }
            });
          });
          composer.render();
        } else {
          renderer.render(scene, camera);
        }
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      runtimeRef.current = {
        renderer,
        scene,
        camera,
        material,
        clock,
        clickIx: 0,
        uniforms,
        resizeObserver,
        raf,
        quad,
        timeOffset,
        composer,
        touch,
        liquidEffect
      };
    };

    if (mustReinit) {
      disposeRuntime();
      init();
    } else if (runtimeRef.current) {
      const t = runtimeRef.current;
      t.uniforms.uShapeType.value = SHAPE_MAP[variant] ?? 0;
      t.uniforms.uPixelSize.value = pixelSize * t.renderer.getPixelRatio();
      t.uniforms.uColor.value.set(color);
      t.uniforms.uScale.value = patternScale;
      t.uniforms.uDensity.value = patternDensity;
      t.uniforms.uPixelJitter.value = pixelSizeJitter;
      t.uniforms.uEnableRipples.value = enableRipples ? 1 : 0;
      t.uniforms.uRippleIntensity.value = rippleIntensityScale;
      t.uniforms.uRippleThickness.value = rippleThickness;
      t.uniforms.uRippleSpeed.value = rippleSpeed;
      t.uniforms.uEdgeFade.value = edgeFade;
      if (transparent) {
        t.renderer.setClearAlpha(0);
      } else {
        t.renderer.setClearColor(0x000000, 1);
      }
      if (t.liquidEffect) {
        const uStrength = t.liquidEffect.uniforms.get('uStrength');
        if (uStrength) {
          uStrength.value = liquidStrength;
        }
        const uFreq = t.liquidEffect.uniforms.get('uFreq');
        if (uFreq) {
          uFreq.value = liquidWobbleSpeed;
        }
      }
      if (t.touch) {
        t.touch.radiusScale = liquidRadius;
      }
    }

    prevConfigRef.current = cfg;
    return () => {
      if (mustReinit) {
        disposeRuntime();
      }
    };
  }, [
    antialias,
    liquid,
    noiseAmount,
    pixelSize,
    patternScale,
    patternDensity,
    enableRipples,
    rippleIntensityScale,
    rippleThickness,
    rippleSpeed,
    pixelSizeJitter,
    edgeFade,
    transparent,
    liquidStrength,
    liquidRadius,
    liquidWobbleSpeed,
    autoPauseOffscreen,
    variant,
    color,
    speed
  ]);

  return (
    <div
      ref={containerRef}
      className={`pixel-blast-container ${className ?? ''}`.trim()}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...(style ?? {}) }}
      aria-label="PixelBlast interactive background"
    />
  );
};

export default PixelBlast;
