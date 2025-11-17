import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { effectRegistry, getEffectById } from './effects/registry';
import type {
  EffectDefinition,
  EffectInitContext,
  EffectPointerEvent,
  EffectPointerType,
  EffectSize,
  VisualEffect
} from './effects/types';

type KeyCombo = {
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly code: string;
};

const DEFAULT_COMBO: KeyCombo = {
  ctrl: true,
  shift: true,
  code: 'KeyP'
};

const clampPixelRatio = (value: number): number => {
  if (Number.isNaN(value) || value <= 0) {
    return 1;
  }
  return Math.min(Math.max(value, 1), 1.75);
};

export type EffectManagerProps = {
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly fillMode?: 'absolute' | 'relative';
  readonly initialEffectId?: string;
  readonly autoPauseOffscreen?: boolean;
  readonly keyCombo?: KeyCombo;
  readonly enablePointerTracking?: boolean;
  readonly onEffectChange?: (effect: EffectDefinition) => void;
};

const matchesCombo = (event: KeyboardEvent, combo: KeyCombo): boolean => {
  if (combo.ctrl && !event.ctrlKey) {
    return false;
  }
  if (!combo.ctrl && event.ctrlKey) {
    return false;
  }
  if (combo.shift && !event.shiftKey) {
    return false;
  }
  if (!combo.shift && event.shiftKey) {
    return false;
  }
  if (combo.alt && !event.altKey) {
    return false;
  }
  if (!combo.alt && event.altKey) {
    return false;
  }
  return event.code === combo.code;
};

const EffectManager: React.FC<EffectManagerProps> = ({
  className,
  style,
  fillMode = 'relative',
  initialEffectId,
  autoPauseOffscreen = true,
  keyCombo = DEFAULT_COMBO,
  enablePointerTracking = true,
  onEffectChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const effectRef = useRef<VisualEffect | null>(null);
  const sizeRef = useRef<EffectSize>({ width: 0, height: 0, pixelRatio: 1 });
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const isVisibleRef = useRef(true);
  const pointerInsideRef = useRef(false);

  const effectIds = useMemo(() => effectRegistry.map((effect) => effect.id), []);

  const resolveInitialEffect = useCallback(() => {
    if (initialEffectId) {
      const candidate = getEffectById(initialEffectId);
      if (candidate) {
        return candidate.id;
      }
    }
    return effectIds[0];
  }, [effectIds, initialEffectId]);

  const [activeEffectId, setActiveEffectId] = useState<string>(resolveInitialEffect);

  const cleanupEffect = useCallback(() => {
    effectRef.current?.dispose();
    effectRef.current = null;
  }, []);

  const setCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) {
      return;
    }
    const parent = canvas.parentElement;
    const width = parent?.clientWidth ?? canvas.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? canvas.clientHeight ?? window.innerHeight;
    const pixelRatio = clampPixelRatio(window.devicePixelRatio || 1);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const size: EffectSize = { width, height, pixelRatio };
    sizeRef.current = size;
    effectRef.current?.resize?.(size);
  }, []);

  const cycleEffect = useCallback(
    (direction: 1 | -1 = 1) => {
      setActiveEffectId((current) => {
        const index = effectIds.findIndex((id) => id === current);
        if (index === -1) {
          return effectIds[0];
        }
        const nextIndex = (index + direction + effectIds.length) % effectIds.length;
        return effectIds[nextIndex];
      });
    },
    [effectIds]
  );

  const attachPointerHandlers = useCallback(() => {
    if (!enablePointerTracking || typeof window === 'undefined') {
      return undefined;
    }

    const createPayload = (event: PointerEvent): EffectPointerEvent | null => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) {
        return null;
      }
      return {
        type: 'move',
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        canvasWidth: rect.width,
        canvasHeight: rect.height
      };
    };

    const emit = (type: EffectPointerType, baseEvent: PointerEvent) => {
      const canvas = canvasRef.current;
      const effect = effectRef.current;
      if (!canvas || !effect || !effect.handlePointer) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const payload: EffectPointerEvent = {
        type,
        x: baseEvent.clientX - rect.left,
        y: baseEvent.clientY - rect.top,
        canvasWidth: rect.width,
        canvasHeight: rect.height
      };
      effect.handlePointer(payload);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const payload = createPayload(event);
      const effect = effectRef.current;
      if (!effect || !effect.handlePointer) {
        return;
      }
      if (payload) {
        if (!pointerInsideRef.current) {
          pointerInsideRef.current = true;
          effect.handlePointer({ ...payload, type: 'enter' });
        }
        effect.handlePointer({ ...payload, type: 'move' });
      } else if (pointerInsideRef.current) {
        pointerInsideRef.current = false;
        emit('leave', event);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!createPayload(event)) {
        return;
      }
      emit('down', event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerInsideRef.current) {
        return;
      }
      emit('up', event);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [enablePointerTracking]);

  const attachKeyboardHandler = useCallback(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handler = (event: KeyboardEvent) => {
      if (matchesCombo(event, keyCombo)) {
        event.preventDefault();
        cycleEffect(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cycleEffect, keyCombo]);

  useEffect(() => attachKeyboardHandler(), [attachKeyboardHandler]);
  useEffect(() => attachPointerHandlers(), [attachPointerHandlers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) {
      return undefined;
    }
    ctxRef.current = ctx;
    setCanvasSize();

    const resizeObserver = new ResizeObserver(() => setCanvasSize());
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    const handleWindowResize = () => setCanvasSize();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [setCanvasSize]);

  useEffect(() => {
    if (!autoPauseOffscreen || typeof IntersectionObserver === 'undefined') {
      isVisibleRef.current = true;
      return undefined;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      isVisibleRef.current = Boolean(entry?.isIntersecting);
    }, { threshold: 0.1 });
    observer.observe(canvas);
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState !== 'hidden';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [autoPauseOffscreen]);

  useEffect(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) {
      return undefined;
    }
    const definition = getEffectById(activeEffectId) ?? effectRegistry[0];
    if (!definition) {
      return undefined;
    }

    cleanupEffect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const effect = definition.factory();
    effectRef.current = effect;
    const initContext: EffectInitContext = {
      canvas,
      ctx,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      pixelRatio: sizeRef.current.pixelRatio
    };
    effect.init(initContext);
    effect.resize?.(sizeRef.current);
    pointerInsideRef.current = false;
    onEffectChange?.(definition);
    return () => {
      cleanupEffect();
    };
  }, [activeEffectId, cleanupEffect, onEffectChange]);

  useEffect(() => {
    let animationFrame: number;
    const step = (timestamp: number) => {
      const effect = effectRef.current;
      if (!effect) {
        animationFrame = requestAnimationFrame(step);
        return;
      }
      if (!isVisibleRef.current) {
        lastFrameRef.current = timestamp;
        animationFrame = requestAnimationFrame(step);
        return;
      }
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
        lastFrameRef.current = timestamp;
      }
      const delta = lastFrameRef.current !== null ? timestamp - lastFrameRef.current : 16;
      const total = startTimeRef.current !== null ? timestamp - startTimeRef.current : timestamp;
      lastFrameRef.current = timestamp;
      try {
        effect.render(delta, total);
      } catch (error) {
        console.error('Effect render failure', error);
      }
      animationFrame = requestAnimationFrame(step);
    };
    animationFrame = requestAnimationFrame(step);
    animationRef.current = animationFrame;
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      animationRef.current = null;
      lastFrameRef.current = null;
      startTimeRef.current = null;
    };
  }, []);

  useEffect(() => () => cleanupEffect(), [cleanupEffect]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: fillMode === 'absolute' ? 'absolute' : 'relative',
        inset: fillMode === 'absolute' ? 0 : undefined,
        width: '100%',
        height: '100%',
        ...style
      }}
      role="presentation"
      aria-hidden
      data-active-effect={activeEffectId}
    />
  );
};

export default EffectManager;
