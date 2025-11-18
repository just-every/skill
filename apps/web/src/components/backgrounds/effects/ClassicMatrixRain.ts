import type {
  EffectInitContext,
  EffectPointerEvent,
  EffectSize,
  VisualEffect
} from './types';
import { createLogoMaskSampler, LogoMaskSampler } from './utils/LogoMask';

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
  logoBias: number;
}

const CHARSET = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_STREAMS = 200;
const FONT_SIZE = 14;
const LOGO_PRIORITY = 0.78;
const LOGO_SAMPLE_THRESHOLD = 0.22;
const COLUMN_SAMPLE_MIN = 6;

export class ClassicMatrixRain implements VisualEffect {
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private streams: Stream[] = [];
  private columns = 0;
  private mouseX = 0;
  private mouseY = 0;
  private mouseInfluence = 0;
  private pixelRatio = 1;
  private logoMask: LogoMaskSampler | null = null;
  private logoMaskLoadId = 0;
  private logoColumnRawCoverage: number[] = [];
  private logoColumnWeights: number[] = [];
  private logoColumnWeightTotal = 0;

  init({ ctx, width, height, pixelRatio }: EffectInitContext): void {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio ?? 1;
    this.columns = Math.max(1, Math.floor(this.width / FONT_SIZE));

    // Initialize streams array with fixed size
    this.streams = new Array(MAX_STREAMS);
    for (let i = 0; i < MAX_STREAMS; i++) {
      this.streams[i] = this.createStream(true);
    }

    // Configure canvas for rendering
    this.ctx.font = `${FONT_SIZE}px monospace`;
    this.ctx.textBaseline = 'top';

    this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
  }

  private createStream(initial = false): Stream {
    const length = Math.floor(Math.random() * 20) + 10;
    const stream: Stream = {
      x: 0,
      y: -Math.random() * this.height,
      speed: Math.random() * 2 + 1,
      length,
      chars: Array(length)
        .fill(0)
        .map(() => CHARSET[Math.floor(Math.random() * CHARSET.length)]),
      logoBias: 0,
    };

    this.resetStream(stream, initial);
    return stream;
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
      this.resetStream(stream);
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

    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';

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
        const charCenterX = stream.x + FONT_SIZE * 0.5;
        const charCenterY = charY + FONT_SIZE * 0.5;
        const maskSample = this.logoMask?.sampleCanvas(charCenterX, charCenterY) ?? 0;
        const insideLogo = maskSample > LOGO_SAMPLE_THRESHOLD;
        const boostedOpacity = insideLogo
          ? Math.min(1, opacity * 0.9 + maskSample * 0.45)
          : opacity;

        // Head character is bright white, rest are green
        if (j === 0) {
          if (insideLogo) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${boostedOpacity})`;
            this.ctx.shadowColor = `rgba(0, 255, 200, ${maskSample * 0.35})`;
            this.ctx.shadowBlur = 12 * maskSample;
          } else {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            this.ctx.shadowBlur = 0;
          }
        } else {
          if (insideLogo) {
            const teal = 150 + Math.floor(maskSample * 80);
            const green = 220 + Math.floor(maskSample * 35);
            this.ctx.fillStyle = `rgba(70, ${green}, ${teal}, ${boostedOpacity})`;
            this.ctx.shadowColor = `rgba(0, 255, 200, ${maskSample * 0.25})`;
            this.ctx.shadowBlur = 10 * maskSample;
          } else {
            this.ctx.fillStyle = `rgba(0, 255, 70, ${opacity * 0.8})`;
            this.ctx.shadowBlur = 0;
          }
        }

        this.ctx.fillText(stream.chars[j], stream.x, charY);

        if (!insideLogo) {
          this.ctx.shadowBlur = 0;
        }
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
    this.pixelRatio = size.pixelRatio ?? this.pixelRatio;
    this.columns = Math.max(1, Math.floor(this.width / FONT_SIZE));

    // Re-initialize streams with new dimensions
    for (let i = 0; i < this.streams.length; i++) {
      this.streams[i] = this.createStream(true);
    }

    if (this.logoMask) {
      this.logoMask.updateViewport({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
      this.recomputeLogoColumnCoverage();
    } else {
      this.ensureLogoMask({ width: this.width, height: this.height, pixelRatio: this.pixelRatio });
    }
  }

  dispose(): void {
    this.streams = [];
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
        this.recomputeLogoColumnCoverage();
      })
      .catch((error) => {
        console.warn('[ClassicMatrixRain] Failed to load CODE logo mask', error);
      });
  }

  private resetStream(stream: Stream, initial = false): void {
    const columnIndex = this.pickColumnIndex();
    stream.x = columnIndex * FONT_SIZE;
    stream.logoBias = this.logoColumnRawCoverage[columnIndex] ?? 0;
    stream.speed = this.computeLogoAwareSpeed(stream.logoBias);
    stream.y = initial ? -Math.random() * this.height : -stream.length * FONT_SIZE;
  }

  private pickColumnIndex(): number {
    if (!this.logoMask || !this.logoColumnWeights.length || this.logoColumnWeightTotal === 0) {
      return Math.floor(Math.random() * this.columns);
    }

    const prioritizeLogo = Math.random() < LOGO_PRIORITY;
    if (!prioritizeLogo) {
      return Math.floor(Math.random() * this.columns);
    }

    let target = Math.random() * this.logoColumnWeightTotal;
    for (let i = 0; i < this.logoColumnWeights.length; i++) {
      target -= this.logoColumnWeights[i];
      if (target <= 0) {
        return i;
      }
    }

    return this.logoColumnWeights.length - 1;
  }

  private computeLogoAwareSpeed(logoBias: number): number {
    const baseSpeed = Math.random() * 2 + 1;
    if (!this.logoMask) return baseSpeed;
    const slowFactor = 1 - Math.min(logoBias, 1) * 0.55;
    return Math.max(0.5, baseSpeed * slowFactor);
  }

  private recomputeLogoColumnCoverage(): void {
    if (!this.logoMask || this.columns <= 0) {
      this.logoColumnRawCoverage = [];
      this.logoColumnWeights = [];
      this.logoColumnWeightTotal = 0;
      return;
    }

    const samples = Math.max(
      COLUMN_SAMPLE_MIN,
      Math.round((this.height * (this.logoMask ? 1 : 0)) / 90)
    );
    const rawCoverage: number[] = new Array(this.columns).fill(0);
    const weights: number[] = new Array(this.columns).fill(0);
    let totalWeight = 0;

    for (let column = 0; column < this.columns; column++) {
      const columnX = column * FONT_SIZE;
      const density = this.logoMask.sampleColumnDensity(columnX, FONT_SIZE, samples);
      rawCoverage[column] = density;
      const weight = density * 0.9 + 0.05;
      weights[column] = weight;
      totalWeight += weight;
    }

    this.logoColumnRawCoverage = rawCoverage;
    this.logoColumnWeights = weights;
    this.logoColumnWeightTotal = totalWeight;
    this.syncStreamsWithCoverage();
  }

  private syncStreamsWithCoverage(): void {
    if (!this.logoColumnRawCoverage.length) return;
    for (let i = 0; i < this.streams.length; i++) {
      const stream = this.streams[i];
      const columnIndex = Math.max(0, Math.min(this.columns - 1, Math.floor(stream.x / FONT_SIZE)));
      stream.logoBias = this.logoColumnRawCoverage[columnIndex] ?? 0;
      stream.speed = this.computeLogoAwareSpeed(stream.logoBias);
    }
  }
}
