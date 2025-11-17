import type { EffectDefinition } from './types';

import { pixelEffects } from './sets/pixelEffects';
import { matrixEffects } from './sets/matrixEffects';
import { securityEffects } from './sets/securityEffects';

export const effectRegistry: EffectDefinition[] = [
  ...pixelEffects,
  ...matrixEffects,
  ...securityEffects
];

export const getEffectById = (id: string): EffectDefinition | undefined =>
  effectRegistry.find((effect) => effect.id === id);
