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
  // Pre-computed values for optimization
  sinDrift: number;
  cosDrift: number;
  lastX: number;
  lastY: number;
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

type GalaxyMode = 'none' | 'nebula' | 'spiral' | 'flare';
const GALAXY_MODES: GalaxyMode[] = ['none', 'nebula', 'spiral', 'flare'];

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const wrapUnit = (value: number): number => ((value % 1) + 1) % 1;
const randomBetween = (range: [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);

// Pre-compute sin/cos lookup tables for common angles to avoid repeated trig calculations
const SIN_TABLE_SIZE = 360;
const sinLookup = new Float32Array(SIN_TABLE_SIZE);
const cosLookup = new Float32Array(SIN_TABLE_SIZE);
for (let i = 0; i < SIN_TABLE_SIZE; i++) {
  const angle = (i / SIN_TABLE_SIZE) * Math.PI * 2;
  sinLookup[i] = Math.sin(angle);
  cosLookup[i] = Math.cos(angle);
}

const fastSin = (angle: number): number => {
  const normalized = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  const index = Math.floor(normalized * SIN_TABLE_SIZE) % SIN_TABLE_SIZE;
  return sinLookup[index];
};

const fastCos = (angle: number): number => {
  const normalized = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  const index = Math.floor(normalized * SIN_TABLE_SIZE) % SIN_TABLE_SIZE;
  return cosLookup[index];
};

const buildStars = (count: number, config: StarfieldVariantDefinition, palette: string[]): Star[] => {
  return Array.from({ length: count }, () => {
    const driftDirection = Math.random() * Math.PI * 2;
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
      driftDirection,
      shape: ['pixel', 'line', 'flare', 'ring'][Math.floor(Math.random() * 4)] as StarShape,
      orbitRadius: undefined,
      orbitPhase: Math.random() * Math.PI * 2,
      orbitSpeed: 0.8 + Math.random() * 0.6,
      // Pre-compute trig values
      sinDrift: fastSin(driftDirection),
      cosDrift: fastCos(driftDirection),
      lastX: 0,
      lastY: 0
    };

    star.lastX = star.baseX;
    star.lastY = star.baseY;

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
  galaxyMode: GalaxyMode;
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
    mode,
    galaxyMode
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
    const context = canvas.getContext('2d', {
      // Enable performance optimizations
      alpha: true,
      desynchronized: true, // Allow async rendering
      willReadFrequently: false
    });
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
    let galaxyTick = 0;

    // Batch rendering optimization: group stars by color to reduce state changes
    const starsByColor = new Map<string, Star[]>();
    stars.forEach(star => {
      const colorGroup = starsByColor.get(star.color) || [];
      colorGroup.push(star);
      starsByColor.set(star.color, colorGroup);
    });

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
      // Clear once for entire frame
      context.clearRect(0, 0, displayWidth, displayHeight);

      galaxyTick += delta;

      const targetIntensity = Math.max(interactionRef.current, pointerPresenceRef.current);
      const lerpFactor = clamp(delta / 900, 0, 1);
      smoothedIntensity = interpolate(smoothedIntensity, targetIntensity, lerpFactor);
      const intensity = smoothedIntensity;
      const brightnessScalar = interpolate(IDLE_BRIGHTNESS, hoverGain, intensity);
      const speedScalar = interpolate(IDLE_SPEED_MULTIPLIER, ACTIVE_SPEED_MULTIPLIER, intensity);

      // Pre-calculate common values once per frame
      const deltaSpeed = delta * speedScalar / 8000;
      const deltaPhase = delta / 180;

      // Update star positions (optimized loop)
      if (!prefersReducedMotion) {
        for (let i = 0; i < stars.length; i++) {
          const star = stars[i];
          star.baseY = wrapUnit(star.baseY - deltaSpeed * star.speed);
          star.phase += deltaPhase * star.speed;
        }
      }

      // Batch rendering by color to minimize context state changes
      context.lineCap = 'round';

      if (galaxyMode !== 'none') {
        renderGalaxyLayer(context, {
          mode: galaxyMode,
          width: displayWidth,
          height: displayHeight,
          intensity,
          tick: galaxyTick,
          palette
        });
      }

      starsByColor.forEach((colorStars, color) => {
        // Set color once for entire batch
        context.fillStyle = color;
        context.strokeStyle = color;

        for (let i = 0; i < colorStars.length; i++) {
          const star = colorStars[i];
          const depthValue = clamp(resolvedDepth(star.depth), 0, 1);

          // Use pre-computed sin/cos with fast lookup
          const phaseOffset = star.phase;
          const driftRadius = star.driftAmplitude * depthValue;
          const driftX = fastCos(star.driftDirection + phaseOffset) * driftRadius;
          const driftY = fastSin(star.driftDirection + phaseOffset * 0.8) * driftRadius * 0.5;

          const rawX = wrapUnit(star.baseX + driftX) * displayWidth;
          const rawY = wrapUnit(star.baseY + driftY) * displayHeight;

          // Snap to pixel grid once
          const x = Math.round(rawX * pixelRatio) / pixelRatio;
          const y = Math.round(rawY * pixelRatio) / pixelRatio;

          // Set opacity for this star
          context.globalAlpha = clamp(star.opacity * brightnessScalar, 0.02, 0.75);

          // Simplified rendering: just draw trail line and point
          // Skip individual save/restore calls
          context.lineWidth = Math.max(0.5, star.size);
          context.beginPath();
          context.moveTo(star.lastX, star.lastY);
          context.lineTo(x, y);
          context.stroke();
          context.fillRect(x, y, Math.max(1, star.size), Math.max(1, star.size));

          star.lastX = x;
          star.lastY = y;
        }
      });

      // Reset global alpha after batch rendering
      context.globalAlpha = 1;

      // Render micro events with reduced frequency
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
  }, [variant, config, densityOverride, depthCurve, hoverGain, prefersReducedMotion, hostRef, microEventFrequency, galaxyMode]);

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

  // Batch micro events by behavior type to reduce state changes
  events.forEach((event) => {
    event.progress += delta / event.duration;
    if (event.progress >= 1) {
      return;
    }

    const alpha = 0.35 * (1 - event.progress);
    context.globalAlpha = alpha;
    context.strokeStyle = event.color;
    context.fillStyle = event.color;

    const radius = 1 + 2 * (1 - event.progress);
    context.beginPath();
    context.arc(event.x, event.y, radius, 0, Math.PI * 2);
    context.fill();

    renderMicroBehavior(context, event);
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

type GalaxyLayerOptions = {
  mode: GalaxyMode;
  width: number;
  height: number;
  intensity: number;
  tick: number;
  palette: string[];
};

const renderGalaxyLayer = (context: CanvasRenderingContext2D, options: GalaxyLayerOptions) => {
  const { mode, width, height, intensity, tick, palette } = options;
  if (mode === 'none') {
    return;
  }
  context.save();
  const minDimension = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const baseAlpha = clamp(0.18 + intensity * 0.25, 0.05, 0.45);
  const hoverTint = clamp(intensity, 0, 1);
  const purplePulse = 0.25 + hoverTint * 0.45;
  const magentaPulse = 0.15 + hoverTint * 0.3;
  const blurRadius = mode === 'flare' ? 6 + hoverTint * 5 : 14 + hoverTint * 14;
  context.filter = `blur(${blurRadius}px)`;

  if (mode === 'nebula') {
    const blobs = 4;
    const maxRadius = Math.max(width, height) * 0.58;
    for (let i = 0; i < blobs; i++) {
      const angle = (tick * 0.00018 + i * (Math.PI / 2.1)) % (Math.PI * 2);
      const radius = maxRadius * (0.7 - i * 0.12);
      const blobX = centerX + Math.cos(angle) * maxRadius * 0.35;
      const blobY = centerY + Math.sin(angle) * maxRadius * 0.28;
      const gradient = context.createRadialGradient(blobX, blobY, 0, blobX, blobY, radius);
      gradient.addColorStop(0, `rgba(168,85,247,${purplePulse})`);
      gradient.addColorStop(0.35, `rgba(79,70,229,${0.28 + 0.25 * hoverTint})`);
      gradient.addColorStop(0.6, `rgba(236,72,153,${magentaPulse})`);
      gradient.addColorStop(0.82, `rgba(14,165,233,${0.12 + 0.14 * hoverTint})`);
      gradient.addColorStop(1, 'rgba(15,23,42,0)');
      context.globalAlpha = baseAlpha;
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(blobX, blobY, radius, 0, Math.PI * 2);
      context.fill();
    }
  } else if (mode === 'spiral') {
    const arms = 2;
    const steps = 140;
    const spiralRadius = minDimension * 0.48;
    for (let arm = 0; arm < arms; arm++) {
      for (let i = 0; i < steps; i++) {
        const ratio = i / steps;
        const angle = ratio * 6 + tick * 0.0004 + arm * Math.PI;
        const radius = spiralRadius * ratio;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius * 0.6;
        context.globalAlpha = baseAlpha * (0.4 + ratio * 0.6);
        const accentThreshold = ratio > 0.55 ? `rgba(168,85,247,${0.18 + hoverTint * 0.5 * ratio})` : undefined;
        context.fillStyle = accentThreshold ?? palette[(arm + i) % palette.length] ?? 'rgba(255,255,255,0.2)';
        context.fillRect(x, y, 2 + ratio * 2, 2 + ratio * 2);
      }
    }
    const glowRadius = spiralRadius * (0.65 + hoverTint * 0.2);
    const glowGradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
    glowGradient.addColorStop(0, `rgba(168,85,247,${purplePulse})`);
    glowGradient.addColorStop(0.7, `rgba(236,72,153,${magentaPulse})`);
    glowGradient.addColorStop(1, 'rgba(15,23,42,0)');
    context.globalAlpha = baseAlpha * 0.8;
    context.fillStyle = glowGradient;
    context.beginPath();
    context.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    context.fill();
  } else if (mode === 'flare') {
    const flareAlpha = clamp(baseAlpha * 1.2, 0.05, 0.5);
    context.globalAlpha = flareAlpha;
    context.strokeStyle = 'rgba(255,255,255,0.6)';
    context.lineWidth = 1.5;
    const spokes = 6;
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI + tick * 0.0003;
      const radius = minDimension * (0.35 + 0.05 * Math.sin(tick * 0.001 + i));
      context.beginPath();
      context.moveTo(centerX - Math.cos(angle) * radius * 0.15, centerY - Math.sin(angle) * radius * 0.15);
      context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      context.stroke();
    }
    context.globalAlpha = flareAlpha * 0.8;
    const haloGradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, minDimension * 0.45);
    haloGradient.addColorStop(0, `rgba(168,85,247,${purplePulse})`);
    haloGradient.addColorStop(0.8, 'rgba(15,23,42,0)');
    context.fillStyle = haloGradient;
    context.beginPath();
    context.arc(centerX, centerY, minDimension * 0.45, 0, Math.PI * 2);
    context.fill();
  }

  context.filter = 'none';
  context.restore();
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
  const [galaxyMode, setGalaxyMode] = useState<GalaxyMode>(() => {
    if (typeof window === 'undefined') {
      return 'none';
    }
    const stored = window.localStorage.getItem('starfield.galaxyMode');
    return (stored as GalaxyMode) ?? 'none';
  });

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
    if (typeof window === 'undefined') {
      return undefined;
    }
    window.localStorage.setItem('starfield.galaxyMode', galaxyMode);
  }, [galaxyMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (!event.shiftKey || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      if (event.key.toLowerCase() !== 'g') {
        return;
      }
      event.preventDefault();
      setGalaxyMode((prev) => {
        const index = GALAXY_MODES.indexOf(prev);
        const next = GALAXY_MODES[(index + 1) % GALAXY_MODES.length];
        // eslint-disable-next-line no-console
        console.info('Starfield galaxy mode:', next);
        return next;
      });
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return undefined;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    const globalWindow = window as typeof window & {
      __starfieldSamplerScheduled?: boolean;
    };
    if (globalWindow.__starfieldSamplerScheduled) {
      return undefined;
    }
    globalWindow.__starfieldSamplerScheduled = true;

    const samples: number[] = [];
    let slowFrames = 0;
    let last = performance.now();
    const duration = 6000;
    let finished = false;
    let rafId: number | null = null;

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      samples.sort((a, b) => a - b);
      const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length || 0;
      const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
      const snapshot = {
        samples: samples.length,
        avgFrameMs: Number(avg.toFixed(2)),
        fpsAvg: Number((1000 / avg || 0).toFixed(1)),
        p95FrameMs: Number(p95.toFixed(2)),
        slowFrames,
      };
      // eslint-disable-next-line no-console
      console.log('STARFIELD_FPS_SNAPSHOT', snapshot);
      globalWindow.__starfieldSamplerScheduled = false;
    };

    const start = last;
    const loop = (now: number) => {
      const delta = now - last;
      samples.push(delta);
      if (delta > 16.7) {
        slowFrames++;
      }
      last = now;
      if (now - start >= duration) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    const timeout = window.setTimeout(finish, duration + 200);

    return () => {
      if (!finished) {
        finish();
      }
      window.clearTimeout(timeout);
    };
  }, []);

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
          galaxyMode={galaxyMode}
        />
      ))}
    </>
  );
};
