import React, { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

type Color = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

type PixelBlastBackdropProps = {
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly color?: string;
  readonly highlightColor?: string;
  readonly pixelSize?: number;
  readonly rippleColor?: string;
  readonly speed?: number;
};

const parseColor = (value: string | undefined): Color => {
  const raw = (value ?? '').trim();
  if (!raw) {
    return { r: 255, g: 255, b: 255 };
  }
  if (raw.startsWith('#')) {
    const normalized = raw.slice(1);
    if (normalized.length === 3) {
      const r = parseInt(normalized[0] + normalized[0], 16);
      const g = parseInt(normalized[1] + normalized[1], 16);
      const b = parseInt(normalized[2] + normalized[2], 16);
      return { r, g, b };
    }
    if (normalized.length === 6) {
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      return { r, g, b };
    }
  }
  const numeric = raw.match(/\d+/g);
  if (numeric && numeric.length >= 3) {
    const [r, g, b] = numeric.map((value) => Math.min(255, Math.max(0, Number(value))));
    return { r, g, b };
  }
  return { r: 255, g: 255, b: 255 };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const PixelBlastBackdrop: React.FC<PixelBlastBackdropProps> = ({
  className = '',
  style,
  color = '#B19EEF',
  highlightColor = '#FFFFFF',
  pixelSize = 6,
  rippleColor,
  speed = 0.5
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const ripplesRef = useRef<Array<{ x: number; y: number; created: number; duration: number; maxRadius: number }>>([]);
  const parsedColor = parseColor(color);
  const parsedHighlight = parseColor(highlightColor);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    let layout = { width: container.clientWidth || 0, height: container.clientHeight || 0 };

    const updateSize = () => {
      const width = container.clientWidth || 0;
      const height = container.clientHeight || 0;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      layout = { width, height };
    };

    const resizeObserver = new ResizeObserver(updateSize);
    updateSize();
    resizeObserver.observe(container);

    const rippleDuration = 1_400;
    const drawRipples = (timestamp: number) => {
      const tint = rippleColor ? parseColor(rippleColor) : parsedHighlight;
      ripplesRef.current = ripplesRef.current.filter((ripple) => timestamp - ripple.created < ripple.duration);
      ripplesRef.current.forEach((ripple) => {
        const age = timestamp - ripple.created;
        const progress = clamp(age / ripple.duration, 0, 1);
        const radius = ripple.maxRadius * progress;
        const alpha = (1 - progress) * 0.6;
        ctx.strokeStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      });
    };

    const drawFrame = (timestamp: number) => {
      const { width, height } = layout;
      if (!width || !height) {
        frameRef.current = requestAnimationFrame(drawFrame);
        return;
      }
      const flicker = (Math.sin(timestamp * 0.002 * speed) + 1) / 2;
      const brightness = 0.7 + flicker * 0.3;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#040509';
      ctx.fillRect(0, 0, width, height);
      const cell = Math.max(2, pixelSize);
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          const noise = 0.8 + (Math.random() - 0.5) * 0.3;
          const r = clamp(Math.round(parsedColor.r * brightness * noise), 0, 255);
          const g = clamp(Math.round(parsedColor.g * brightness * noise), 0, 255);
          const b = clamp(Math.round(parsedColor.b * brightness * noise), 0, 255);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
      ctx.fillStyle = `rgba(6, 8, 16, ${0.2 + 0.15 * flicker})`;
      ctx.fillRect(0, 0, width, height);
      drawRipples(timestamp);
      frameRef.current = requestAnimationFrame(drawFrame);
    };
    frameRef.current = requestAnimationFrame(drawFrame);

    const trackPointer = (event: PointerEvent) => {
      if (!layout.width || !layout.height) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * layout.width;
      const y = ((event.clientY - rect.top) / rect.height) * layout.height;
      ripplesRef.current.push({
        x,
        y,
        created: performance.now(),
        duration: rippleDuration,
        maxRadius: Math.max(layout.width, layout.height) * 1.2
      });
    };

    canvas.addEventListener('pointerdown', trackPointer, { passive: true });
    canvas.addEventListener('pointermove', trackPointer, { passive: true });

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      canvas.removeEventListener('pointerdown', trackPointer);
      canvas.removeEventListener('pointermove', trackPointer);
      resizeObserver.disconnect();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [color, highlightColor, pixelSize, rippleColor, speed]);

  const baseStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    }),
    []
  );
  const mergedStyle = useMemo(
    () => ({
      ...baseStyle,
      ...style
    }),
    [baseStyle, style]
  );

  const classNames = [className].filter(Boolean).join(' ');
  return <div ref={containerRef} className={classNames} style={mergedStyle} aria-hidden="true" />;
};

export default PixelBlastBackdrop;
