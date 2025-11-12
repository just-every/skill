import React, { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import { cn } from '../../lib/cn';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { usePrefersCoarsePointer } from '../../lib/usePrefersCoarsePointer';
import { usePrefersDataSaver } from '../../lib/usePrefersDataSaver';

export type StarfieldVariant =
  | 'quietPulse'
  | 'emberVeil'
  | 'gridGlow'
  | 'orbitTrail'
  | 'pixelBloom'
  | 'prismMist';

type VariantBehavior = 'trails' | 'ember' | 'grid' | 'orbit' | 'cluster' | 'mist';

type StarfieldVariantDefinition = {
  readonly label: string;
  readonly description: string;
  readonly swatch: string;
  readonly parallaxStrength: number;
  readonly density: number;
  readonly speed: number;
  readonly sizeRange: [number, number];
  readonly opacityRange: [number, number];
  readonly driftAmplitude: number;
  readonly colorRamp: string[];
  readonly behavior: VariantBehavior;
  readonly microBehavior: string;
  readonly depthCurve?: (depth: number) => number;
  readonly extra?: {
    readonly gridSize?: number;
    readonly clusterCount?: number;
    readonly orbitRadiusRange?: [number, number];
    readonly mistOffsets?: number[];
  };
};

const resolveColorValue = (value: string): string => {
  if (typeof window === 'undefined' || !value.startsWith('--')) {
    return value;
  }
  const computed = getComputedStyle(document.documentElement).getPropertyValue(value).trim();
  return computed || value;
};

const microEventColorTokens: Record<VariantBehavior, string> = {
  trails: '--starfield-quiet-micro',
  ember: '--starfield-ember-micro',
  grid: '--starfield-grid-micro',
  orbit: '--starfield-orbit-micro',
  cluster: '--starfield-pixel-micro',
  mist: '--starfield-prism-micro'
};

const STARFIELD_VARIANTS: Record<StarfieldVariant, StarfieldVariantDefinition> = {
  quietPulse: {
    label: 'Quiet pulse',
    description: 'Alpha-decay trails that grow just a bit brighter on interaction.',
    swatch: 'linear-gradient(145deg, rgba(255,255,255,0.8), rgba(148,163,184,0.35))',
    parallaxStrength: 0.18,
    density: 120,
    speed: 0.02,
    sizeRange: [0.9, 1.8],
    opacityRange: [0.05, 0.22],
    driftAmplitude: 0.02,
    colorRamp: ['--starfield-quiet-1', '--starfield-quiet-2'],
    behavior: 'trails',
    microBehavior: 'trailEcho',
    depthCurve: (depth) => 0.5 + depth * 0.6
  },
  emberVeil: {
    label: 'Ember veil',
    description: 'Warm, vertical streaks with soft blur pulses.',
    swatch: 'linear-gradient(145deg, rgba(255,182,118,0.7), rgba(245,158,11,0.35))',
    parallaxStrength: 0.28,
    density: 100,
    speed: 0.035,
    sizeRange: [1.4, 2.6],
    opacityRange: [0.04, 0.18],
    driftAmplitude: 0.03,
    colorRamp: ['--starfield-ember-1', '--starfield-ember-2'],
    behavior: 'ember',
    microBehavior: 'emberUpdraft',
    depthCurve: (depth) => depth * 0.75 + 0.25
  },
  gridGlow: {
    label: 'Grid glow',
    description: 'Quantized lines that shimmer like a minimalist data grid.',
    swatch: 'linear-gradient(145deg, rgba(148,163,184,0.6), rgba(241,245,249,0.25))',
    parallaxStrength: 0.24,
    density: 90,
    speed: 0.015,
    sizeRange: [1.6, 2.8],
    opacityRange: [0.05, 0.22],
    driftAmplitude: 0.02,
    colorRamp: ['--starfield-grid-1', '--starfield-grid-2'],
    behavior: 'grid',
    microBehavior: 'latticePin',
    extra: { gridSize: 20 }
  },
  orbitTrail: {
    label: 'Orbit trail',
    description: 'Edge orbiters that trace the menu border with delicate halos.',
    swatch: 'linear-gradient(145deg, rgba(148,163,184,0.4), rgba(14,165,233,0.25))',
    parallaxStrength: 0.36,
    density: 80,
    speed: 0.04,
    sizeRange: [1.2, 2.2],
    opacityRange: [0.08, 0.22],
    driftAmplitude: 0.03,
    colorRamp: ['--starfield-orbit-1', '--starfield-orbit-2'],
    behavior: 'orbit',
    microBehavior: 'perihelionFlare',
    extra: { orbitRadiusRange: [0.03, 0.12] }
  },
  pixelBloom: {
    label: 'Pixel bloom',
    description: 'Clustered pixel bursts that bloom on hover.',
    swatch: 'linear-gradient(145deg, rgba(191,219,254,0.35), rgba(217,70,239,0.25))',
    parallaxStrength: 0.33,
    density: 140,
    speed: 0.03,
    sizeRange: [1, 2.4],
    opacityRange: [0.03, 0.18],
    driftAmplitude: 0.028,
    colorRamp: ['--starfield-pixel-1', '--starfield-pixel-2'],
    behavior: 'cluster',
    microBehavior: 'clusterCascade',
    extra: { clusterCount: 6 }
  },
  prismMist: {
    label: 'Prism mist',
    description: 'Chromatic sub-pixel mist with a slow pulse.',
    swatch: 'linear-gradient(145deg, rgba(165,243,252,0.45), rgba(252,211,77,0.35))',
    parallaxStrength: 0.26,
    density: 110,
    speed: 0.037,
    sizeRange: [1, 1.9],
    opacityRange: [0.04, 0.2],
    driftAmplitude: 0.033,
    colorRamp: ['--starfield-prism-1', '--starfield-prism-2'],
    behavior: 'mist',
    microBehavior: 'spectrumBreath',
    extra: { mistOffsets: [-0.4, 0, 0.4] }
  }
} as const;

export const STARFIELD_VARIANT_KEYS = Object.keys(STARFIELD_VARIANTS) as StarfieldVariant[];
export const DEFAULT_STARFIELD_VARIANT: StarfieldVariant = 'quietPulse';
export const isStarfieldVariant = (value: string): value is StarfieldVariant =>
  STARFIELD_VARIANT_KEYS.includes(value as StarfieldVariant);
export { STARFIELD_VARIANTS };

type StarShape = 'pixel' | 'line' | 'flare' | 'ring';

type Star = {
  baseX: number;
  baseY: number;
  depth: number;
  color: string;
  size: number;
  opacity: number;
  speed: number;
  phase: number;
  driftAmplitude: number;
  driftDirection: number;
  shape: StarShape;
  orbitRadius?: number;
  orbitPhase?: number;
  orbitSpeed?: number;
  meta: Record<string, any>;
};

type PointerState = {
  x: number;
  y: number;
  active: boolean;
};

export type Hotspot = {
  x: number;
  y: number;
  intensity: number;
  radius: number;
};

type StarfieldMode = 'normal' | 'conserve' | 'static';

type StarfieldProps = {
  readonly variant?: StarfieldVariant;
  readonly density?: number;
  readonly hoverGain?: number;
  readonly interactionLevel?: number;
  readonly depthCurve?: (depth: number) => number;
  readonly containerRef?: React.RefObject<HTMLElement | null>;
  readonly className?: string;
  readonly reduceMotionOverride?: boolean;
  readonly transitionDurationMs?: number;
  readonly hotspot?: Hotspot;
  readonly microEventFrequency?: number;
};

type LayerState = {
  id: number;
  variant: StarfieldVariant;
  active: boolean;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const wrapUnit = (value: number): number => ((value % 1) + 1) % 1;
const randomBetween = (range: [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);
const generateClusterCenters = (count: number): Array<{ x: number; y: number }> =>
  Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random() }));

const buildStars = (count: number, config: StarfieldVariantDefinition, palette: string[]): Star[] => {
  const clusters = config.behavior === 'cluster' ? generateClusterCenters(config.extra?.clusterCount ?? 5) : [];

  return Array.from({ length: count }, () => {
    const orbitRadius = config.behavior === 'orbit' ? randomBetween(config.extra?.orbitRadiusRange ?? [0.03, 0.12]) : undefined;
    const star: Star = {
      baseX: Math.random(),
      baseY: Math.random(),
      depth: Math.random(),
      color: palette.length > 0 ? palette[Math.floor(Math.random() * palette.length)] : '#ffffff',
      size: randomBetween(config.sizeRange),
      opacity: randomBetween(config.opacityRange),
      speed: config.speed * (0.8 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
      driftAmplitude: config.driftAmplitude * (0.5 + Math.random()),
      driftDirection: Math.random() * Math.PI * 2,
      shape: ['pixel', 'line', 'flare', 'ring'][Math.floor(Math.random() * 4)] as StarShape,
      orbitRadius,
      orbitPhase: Math.random() * Math.PI * 2,
      orbitSpeed: 0.8 + Math.random() * 0.6,
      meta: {}
    };

    if (config.behavior === 'cluster') {
      const selected = clusters[Math.floor(Math.random() * clusters.length)];
      star.meta.cluster = selected;
      star.meta.bloomPhase = Math.random() * Math.PI * 2;
    }
    if (config.behavior === 'trails') {
      star.meta.last = { x: star.baseX, y: star.baseY };
    }
    if (config.behavior === 'mist') {
      star.meta.offsets = config.extra?.mistOffsets ?? [-0.4, 0, 0.4];
    }
    if (config.behavior === 'orbit') {
      star.meta.edgeAngle = Math.random() * Math.PI * 2;
    }

    return star;
  });
};

const LAYER_TRANSITION_MS = 360;

type StarfieldLayerProps = {
  variant: StarfieldVariant;
  config: StarfieldVariantDefinition;
  interactionLevel: number;
  hoverGain: number;
  depthCurve?: (depth: number) => number;
  densityOverride?: number;
  pointerRef: MutableRefObject<PointerState>;
  hostRef?: React.RefObject<HTMLElement | null>;
  prefersReducedMotion: boolean;
  isActive: boolean;
  transitionMs: number;
  hotspot?: Hotspot;
  microEventFrequency?: number;
  className?: string;
  mode?: StarfieldMode;
};

const StarfieldLayer = React.memo((props: StarfieldLayerProps) => {
  const {
    variant,
    config,
    interactionLevel,
    hoverGain,
    depthCurve,
    densityOverride,
    pointerRef,
    hostRef,
    prefersReducedMotion,
    isActive,
    transitionMs,
    hotspot,
    microEventFrequency,
    className,
    mode
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef(interactionLevel);
  const depthCurveRef = useRef(depthCurve);
  const microEventsRef = useRef<MicroEvent[]>([]);
  const microEventFreq = microEventFrequency ?? 0.002;

  useEffect(() => {
    interactionRef.current = interactionLevel;
  }, [interactionLevel]);

  useEffect(() => {
    depthCurveRef.current = depthCurve;
  }, [depthCurve]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef?.current ?? canvas?.parentElement;
    if (!canvas || !host) {
      return undefined;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }
    context.imageSmoothingEnabled = false;

    const resolvedDensity = Math.max(40, Math.round(densityOverride ?? config.density));
    const palette = config.colorRamp.map(resolveColorValue);
    const microEventColor = resolveColorValue(microEventColorTokens[config.behavior] ?? '#ffffff');
    const stars = buildStars(resolvedDensity, config, palette);
    const resolvedDepth = depthCurveRef.current ?? ((value: number) => value);
    let displayWidth = Math.max(120, host.clientWidth);
    let displayHeight = Math.max(120, host.clientHeight);
    let pixelRatio = window.devicePixelRatio || 1;
    let frameId: number | null = null;
    let latestTime = performance.now();
    let hoverProgress = 0;
    const MICRO_EVENT_LIMIT = 40;
    let visibilityPaused = false;

    const updateSize = () => {
      const newWidth = Math.max(120, host.clientWidth);
      const newHeight = Math.max(120, host.clientHeight);
      pixelRatio = window.devicePixelRatio || 1;
      const scaledWidth = Math.round(newWidth * pixelRatio);
      const scaledHeight = Math.round(newHeight * pixelRatio);
      if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      }
      canvas.style.width = `${newWidth}px`;
      canvas.style.height = `${newHeight}px`;
      displayWidth = newWidth;
      displayHeight = newHeight;
    };

    const drawScene = (delta: number) => {
      context.clearRect(0, 0, displayWidth, displayHeight);
      hoverProgress = clamp(hoverProgress + (pointerRef.current.active ? 0.08 : -0.08), 0, 1);
      const intensity = interactionRef.current;
      const hoverScalar = 1 + (hoverGain - 1) * Math.max(0.05, intensity);

      stars.forEach((star, index) => {
        if (!prefersReducedMotion) {
          star.phase += (delta * star.speed) / 160;
        }
        const depthValue = clamp(resolvedDepth(star.depth), 0, 1);
        const driftRadius = star.driftAmplitude * depthValue;
        const driftX = Math.cos(star.driftDirection + star.phase) * driftRadius;
        const driftY = Math.sin(star.driftDirection + star.phase * 0.8) * driftRadius;
        const pointerX = (pointerRef.current.x - 0.5) * 2 * config.parallaxStrength * depthValue;
        const pointerY = (pointerRef.current.y - 0.5) * 2 * config.parallaxStrength * depthValue;
        const orbitX = star.orbitRadius
          ? Math.cos(star.phase * (star.orbitSpeed ?? 1) + (star.orbitPhase ?? 0)) * star.orbitRadius
          : 0;
        const orbitY = star.orbitRadius
          ? Math.sin(star.phase * (star.orbitSpeed ?? 1) + (star.orbitPhase ?? 0)) * star.orbitRadius
          : 0;

      const rawX = wrapUnit(star.baseX + pointerX + driftX + orbitX) * displayWidth;
      const rawY = wrapUnit(star.baseY + pointerY + driftY + orbitY) * displayHeight;
      const x = Math.round(rawX * pixelRatio) / pixelRatio;
      const y = Math.round(rawY * pixelRatio) / pixelRatio;
      renderVariant(context, {
        variant,
        config,
        star,
        x,
        y,
        depthValue,
        intensity,
        hoverScalar,
        pointer: pointerRef.current,
        index,
        displayWidth,
        displayHeight,
        hotspot,
      });
      });

      if (!prefersReducedMotion) {
        const hotspotStrength = hotspot
          ? clamp(1 - Math.hypot(pointerRef.current.x - hotspot.x, pointerRef.current.y - hotspot.y) / hotspot.radius, 0, 1)
          : 0;
        const chance = microEventFreq * delta * (1 + intensity * 0.6 + hotspotStrength);
      if (Math.random() < chance) {
        const queue = microEventsRef.current;
        if (queue.length >= MICRO_EVENT_LIMIT) {
          queue.shift();
        }
        queue.push(
          spawnMicroEvent(
            variant,
            displayWidth,
            displayHeight,
            pointerRef.current,
            config.behavior,
            microEventColor,
            config.microBehavior,
            hotspotStrength
          )
        );
      }
      renderMicroEvents(context, microEventsRef.current, delta, displayWidth, displayHeight);
      }
    };

    const animate = (time: number) => {
      const delta = time - latestTime;
      latestTime = time;
      drawScene(delta);
      if (!prefersReducedMotion) {
        frameId = requestAnimationFrame(animate);
      }
    };

    updateSize();
    drawScene(0);
    if (!prefersReducedMotion) {
      frameId = requestAnimationFrame(animate);
    }

    const handleVisibility = () => {
      if (typeof document === 'undefined') {
        return;
      }
      if (document.hidden) {
        visibilityPaused = true;
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
      } else if (visibilityPaused && !prefersReducedMotion) {
        visibilityPaused = false;
        frameId = requestAnimationFrame(animate);
      }
    };
    if (typeof document !== 'undefined') {
      visibilityPaused = document.hidden;
      document.addEventListener('visibilitychange', handleVisibility);
    }

    const handleResize = () => {
      updateSize();
      drawScene(0);
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (resizeObserver) {
      resizeObserver.observe(host);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [variant, config, densityOverride, depthCurve, hoverGain, prefersReducedMotion, hostRef, pointerRef, hotspot, microEventFrequency]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid={`starfield-layer-${variant}`}
      data-starfield-mode={mode ?? 'normal'}
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full transition-opacity ease-out',
        className
      )}
      style={{
        opacity: isActive ? 1 : 0,
        transition: `opacity ${transitionMs}ms ease`,
        willChange: 'opacity'
      }}
    />
  );
});

type RenderVariantParams = {
  variant: StarfieldVariant;
  config: StarfieldVariantDefinition;
  star: Star;
  x: number;
  y: number;
  depthValue: number;
  intensity: number;
  hoverScalar: number;
  pointer: PointerState;
  index: number;
  displayWidth: number;
  displayHeight: number;
  hotspot?: Hotspot;
};

type MicroEvent = {
  x: number;
  y: number;
  type: 'streak' | 'twinkle' | 'shimmer';
  progress: number;
  duration: number;
  color: string;
  variant: StarfieldVariant;
  angle?: number;
  length?: number;
  microBehavior: string;
  hotspotStrength: number;
};

const renderVariant = (context: CanvasRenderingContext2D, params: RenderVariantParams) => {
  const {
    variant,
    config,
    star,
    x,
    y,
    depthValue,
    intensity,
    hoverScalar,
    pointer,
    index,
    displayWidth,
    displayHeight,
    hotspot
  } = params;
  context.save();
  context.lineCap = 'round';
  context.fillStyle = star.color;
  context.strokeStyle = star.color;

  const xRatio = x / displayWidth;
  const yRatio = y / displayHeight;
  const hotspotStrength = hotspot
    ? clamp(1 - Math.hypot(xRatio - hotspot.x, yRatio - hotspot.y) / hotspot.radius, 0, 1) * hotspot.intensity
    : 0;
  context.globalAlpha = clamp(star.opacity * hoverScalar + hotspotStrength * 0.28, 0.02, 0.8);
  switch (config.behavior) {
    case 'trails': {
      const trail = star.meta.last;
      context.lineWidth = Math.max(0.5, star.size);
      context.beginPath();
      context.moveTo(trail?.x ?? x, trail?.y ?? y);
      context.lineTo(x, y);
      context.stroke();
      context.fillRect(x, y, Math.max(1, star.size), Math.max(1, star.size));
      star.meta.last = { x, y };
      break;
    }
    case 'ember': {
      const beamHeight = 8 + star.size * 6;
      context.shadowColor = star.color;
      context.shadowBlur = star.size * 10;
      context.fillRect(x - star.size, y - beamHeight * 0.6, star.size * 2, beamHeight);
      context.shadowBlur = 0;
      break;
    }
    case 'grid': {
      const spacing = config.extra?.gridSize ?? 18;
      const gridX = Math.round(x / spacing) * spacing;
      const gridY = Math.round(y / spacing) * spacing;
      context.globalCompositeOperation = 'lighter';
      context.fillRect(gridX, gridY, spacing * 0.8, 0.8);
      context.fillRect(gridX, gridY, 0.8, spacing * 0.8);
      context.globalCompositeOperation = 'source-over';
      break;
    }
    case 'orbit': {
      const haloRadius = 2 + star.size * 1.5 * (1 + intensity * 0.7);
      context.lineWidth = 0.8;
      context.strokeStyle = `rgba(255,255,255,${0.15 + intensity * 0.25})`;
      context.beginPath();
      context.arc(x, y, haloRadius, 0, Math.PI * 2);
      context.stroke();
      context.fillRect(x, y, Math.max(1, star.size), Math.max(1, star.size));
      break;
    }
    case 'cluster': {
      const bloomFactor = 1 + intensity * 1.2;
      const cluster = star.meta.cluster ?? { x: star.baseX, y: star.baseY };
      const offsetX = Math.cos(star.phase * 1.6 + index) * star.size * 0.6;
      const offsetY = Math.sin(star.phase * 1.2 + index) * star.size * 0.6;
      const clusterX = cluster.x * displayWidth + offsetX;
      const clusterY = cluster.y * displayHeight + offsetY;
      context.fillRect(clusterX, clusterY, star.size * bloomFactor, star.size * bloomFactor);
      context.fillRect(clusterX + star.size * 0.8, clusterY - star.size * 0.4, star.size * 0.5 * bloomFactor, star.size * 0.5 * bloomFactor);
      break;
    }
    case 'mist': {
      const mistSize = star.size * (1.2 + intensity * 0.8);
      context.shadowBlur = star.size * 8;
      (star.meta.offsets ?? [0]).forEach((offset: number, channel: number) => {
        const color = channel === 0 ? '#f472b6' : channel === 1 ? '#a5f3fc' : '#fcd34d';
        context.fillStyle = color;
        context.beginPath();
        context.arc(x + offset * mistSize, y + offset * mistSize, mistSize, 0, Math.PI * 2);
        context.fill();
      });
      context.shadowBlur = 0;
      break;
    }
    default: {
      context.fillRect(x, y, Math.max(1, star.size), Math.max(1, star.size));
    }
  }

  context.restore();
};

const chooseMicroEventType = (behavior: VariantBehavior): MicroEvent['type'] => {
  switch (behavior) {
    case 'ember':
    case 'orbit':
      return 'streak';
    case 'mist':
      return 'shimmer';
    default:
      return 'twinkle';
  }
};

const spawnMicroEvent = (
  variant: StarfieldVariant,
  displayWidth: number,
  displayHeight: number,
  pointer: PointerState,
  behavior: VariantBehavior,
  color: string,
  microBehavior: string,
  hotspotStrength: number
): MicroEvent => {
  const type = chooseMicroEventType(behavior);
  const angle = Math.random() * Math.PI * 2;
  const length = 6 + Math.random() * 12;
  const baseX = pointer.active ? pointer.x * displayWidth : Math.random() * displayWidth;
  const baseY = pointer.active ? pointer.y * displayHeight : Math.random() * displayHeight;
  return {
    x: baseX,
    y: baseY,
    type,
    progress: 0,
    duration: 600 + Math.random() * 600,
    color,
    variant,
    angle,
    length,
    microBehavior,
    hotspotStrength,
  };
};

const renderMicroEvents = (
  context: CanvasRenderingContext2D,
  events: MicroEvent[],
  delta: number,
  displayWidth: number,
  displayHeight: number
) => {
  const remaining: MicroEvent[] = [];
  events.forEach((event) => {
    event.progress += delta / event.duration;
    if (event.progress >= 1) {
      return;
    }
    const alpha = 0.35 * (1 - event.progress);
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = event.color;
    context.fillStyle = event.color;
    switch (event.type) {
      case 'streak': {
        context.lineWidth = 1;
        context.beginPath();
        const x2 = event.x + Math.cos(event.angle ?? 0) * (event.length ?? 8);
        const y2 = event.y + Math.sin(event.angle ?? 0) * (event.length ?? 8);
        context.moveTo(event.x, event.y);
        context.lineTo(x2, y2);
        context.stroke();
        break;
      }
      case 'twinkle': {
        const radius = 1 + 2 * (1 - event.progress);
        context.beginPath();
        context.arc(event.x, event.y, radius, 0, Math.PI * 2);
        context.fill();
        break;
      }
    case 'shimmer': {
      const radius = 2 + 3 * (1 - event.progress);
      context.beginPath();
      context.arc(event.x, event.y, radius, 0, Math.PI * 2);
      context.strokeStyle = `rgba(255,255,255,${alpha})`;
      context.lineWidth = 0.5;
      context.stroke();
      break;
    }
  }
    renderMicroBehavior(context, event);
    context.restore();
    remaining.push(event);
  });
  events.length = 0;
  events.push(...remaining);
};

const renderMicroBehavior = (context: CanvasRenderingContext2D, event: MicroEvent) => {
  const strength = 0.8 + event.hotspotStrength * 1.2;
  switch (event.microBehavior) {
    case 'trailEcho':
      context.lineWidth = 0.4;
      context.beginPath();
      context.moveTo(event.x - 2, event.y - 2);
      context.lineTo(event.x + 2, event.y + 2);
      context.stroke();
      break;
    case 'emberUpdraft':
      context.fillStyle = event.color;
      context.globalAlpha *= 0.35;
      context.fillRect(event.x - 1, event.y - 4 - strength * 4, 2, 6 + strength * 4);
      break;
    case 'latticePin':
      const span = 3 + strength * 1.5;
      context.lineWidth = 0.6;
      context.beginPath();
      context.moveTo(event.x - span, event.y);
      context.lineTo(event.x + span, event.y);
      context.moveTo(event.x, event.y - span);
      context.lineTo(event.x, event.y + span);
      context.stroke();
      break;
    case 'perihelionFlare':
      const angle = event.angle ?? 0;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(event.x, event.y, 3 + strength, angle - 0.3, angle + 0.3);
      context.stroke();
      break;
    case 'clusterCascade':
      const size = 1 + strength * 0.8;
      for (let i = 0; i < 3; i += 1) {
        context.fillRect(event.x + i * 0.8, event.y - i * 0.6, size, size);
      }
      break;
    case 'spectrumBreath':
      const breath = Math.sin(event.progress * Math.PI) * 4;
      context.lineWidth = 0.8;
      context.strokeStyle = `rgba(255,${Math.round(180 + breath * 15)},${Math.round(200 - breath * 40)},${0.4 + strength * 0.1})`;
      context.beginPath();
      context.arc(event.x, event.y, 3 + breath, 0, Math.PI * 2);
      context.stroke();
      break;
    default:
      break;
  }
};

export const Starfield = ({
  variant,
  density,
  hoverGain = 1.15,
  interactionLevel = 0,
  depthCurve,
  containerRef,
  className,
  reduceMotionOverride,
  transitionDurationMs = LAYER_TRANSITION_MS,
  hotspot,
  microEventFrequency
}: StarfieldProps) => {
  const selectedVariant = variant ?? DEFAULT_STARFIELD_VARIANT;
  const prefersReducedMotionHook = usePrefersReducedMotion();
  const dataSaverPreference = usePrefersDataSaver();
  const coarsePointer = usePrefersCoarsePointer();
  const staticConserveMode = dataSaverPreference && coarsePointer;
  const conserveMode = dataSaverPreference || coarsePointer;
  const motionOverride = reduceMotionOverride ?? prefersReducedMotionHook;
  const prefersReducedMotion = motionOverride || staticConserveMode;
  const starfieldMode: StarfieldMode = staticConserveMode
    ? 'static'
    : conserveMode
    ? 'conserve'
    : 'normal';
  const baseDensity = density ?? STARFIELD_VARIANTS[selectedVariant].density;
  const baseMicroFrequency = microEventFrequency ?? 0.002;
  const densityMultiplier = starfieldMode === 'static' ? 0.45 : starfieldMode === 'conserve' ? 0.6 : 1;
  const hoverMultiplier = starfieldMode === 'static' ? 1 : starfieldMode === 'conserve' ? 0.65 : 1;
  const microMultiplier = starfieldMode === 'static' ? 0 : starfieldMode === 'conserve' ? 0.05 : 1;
  const conservatoryDensity = Math.max(40, Math.round(baseDensity * densityMultiplier));
  const conservatoryHoverGain = Math.max(1, hoverGain * hoverMultiplier);
  const conservatoryMicroFreq = microMultiplier === 0 ? 0 : Math.max(0, baseMicroFrequency * microMultiplier);
  const pointerRef = useRef<PointerState>({ x: 0.5, y: 0.5, active: false });
  const layersRef = useRef(0);
  const [layers, setLayers] = useState<LayerState[]>([
    { id: layersRef.current++, variant: selectedVariant, active: true }
  ]);

  useEffect(() => {
    setLayers((prev) => {
      const current = prev[prev.length - 1];
      if (current?.variant === selectedVariant) {
        return prev;
      }
      return prev.map((layer) => ({ ...layer, active: false })).concat({
        id: layersRef.current++,
        variant: selectedVariant,
        active: true
      });
    });
  }, [selectedVariant]);

  useEffect(() => {
    if (layers.every((layer) => layer.active)) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setLayers((current) => current.filter((layer) => layer.active));
    }, transitionDurationMs);
    return () => window.clearTimeout(timer);
  }, [layers, transitionDurationMs]);

  useEffect(() => {
    const host = containerRef?.current;
    if (!host) {
      return undefined;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      pointerRef.current.active = true;
      pointerRef.current.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      pointerRef.current.y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    };
    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };
    const handleFocusIn = () => {
      pointerRef.current.active = true;
    };
    const handleFocusOut = () => {
      pointerRef.current.active = false;
    };
    host.addEventListener('pointermove', handlePointerMove);
    host.addEventListener('pointerenter', handlePointerMove);
    host.addEventListener('pointerleave', handlePointerLeave);
    host.addEventListener('focusin', handleFocusIn);
    host.addEventListener('focusout', handleFocusOut);
    return () => {
      host.removeEventListener('pointermove', handlePointerMove);
      host.removeEventListener('pointerenter', handlePointerMove);
      host.removeEventListener('pointerleave', handlePointerLeave);
      host.removeEventListener('focusin', handleFocusIn);
      host.removeEventListener('focusout', handleFocusOut);
    };
  }, [containerRef]);

  const hostRef = containerRef;

  return (
    <>
      {layers.map((layer) => (
        <StarfieldLayer
          key={layer.id}
          variant={layer.variant}
          config={STARFIELD_VARIANTS[layer.variant]}
          interactionLevel={interactionLevel}
          hoverGain={conservatoryHoverGain}
          depthCurve={depthCurve}
          densityOverride={conservatoryDensity}
          pointerRef={pointerRef}
          hostRef={hostRef}
          prefersReducedMotion={prefersReducedMotion}
          isActive={layer.active}
          transitionMs={transitionDurationMs}
          hotspot={hotspot}
          microEventFrequency={conservatoryMicroFreq}
          mode={starfieldMode}
          className={className}
        />
      ))}
    </>
  );
};
