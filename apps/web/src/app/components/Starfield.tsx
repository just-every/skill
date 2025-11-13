import React, { useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { usePrefersCoarsePointer } from '../../lib/usePrefersCoarsePointer';
import { usePrefersDataSaver } from '../../lib/usePrefersDataSaver';

export type StarfieldVariant = 'quietPulse';

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
  readonly microBehavior: string;
  readonly microColorToken: string;
  readonly depthCurve?: (depth: number) => number;
};

const resolveColorValue = (value: string): string => {
  if (typeof window === 'undefined' || !value.startsWith('--')) {
    return value;
  }
  const computed = getComputedStyle(document.documentElement).getPropertyValue(value).trim();
  return computed || value;
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
    microBehavior: 'trailEcho',
    microColorToken: '--starfield-quiet-micro',
    depthCurve: (depth) => 0.5 + depth * 0.6
  }
} as const;
export const DEFAULT_STARFIELD_VARIANT: StarfieldVariant = 'quietPulse';
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
const buildStars = (count: number, config: StarfieldVariantDefinition, palette: string[]): Star[] => {
  return Array.from({ length: count }, () => {
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
      orbitRadius: undefined,
      orbitPhase: Math.random() * Math.PI * 2,
      orbitSpeed: 0.8 + Math.random() * 0.6,
      meta: {}
    };

    star.meta.last = { x: star.baseX, y: star.baseY };

    return star;
  });
};

const LAYER_TRANSITION_MS = 360;
const IDLE_BRIGHTNESS = 0.92;
const IDLE_SPEED_MULTIPLIER = 0.45;
const ACTIVE_SPEED_MULTIPLIER = 0.72;
const interpolate = (start: number, end: number, factor: number): number => start + (end - start) * clamp(factor, 0, 1);

type StarfieldLayerProps = {
  variant: StarfieldVariant;
  config: StarfieldVariantDefinition;
  interactionLevel: number;
  hoverGain: number;
  depthCurve?: (depth: number) => number;
  densityOverride?: number;
  hostRef?: React.RefObject<HTMLElement | null>;
  prefersReducedMotion: boolean;
  isActive: boolean;
  transitionMs: number;
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
    hostRef,
    prefersReducedMotion,
    isActive,
    transitionMs,
    microEventFrequency,
    className,
    mode
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef(interactionLevel);
  const depthCurveRef = useRef(depthCurve);
  const microEventsRef = useRef<MicroEvent[]>([]);
  const pointerPresenceRef = useRef(0);
  const microEventFreq = microEventFrequency ?? 0.002;

  useEffect(() => {
    interactionRef.current = interactionLevel;
  }, [interactionLevel]);

  useEffect(() => {
    depthCurveRef.current = depthCurve;
  }, [depthCurve]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const host = hostRef?.current;
    if (!host) {
      return undefined;
    }

    let touchReleaseTimer: number | null = null;
    const activate = () => {
      pointerPresenceRef.current = 1;
    };
    const deactivate = () => {
      pointerPresenceRef.current = 0;
    };

    const handlePointerEnter = () => activate();
    const handlePointerLeave = () => deactivate();
    const handlePointerDown = () => activate();
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        if (touchReleaseTimer) {
          window.clearTimeout(touchReleaseTimer);
        }
        touchReleaseTimer = window.setTimeout(() => {
          pointerPresenceRef.current = 0;
        }, 800);
      }
    };
    const handleFocusIn = () => activate();
    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (!nextTarget || !host.contains(nextTarget)) {
        deactivate();
      }
    };

    host.addEventListener('pointerenter', handlePointerEnter);
    host.addEventListener('pointerleave', handlePointerLeave);
    host.addEventListener('pointerdown', handlePointerDown);
    host.addEventListener('pointerup', handlePointerUp);
    host.addEventListener('focusin', handleFocusIn);
    host.addEventListener('focusout', handleFocusOut);

    return () => {
      host.removeEventListener('pointerenter', handlePointerEnter);
      host.removeEventListener('pointerleave', handlePointerLeave);
      host.removeEventListener('pointerdown', handlePointerDown);
      host.removeEventListener('pointerup', handlePointerUp);
      host.removeEventListener('focusin', handleFocusIn);
      host.removeEventListener('focusout', handleFocusOut);
      if (touchReleaseTimer) {
        window.clearTimeout(touchReleaseTimer);
      }
    };
  }, [hostRef]);

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
    const microEventColor = resolveColorValue(config.microColorToken ?? '#ffffff');
    const stars = buildStars(resolvedDensity, config, palette);
    const resolvedDepth = depthCurveRef.current ?? ((value: number) => value);
    let displayWidth = Math.max(120, host.clientWidth);
    let displayHeight = Math.max(120, host.clientHeight);
    let pixelRatio = window.devicePixelRatio || 1;
    let frameId: number | null = null;
    let latestTime = performance.now();
    let smoothedIntensity = interactionRef.current;
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
      const targetIntensity = Math.max(interactionRef.current, pointerPresenceRef.current);
      const lerpFactor = clamp(delta / 900, 0, 1);
      smoothedIntensity = interpolate(smoothedIntensity, targetIntensity, lerpFactor);
      const intensity = smoothedIntensity;
      const brightnessScalar = interpolate(IDLE_BRIGHTNESS, hoverGain, intensity);
      const speedScalar = interpolate(IDLE_SPEED_MULTIPLIER, ACTIVE_SPEED_MULTIPLIER, intensity);

      stars.forEach((star, index) => {
        if (!prefersReducedMotion) {
          star.baseY = wrapUnit(star.baseY - (delta * star.speed * speedScalar) / 8000);
          star.phase += (delta * star.speed) / 180;
        }
        const depthValue = clamp(resolvedDepth(star.depth), 0, 1);
        const driftRadius = star.driftAmplitude * depthValue;
        const driftX = Math.cos(star.driftDirection + star.phase) * driftRadius;
        const driftY = Math.sin(star.driftDirection + star.phase * 0.8) * driftRadius * 0.5;
        const orbitX = star.orbitRadius
          ? Math.cos(star.phase * (star.orbitSpeed ?? 1) + (star.orbitPhase ?? 0)) * star.orbitRadius
          : 0;
        const orbitY = star.orbitRadius
          ? Math.sin(star.phase * (star.orbitSpeed ?? 1) + (star.orbitPhase ?? 0)) * star.orbitRadius
          : 0;

        const rawX = wrapUnit(star.baseX + driftX + orbitX) * displayWidth;
        const rawY = wrapUnit(star.baseY + driftY + orbitY) * displayHeight;
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
          hoverScalar: brightnessScalar,
          index,
          displayWidth,
          displayHeight,
        });
      });

      if (!prefersReducedMotion) {
        const chance = microEventFreq * delta * (0.7 + intensity * 0.8);
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
              microEventColor,
              config.microBehavior,
              intensity
            )
          );
        }
        renderMicroEvents(context, microEventsRef.current, delta);
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
  }, [variant, config, densityOverride, depthCurve, hoverGain, prefersReducedMotion, hostRef, microEventFrequency]);

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
  index: number;
  displayWidth: number;
  displayHeight: number;
};

type MicroEvent = {
  x: number;
  y: number;
  type: 'twinkle';
  progress: number;
  duration: number;
  color: string;
  variant: StarfieldVariant;
  angle?: number;
  length?: number;
  microBehavior: string;
  energy: number;
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
    index,
    displayWidth,
    displayHeight
  } = params;
  context.save();
  context.lineCap = 'round';
  context.fillStyle = star.color;
  context.strokeStyle = star.color;

  context.globalAlpha = clamp(star.opacity * hoverScalar, 0.02, 0.75);
  const trail = star.meta.last;
  context.lineWidth = Math.max(0.5, star.size);
  context.beginPath();
  context.moveTo(trail?.x ?? x, trail?.y ?? y);
  context.lineTo(x, y);
  context.stroke();
  context.fillRect(x, y, Math.max(1, star.size), Math.max(1, star.size));
  star.meta.last = { x, y };

  context.restore();
};

const spawnMicroEvent = (
  variant: StarfieldVariant,
  displayWidth: number,
  displayHeight: number,
  color: string,
  microBehavior: string,
  energy: number
): MicroEvent => {
  const type: MicroEvent['type'] = 'twinkle';
  const angle = Math.random() * Math.PI * 2;
  const length = 6 + Math.random() * 12;
  const baseX = Math.random() * displayWidth;
  const baseY = Math.random() * displayHeight;
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
    energy,
  };
};

const renderMicroEvents = (
  context: CanvasRenderingContext2D,
  events: MicroEvent[],
  delta: number
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
    const radius = 1 + 2 * (1 - event.progress);
    context.beginPath();
    context.arc(event.x, event.y, radius, 0, Math.PI * 2);
    context.fill();
    renderMicroBehavior(context, event);
    context.restore();
    remaining.push(event);
  });
  events.length = 0;
  events.push(...remaining);
};

const renderMicroBehavior = (context: CanvasRenderingContext2D, event: MicroEvent) => {
  const energy = clamp(event.energy, 0, 1);
  const strength = 0.8 + energy * 1.2;
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
          hostRef={hostRef}
          prefersReducedMotion={prefersReducedMotion}
          isActive={layer.active}
          transitionMs={transitionDurationMs}
          microEventFrequency={conservatoryMicroFreq}
          mode={starfieldMode}
          className={className}
        />
      ))}
    </>
  );
};
