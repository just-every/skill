import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';
import { createLogoMaskSampler, LogoMaskSampler } from './utils/LogoMask';

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
  logoSignal: number;
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ01';
const NUM_LAYERS = 4;
const DROPS_PER_LAYER = 80;
const BASE_FONT_SIZE = 10;
const PARALLAX_STRENGTH = 0.15;
const LOGO_SAMPLE_THRESHOLD = 0.25;
const LOGO_BIAS_FAR = 0.45;
const LOGO_BIAS_NEAR = 0.78;

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
  private pixelRatio = 1;
  private logoMask: LogoMaskSampler | null = null;
  private logoMaskLoadId = 0;
  private logoBounds = { left: 0, top: 0, width: 0, height: 0 };

  init({ ctx, width, height, pixelRatio }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio ?? 1;
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

    this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
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
        logoSignal: 0,
      };
      this.seedDrop(drops[i], depth, fontSize, true);
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
        drop.char = CHARSET[Math.floor(Math.random() * CHARSET.length)];
        this.seedDrop(drop, layer.depth, layer.fontSize, false);
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

        const maskSample = this.logoMask?.sampleCanvas(renderX, renderY) ?? drop.logoSignal;
        drop.logoSignal = maskSample;
        const insideLogo = maskSample > LOGO_SAMPLE_THRESHOLD;

        if (insideLogo && layer.depth >= 0.4) {
          const boostedOpacity = Math.min(1, layer.opacity * 0.85 + maskSample * 0.4);
          const green = 120 + Math.floor(maskSample * 110) + Math.floor(layer.depth * 40);
          const blue = 50 + Math.floor(maskSample * 120);
          this.ctx.fillStyle = `rgba(60, ${green}, ${blue}, ${boostedOpacity})`;
          if (layer.depth > 0.75) {
            this.ctx.shadowBlur = 10 * maskSample;
            this.ctx.shadowColor = `rgba(0, 255, 200, ${maskSample * 0.25})`;
          } else {
            this.ctx.shadowBlur = 0;
          }
        } else {
          this.ctx.fillStyle = layer.color;
          if (layer.depth < 0.5) {
            this.ctx.shadowBlur = (1 - layer.depth * 2) * 2;
            this.ctx.shadowColor = layer.color;
          } else {
            this.ctx.shadowBlur = 0;
          }
        }

        this.ctx.fillText(drop.char, renderX, renderY);
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
    this.pixelRatio = size.pixelRatio ?? this.pixelRatio;

    // Recreate layers with new dimensions
    this.layers = [];
    for (let i = 0; i < NUM_LAYERS; i++) {
      const depth = i / (NUM_LAYERS - 1);
      this.layers.push(this.createLayer(depth));
    }

    if (this.logoMask) {
      this.logoMask.updateViewport({
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
      });
      this.updateLogoBounds();
      this.reseedAllDrops();
    } else {
      this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
    }
  }

  dispose(): void {
    this.layers = [];
    this.ctx = null;
    this.logoMask = null;
  }

  private ensureLogoMask(size: EffectSize): void {
    const loadId = ++this.logoMaskLoadId;
    void createLogoMaskSampler({
      width: size.width,
      height: size.height,
      pixelRatio: size.pixelRatio,
    })
      .then((sampler) => {
        if (loadId !== this.logoMaskLoadId) return;
        this.logoMask = sampler;
        this.updateLogoBounds();
        this.reseedAllDrops();
      })
      .catch((error) => console.warn('[ParallaxDepthRain] Failed to load logo mask', error));
  }

  private updateLogoBounds(): void {
    if (!this.logoMask) {
      this.logoBounds = { left: 0, top: 0, width: 0, height: 0 };
      return;
    }
    this.logoBounds = this.logoMask.getCanvasBounds();
  }

  private reseedAllDrops(): void {
    if (!this.logoMask) return;
    for (const layer of this.layers) {
      for (const drop of layer.drops) {
        this.seedDrop(drop, layer.depth, layer.fontSize, true);
      }
    }
  }

  private seedDrop(drop: Drop, depth: number, fontSize: number, initial: boolean): void {
    const bias = this.getLogoBias(depth);
    if (this.logoMask && Math.random() < bias) {
      const sample = this.logoMask.sampleRandomPointInLogo(LOGO_SAMPLE_THRESHOLD, 12);
      if (sample) {
        const jitterX = (Math.random() - 0.5) * fontSize * 0.8;
        const jitterY = (Math.random() - 0.5) * fontSize * (initial ? 1.2 : 0.4);
        const baseY = initial
          ? sample.y + jitterY
          : sample.y - fontSize * (0.3 + depth * 0.4) + jitterY;
        drop.x = Math.max(0, Math.min(this.width, sample.x + jitterX));
        drop.y = Math.max(-fontSize * 2, Math.min(this.height, baseY));
        drop.logoSignal = sample.intensity;
        return;
      }
    }

    drop.x = Math.random() * this.width;
    drop.y = initial ? Math.random() * this.height - this.height : -fontSize;
    drop.logoSignal = 0;
  }

  private getLogoBias(depth: number): number {
    return LOGO_BIAS_FAR + (LOGO_BIAS_NEAR - LOGO_BIAS_FAR) * depth;
  }
}
