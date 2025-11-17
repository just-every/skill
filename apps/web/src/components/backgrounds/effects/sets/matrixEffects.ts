import { ClassicMatrixRain } from '../ClassicMatrixRain';
import { DiagonalWindRain } from '../DiagonalWindRain';
import { ParallaxDepthRain } from '../ParallaxDepthRain';
import { RadialFountain } from '../RadialFountain';
import { SparseBitDrizzle } from '../SparseBitDrizzle';
import type { EffectDefinition } from '../types';

export const matrixEffects: EffectDefinition[] = [
  {
    id: 'matrix-classic',
    name: 'Classic Matrix Rain',
    tags: ['matrix'],
    description: 'Vertical glyph streams with bright headers and fading trails.',
    factory: () => new ClassicMatrixRain()
  },
  {
    id: 'matrix-diagonal-wind',
    name: 'Diagonal Wind Rain',
    tags: ['matrix'],
    description: 'Wind-blown diagonal glyph showers that respond to cursor turbulence.',
    factory: () => new DiagonalWindRain()
  },
  {
    id: 'matrix-radial-fountain',
    name: 'Radial Fountain',
    tags: ['matrix'],
    description: 'Radial fountain of glyphs bursting from the hero center or cursor.',
    factory: () => new RadialFountain()
  },
  {
    id: 'matrix-parallax-depth',
    name: 'Parallax Depth Rain',
    tags: ['matrix'],
    description: 'Multi-layer rain with parallax offsets tied to pointer position.',
    factory: () => new ParallaxDepthRain()
  },
  {
    id: 'matrix-sparse-drizzle',
    name: 'Sparse Bit Drizzle',
    tags: ['matrix'],
    description: 'Minimal binary drizzle with glitch bursts and rare clusters.',
    factory: () => new SparseBitDrizzle()
  }
];
