import { ConstellationNetworkEffect } from '../ConstellationNetworkEffect';
import { FloatingParticlesEffect } from '../FloatingParticlesEffect';
import { FlowFieldEffect } from '../FlowFieldEffect';
import { GridRippleEffect } from '../GridRippleEffect';
import { ScanlineGlitchEffect } from '../ScanlineGlitchEffect';
import type { EffectDefinition } from '../types';

export const pixelEffects: EffectDefinition[] = [
  {
    id: 'floating-particles',
    name: 'Floating Particles',
    tags: ['pixel'],
    description: 'Sparse field of gently drifting particles that react to cursor movement.',
    factory: () => new FloatingParticlesEffect()
  },
  {
    id: 'grid-ripple',
    name: 'Grid Ripple',
    tags: ['pixel'],
    description: 'Low-res dot grid with mouse-triggered ripple physics.',
    factory: () => new GridRippleEffect()
  },
  {
    id: 'flow-field',
    name: 'Organic Flow Field',
    tags: ['pixel'],
    description: 'Noise-driven flow lines that form painterly trails responding to pointer swirls.',
    factory: () => new FlowFieldEffect()
  },
  {
    id: 'scanline-glitch',
    name: 'Scanline Glitch',
    tags: ['pixel'],
    description: 'Retro CRT scanlines with localized glitch bursts.',
    factory: () => new ScanlineGlitchEffect()
  },
  {
    id: 'constellation-network',
    name: 'Constellation Network',
    tags: ['pixel'],
    description: 'Twinkling star nodes connected by proximity lines with cursor attraction.',
    factory: () => new ConstellationNetworkEffect()
  }
];
