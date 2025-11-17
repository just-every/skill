import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';

/**
 * Classic Matrix-style vertical cascading rain effect.
 * Features vertical streams of green glyphs falling at varying speeds
 * with brighter lead characters and fading trails.
 */

interface Stream {
  x: number;
  y: number;
  speed: number;
  length: number;
  chars: string[];
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_STREAMS = 200;
const FONT_SIZE = 14;

export class ClassicMatrixRain implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private streams: Stream[] = [];
  private columns = 0;
  private mouseX = 0;
  private mouseY = 0;
  private mouseInfluence = 0;

  init({ ctx, width, height }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.columns = Math.floor(this.width / FONT_SIZE);

    // Initialize streams array with fixed size
    this.streams = new Array(MAX_STREAMS);
    for (let i = 0; i < MAX_STREAMS; i++) {
      this.streams[i] = this.createStream();
    }

    // Configure canvas for rendering
    this.ctx.font = `${FONT_SIZE}px monospace`;
    this.ctx.textBaseline = 'top';
  }

  private createStream(): Stream {
    const length = Math.floor(Math.random() * 20) + 10;
    return {
      x: Math.floor(Math.random() * this.columns) * FONT_SIZE,
      y: -Math.random() * this.height,
      speed: Math.random() * 2 + 1,
      length,
      chars: Array(length)
        .fill(0)
        .map(() => CHARSET[Math.floor(Math.random() * CHARSET.length)]),
    };
  }

  private updateStream(stream: Stream, deltaMs: number): void {
    // Apply mouse influence - slow down streams near mouse
    const distanceToMouse = Math.abs(stream.x - this.mouseX);
    const influenceRadius = 100;
    const slowdown =
      distanceToMouse < influenceRadius
        ? 1 - (this.mouseInfluence * (influenceRadius - distanceToMouse)) / influenceRadius
        : 1;

    stream.y += (stream.speed * deltaMs * slowdown) / 16;

    // Reset stream when it falls off screen
    if (stream.y > this.height + stream.length * FONT_SIZE) {
      stream.x = Math.floor(Math.random() * this.columns) * FONT_SIZE;
      stream.y = -stream.length * FONT_SIZE;
      stream.speed = Math.random() * 2 + 1;
    }

    // Randomly mutate characters for dynamic effect
    if (Math.random() < 0.05) {
      const idx = Math.floor(Math.random() * stream.chars.length);
      stream.chars[idx] = CHARSET[Math.floor(Math.random() * CHARSET.length)];
    }
  }

  render(deltaMs: number, _totalMs: number): void {
    if (!this.ctx) return;

    // Semi-transparent black for trail effect
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Decay mouse influence
    this.mouseInfluence *= 0.95;

    // Update and render all streams
    for (let i = 0; i < this.streams.length; i++) {
      const stream = this.streams[i];
      this.updateStream(stream, deltaMs);

      // Draw stream characters
      for (let j = 0; j < stream.chars.length; j++) {
        const charY = stream.y + j * FONT_SIZE;

        // Skip if off screen
        if (charY < -FONT_SIZE || charY > this.height) continue;

        // Calculate opacity - brightest at head, fading toward tail
        const fade = 1 - j / stream.chars.length;
        const opacity = Math.max(0, Math.min(1, fade));

        // Head character is bright white, rest are green
        if (j === 0) {
          this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        } else {
          this.ctx.fillStyle = `rgba(0, 255, 70, ${opacity * 0.8})`;
        }

        this.ctx.fillText(stream.chars[j], stream.x, charY);
      }
    }
  }

  handlePointer(event: EffectPointerEvent): void {
    this.mouseX = event.x;
    this.mouseY = event.y;

    // Increase influence on mouse movement
    if (event.type === 'move') {
      this.mouseInfluence = Math.min(1, this.mouseInfluence + 0.3);
    }
  }

  resize(size: EffectSize): void {
    this.width = size.width;
    this.height = size.height;
    this.columns = Math.floor(this.width / FONT_SIZE);

    // Re-initialize streams with new dimensions
    for (let i = 0; i < this.streams.length; i++) {
      this.streams[i] = this.createStream();
    }
  }

  dispose(): void {
    this.streams = [];
    this.ctx = null;
  }
}
