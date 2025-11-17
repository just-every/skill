export type EffectPointerType = 'move' | 'down' | 'up' | 'enter' | 'leave';

export type EffectPointerEvent = {
  readonly type: EffectPointerType;
  readonly x: number;
  readonly y: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
};

export type EffectSize = {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
};

export type EffectInitContext = EffectSize & {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
};

export interface VisualEffect {
  init(context: EffectInitContext): void;
  render(deltaMs: number, totalMs: number): void;
  handlePointer?(event: EffectPointerEvent): void;
  resize?(size: EffectSize): void;
  dispose(): void;
}

export type EffectFactory = () => VisualEffect;

export type EffectDefinition = {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly description: string;
  readonly factory: EffectFactory;
};
