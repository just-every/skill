import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Parallax depth rain effect.
 * Multiple layers of vertical rain at different depths create a 3D parallax effect.
 * Mouse movement causes layers to shift based on depth, simulating perspective.
 */

interface DepthLayer {
  drops: Drop[];
  depth: number; // 0 (far) to 1 (near)
  speed: number;
  opacity: number;
  fontSize: number;
  color: string;
}

interface Drop {
  x: number;
  y: number;
  char: string;
  offset: number;
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ01';
const NUM_LAYERS = 4;
const DROPS_PER_LAYER = 80;
const BASE_FONT_SIZE = 10;
const PARALLAX_STRENGTH = 0.15;

export class ParallaxDepthRain implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private layers: DepthLayer[] = [];
  private mouseX = 0;
  private mouseY = 0;
  private targetOffsetX = 0;
  private targetOffsetY = 0;
  private currentOffsetX = 0;
  private currentOffsetY = 0;

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.mouseX = this.width / 2;
    this.mouseY = this.height / 2;

    // Create depth layers (far to near)
    this.layers = [];
    for (let i = 0; i < NUM_LAYERS; i++) {
      const depth = i / (NUM_LAYERS - 1); // 0 to 1
      const layer = this.createLayer(depth);
      this.layers.push(layer);
    }

    this.ctx.textBaseline = 'top';
  }

  private createLayer(depth: number): DepthLayer {
    const drops: Drop[] = new Array(DROPS_PER_LAYER);
    const fontSize = BASE_FONT_SIZE + depth * 8; // Closer = larger
    const speed = 0.5 + depth * 2; // Closer = faster
    const opacity = 0.3 + depth * 0.5; // Closer = more opaque

    // Color shifts from dark green (far) to bright cyan (near)
    const greenValue = Math.floor(100 + depth * 155);
    const blueValue = Math.floor(depth * 100);
    const color = `rgba(0, ${greenValue}, ${blueValue}, ${opacity})`;

    for (let i = 0; i < DROPS_PER_LAYER; i++) {
      drops[i] = {
        x: Math.random() * this.width,
        y: Math.random() * this.height - this.height,
        char: CHARSET[Math.floor(Math.random() * CHARSET.length)],
        offset: Math.random() * 100,
      };
    }

    return {
      drops,
      depth,
      speed,
      opacity,
      fontSize,
      color,
    };
  }

  private updateLayer(layer: DepthLayer, deltaMs: number, parallaxX: number, parallaxY: number): void {
    const columnWidth = layer.fontSize;

    for (let i = 0; i < layer.drops.length; i++) {
      const drop = layer.drops[i];

      // Update vertical position
      drop.y += (layer.speed * deltaMs) / 16;

      // Reset if off screen
      if (drop.y > this.height + layer.fontSize) {
        drop.y = -layer.fontSize;
        drop.x = Math.random() * this.width;
        drop.char = CHARSET[Math.floor(Math.random() * CHARSET.length)];
      }

      // Occasionally change character
      if (Math.random() < 0.01) {
        drop.char = CHARSET[Math.floor(Math.random() * CHARSET.length)];
      }
    }
  }

  render(deltaMs: number, _totalMs: number): void {
    if (!this.ctx) return;

    // Clear with fade for trails
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Calculate parallax offset based on mouse position
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    this.targetOffsetX = (this.mouseX - centerX) * PARALLAX_STRENGTH;
    this.targetOffsetY = (this.mouseY - centerY) * PARALLAX_STRENGTH;

    // Smooth interpolation for parallax
    this.currentOffsetX += (this.targetOffsetX - this.currentOffsetX) * 0.1;
    this.currentOffsetY += (this.targetOffsetY - this.currentOffsetY) * 0.1;

    // Render layers from far to near
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex++) {
      const layer = this.layers[layerIndex];

      // Calculate layer-specific parallax (closer layers move more)
      const layerParallaxX = this.currentOffsetX * layer.depth;
      const layerParallaxY = this.currentOffsetY * layer.depth;

      this.updateLayer(layer, deltaMs, layerParallaxX, layerParallaxY);

      // Set font for this layer
      this.ctx.font = `${layer.fontSize}px monospace`;
      this.ctx.fillStyle = layer.color;

      // Render drops with parallax offset
      for (let i = 0; i < layer.drops.length; i++) {
        const drop = layer.drops[i];
        const renderX = drop.x + layerParallaxX;
        const renderY = drop.y + layerParallaxY;

        // Skip if off screen
        if (renderX < -layer.fontSize || renderX > this.width + layer.fontSize) {
          continue;
        }
        if (renderY < -layer.fontSize || renderY > this.height + layer.fontSize) {
          continue;
        }

        this.ctx.fillText(drop.char, renderX, renderY);
      }

      // Add subtle depth blur for far layers
      if (layer.depth < 0.5) {
        this.ctx.shadowBlur = (1 - layer.depth * 2) * 2;
        this.ctx.shadowColor = layer.color;
      } else {
        this.ctx.shadowBlur = 0;
      }
    }

    // Reset shadow
    this.ctx.shadowBlur = 0;
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;

    // Recreate layers with new dimensions
    this.layers = [];
    for (let i = 0; i < NUM_LAYERS; i++) {
      const depth = i / (NUM_LAYERS - 1);
      this.layers.push(this.createLayer(depth));
    }
  }

  dispose(): void {
    this.layers = [];
    this.ctx = null;
  }
}
